// ==============================================================================
// AUTOPILOT ENGINE & MULTI-FREQUENCY SCHEDULER
// ==============================================================================

class AutopilotEngine {
    constructor() {
        this.mode = localStorage.getItem('meta_ai_mode') || 'ASSISTED'; // SAFE, ASSISTED, SEMI_AUTO, AUTOPILOT
        this.intervalMinutes = parseInt(localStorage.getItem('meta_ai_interval') || '60');
        this.isDryRun = localStorage.getItem('meta_ai_dryrun') === 'true';
        this.timerId = null;
        this.isRunningCycle = false;
        this.lastCycleReport = null;
    }

    setMode(newMode) {
        this.mode = newMode;
        localStorage.setItem('meta_ai_mode', newMode);
        window.auditEngine?.logAction({
            action: 'MODE_CHANGE',
            before: this.mode,
            after: newMode,
            reason: `Modo de autonomia alterado pelo operador para ${newMode}.`,
            risk: newMode === 'AUTOPILOT' ? 'HIGH' : 'LOW'
        });
        window.dispatchEvent(new CustomEvent('ai_mode_changed', { detail: newMode }));
    }

    setDryRun(enabled) {
        this.isDryRun = enabled;
        localStorage.setItem('meta_ai_dryrun', enabled ? 'true' : 'false');
    }

    startScheduler() {
        if (this.timerId) clearInterval(this.timerId);
        const ms = this.intervalMinutes * 60 * 1000;
        this.timerId = setInterval(() => {
            this.runCycle();
        }, ms);
    }

    stopScheduler() {
        if (this.timerId) {
            clearInterval(this.timerId);
            this.timerId = null;
        }
    }

    // Execução do Ciclo Autônomo Completo
    async runCycle(forceManual = false) {
        if (this.isRunningCycle) return { status: 'ALREADY_RUNNING' };
        if (window.guardrailEngine?.isEmergencyStopped()) {
            return { status: 'BLOCKED_BY_EMERGENCY_STOP' };
        }

        this.isRunningCycle = true;
        const cycleId = `CYCLE_${Date.now()}`;
        const startTime = new Date();

        window.dispatchEvent(new CustomEvent('ai_cycle_started', { detail: { cycleId } }));

        const report = {
            cycleId,
            timestamp: startTime.toISOString(),
            mode: this.mode,
            dryRun: this.isDryRun,
            campaignsEvaluated: 0,
            actionsTaken: [],
            actionsQueued: [],
            diagnostics: []
        };

        try {
            const { adAccountId } = window.metaAdapter.getStoredCredentials();
            const targetCPA = window.guardrailEngine.config.targetCPA;

            // 1. SYNC
            const campRes = await window.metaAdapter.getCampaigns(adAccountId, 30);
            const campaigns = campRes.data || [];
            report.campaignsEvaluated = campaigns.length;

            const evaluatedList = [];

            // 2. ANALYZE
            for (const camp of campaigns) {
                if (camp.status !== 'ACTIVE') continue;

                const [insToday, ins7d] = await Promise.all([
                    window.metaAdapter.getInsights(camp.id, 'today'),
                    window.metaAdapter.getInsights(camp.id, 'last_7d')
                ]);

                const parsedToday = window.analyticsEngine.parseInsights(insToday?.data?.[0]);
                const parsed7d = window.analyticsEngine.parseInsights(ins7d?.data?.[0]);

                evaluatedList.push({
                    campaign: camp,
                    insightsToday: parsedToday,
                    insights7d: parsed7d
                });

                const diag = window.decisionEngine.diagnoseCampaign(camp.name, parsedToday, parsed7d, targetCPA);
                report.diagnostics.push(diag);

                // 3. DECIDE & GUARDRAILS
                if (diag.actionType === 'PAUSE') {
                    const stopLossCheck = window.guardrailEngine.validateStopLoss(camp.id, parsedToday.spend, parsedToday.purchases, targetCPA);
                    if (stopLossCheck.allowed) {
                        if (this.mode === 'AUTOPILOT' && !this.isDryRun) {
                            await window.executionEngine.executeStatusChange(camp.id, 'PAUSED', diag.evidence.join(' '), this.mode);
                            report.actionsTaken.push(`Pausada campanha "${camp.name}" por Stop-Loss.`);
                        } else if (this.mode === 'ASSISTED' || this.isDryRun) {
                            window.executionEngine.enqueueApproval({
                                type: 'PAUSE',
                                campaignId: camp.id,
                                campaignName: camp.name,
                                reason: diag.evidence.join(' '),
                                risk: 'MEDIUM'
                            });
                            report.actionsQueued.push(`Pausar "${camp.name}" (Aguardando Aprovação)`);
                        }
                    }
                } else if (diag.actionType === 'SCALE_BUDGET' && camp.daily_budget) {
                    const curBudgetCents = parseInt(camp.daily_budget);
                    const proposedBudgetCents = Math.round(curBudgetCents * 1.15); // +15%
                    const valCheck = window.guardrailEngine.validateBudgetChange(camp.id, curBudgetCents, proposedBudgetCents);

                    if (valCheck.allowed) {
                        if (this.mode === 'AUTOPILOT' && !this.isDryRun) {
                            await window.executionEngine.executeBudgetChange(camp.id, 'daily_budget', proposedBudgetCents, diag.evidence.join(' '), this.mode);
                            report.actionsTaken.push(`Escalado orçamento de "${camp.name}" (+15%).`);
                        } else if (this.mode === 'ASSISTED' || this.isDryRun) {
                            window.executionEngine.enqueueApproval({
                                type: 'SCALE_BUDGET',
                                campaignId: camp.id,
                                campaignName: camp.name,
                                before: `R$ ${(curBudgetCents / 100).toFixed(2)}/dia`,
                                after: `R$ ${(proposedBudgetCents / 100).toFixed(2)}/dia`,
                                reason: diag.evidence.join(' '),
                                risk: 'LOW'
                            });
                            report.actionsQueued.push(`Aumentar orçamento de "${camp.name}" (Aguardando Aprovação)`);
                        }
                    }
                }
            }

            this.lastCycleReport = report;
            window.dispatchEvent(new CustomEvent('ai_cycle_completed', { detail: report }));

            window.auditEngine?.logAction({
                action: 'AUTOPILOT_CYCLE',
                reason: `Ciclo autônomo executado. ${report.campaignsEvaluated} campanhas analisadas, ${report.actionsTaken.length} ações executadas, ${report.actionsQueued.length} na fila.`,
                risk: 'LOW',
                verification: 'SUCCESS'
            });

            return { success: true, report };

        } catch (err) {
            console.error('[Autopilot Error]', err);
            window.dispatchEvent(new CustomEvent('ai_cycle_error', { detail: err }));
            return { success: false, error: err.message };
        } finally {
            this.isRunningCycle = false;
        }
    }
}

// Instância Singleton
window.autopilotEngine = new AutopilotEngine();
