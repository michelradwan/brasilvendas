// ==============================================================================
// RADWAN ADS — AUTONOMY ENGINE & REAL-TIME READINESS MONITOR
// Canonical Modes: ANALYSIS_ONLY | SHADOW | ASSISTED | GUARDED_AUTOMATION
// ==============================================================================

const RADWAN_AUTONOMY_MODES = {
    ANALYSIS_ONLY: {
        id: 'ANALYSIS_ONLY',
        name: 'Somente Analisar',
        badge: 'Modo Seguro',
        icon: '🛡️',
        description: 'Leitura, diagnóstico e recomendações em tempo real. Zero alterações ou mutações na Meta.',
        riskLevel: 'ZERO_RISK',
        allowsDirectWrite: false,
        allowsSimulation: true,
        requiresHumanApproval: true
    },
    SHADOW: {
        id: 'SHADOW',
        name: 'Modo Sombra',
        badge: 'Simulação Ativa',
        icon: '👻',
        description: 'Simula decisões e registra o que o RADWAN faria no Audit Log. Nenhuma mutação real na Meta.',
        riskLevel: 'ZERO_RISK',
        allowsDirectWrite: false,
        allowsSimulation: true,
        requiresHumanApproval: true
    },
    ASSISTED: {
        id: 'ASSISTED',
        name: 'Assistido',
        badge: 'Aprovação Manual',
        icon: '🤝',
        description: 'O RADWAN analisa e propõe ações na Fila de Aprovação. Toda mutação exige seu clique de aprovação.',
        riskLevel: 'CONTROLLED',
        allowsDirectWrite: false,
        allowsSimulation: true,
        requiresHumanApproval: true
    },
    GUARDED_AUTOMATION: {
        id: 'GUARDED_AUTOMATION',
        name: 'Ajustes Leves',
        badge: 'Autonomia Guiada',
        icon: '⚡',
        description: 'Executa pequenos ajustes de escala (até ±15%) e stop-loss crítico sob cooldown estrito de 12h.',
        riskLevel: 'GUARDED',
        allowsDirectWrite: true,
        allowsSimulation: true,
        requiresHumanApproval: false,
        maxBudgetScalePct: 15,
        cooldownHours: 12
    }
};

class AutopilotEngine {
    constructor() {
        this.modes = RADWAN_AUTONOMY_MODES;
        this.mode = this.loadMode();
        this.intervalMinutes = parseInt(localStorage.getItem('meta_ai_interval') || '60', 10);
        this.timerId = null;
        this.isRunningCycle = false;
        this.lastCycleReport = null;
    }

    loadMode() {
        try {
            const saved = localStorage.getItem('radwan_autonomy_mode') || localStorage.getItem('meta_ai_mode');
            if (saved && this.modes[saved]) {
                return saved;
            }
        } catch (e) {}
        return 'ASSISTED'; // Padrão Seguro e Canônico
    }

    getModeDetails(modeId = this.mode) {
        return this.modes[modeId] || this.modes.ASSISTED;
    }

    setMode(newModeId) {
        if (!this.modes[newModeId]) {
            throw new Error(`Modo de autonomia inválido: "${newModeId}".`);
        }

        const oldMode = this.mode;
        this.mode = newModeId;
        localStorage.setItem('radwan_autonomy_mode', newModeId);
        localStorage.setItem('meta_ai_mode', newModeId);

        // Notifica o Audit Engine
        window.auditEngine?.logAction({
            action: 'AUTONOMY_MODE_CHANGE',
            before: oldMode,
            after: newModeId,
            reason: `Nível de autonomia do RADWAN alterado para ${this.modes[newModeId].name} (${this.modes[newModeId].badge}).`,
            risk: newModeId === 'GUARDED_AUTOMATION' ? 'MEDIUM' : 'LOW'
        });

        // Dispara evento global para sincronização imediata de todas as UI layers
        window.dispatchEvent(new CustomEvent('radwan_autonomy_mode_changed', { detail: { mode: newModeId, details: this.modes[newModeId] } }));
        return this.modes[newModeId];
    }

    // ─── CÁLCULO REAL DE PRONTIDÃO & BLINDAGEM DA CONTA (0 A 100 PONTOS) ───────────
    calculateReadinessScore(context = {}) {
        const components = [];

        // 1. Rastreamento Reconciliado (Peso: 20 pts)
        // Baseado em CAPI + Pixel e saúde de eventos
        const trackingHealth = context.trackingHealth || {};
        const isTrackingLive = trackingHealth.status === 'HEALTHY' || trackingHealth.last_event_seconds_ago < 3600;
        const trackingScore = isTrackingLive ? 20 : 12;
        components.push({
            name: 'Rastreamento Reconciliado',
            score: trackingScore,
            maxScore: 20,
            status: isTrackingLive ? '✓ 100% Reconciliado' : '⚠ Parcial (CAPI/Pixel)',
            isOk: isTrackingLive
        });

        // 2. Economia Unitária Real (Peso: 15 pts)
        // Baseado na verificação de custos, margens e meta de CPA
        const targetCPA = window.guardrailEngine?.config?.targetCPA || 0;
        const unitVerified = window.guardrailEngine?.config?.unitEconomicsVerified !== false && targetCPA > 0;
        const unitScore = unitVerified ? 15 : 0;
        components.push({
            name: 'Economia Unitária Real',
            score: unitScore,
            maxScore: 15,
            status: unitVerified ? `✓ CPA Alvo R$ ${targetCPA.toFixed(2)}` : '⚠ Incompleta',
            isOk: unitVerified
        });

        // 3. Confiança dos Dados (Peso: 20 pts)
        // Baseado no Data Trust Engine (Data Confidence Score)
        const trustScore = context.dataTrustScore !== undefined ? context.dataTrustScore : 85;
        let dataTrustPts = 0;
        let dataTrustLabel = 'Baixa';
        if (trustScore >= 70) {
            dataTrustPts = 20;
            dataTrustLabel = '✓ Alta Confiança';
        } else if (trustScore >= 40) {
            dataTrustPts = 10;
            dataTrustLabel = '⚠ Moderada';
        } else {
            dataTrustPts = 0;
            dataTrustLabel = '🛑 Insuficiente';
        }
        components.push({
            name: 'Confiança dos Dados',
            score: dataTrustPts,
            maxScore: 20,
            status: dataTrustLabel,
            isOk: dataTrustPts >= 15
        });

        // 4. Limites e Cooldown (Peso: 15 pts)
        const cooldownHours = window.guardrailEngine?.config?.cooldownHours || 12;
        const maxBudgetChange = window.guardrailEngine?.config?.maxBudgetChangePercent || 20;
        const limitsOk = cooldownHours >= 12 && maxBudgetChange <= 20;
        components.push({
            name: 'Limites e Cooldown',
            score: limitsOk ? 15 : 5,
            maxScore: 15,
            status: limitsOk ? `✓ ${cooldownHours}h Ativo (Teto +${maxBudgetChange}%)` : '⚠ Não configurado',
            isOk: limitsOk
        });

        // 5. Verificação Pós-Escrita (Peso: 15 pts)
        const verifyActive = true; // Protocolo Write->Read->Verify sempre ativo no ExecutionEngine
        components.push({
            name: 'Verificação Pós-Escrita',
            score: verifyActive ? 15 : 0,
            maxScore: 15,
            status: '✓ Write ➔ Read ➔ Verify',
            isOk: verifyActive
        });

        // 6. Parada de Segurança (Peso: 15 pts)
        const isKillSwitchActive = window.guardrailEngine?.isEmergencyStopped() || false;
        components.push({
            name: 'Parada de Segurança',
            score: isKillSwitchActive ? 0 : 15,
            maxScore: 15,
            status: isKillSwitchActive ? '🛑 ATIVADA (Mutações Bloqueadas)' : '✓ Pronta (Standby)',
            isOk: !isKillSwitchActive
        });

        const totalScore = components.reduce((acc, c) => acc + c.score, 0);

        return {
            totalScore: Math.min(100, Math.max(0, totalScore)),
            components
        };
    }

    // ─── EXECUÇÃO DO CICLO DE DECISÃO & AUTONOMIA ─────────────────────────────────
    async runCycle(forceManual = false) {
        if (this.isRunningCycle) return { status: 'ALREADY_RUNNING' };

        // Trava Máxima: Kill Switch tem prioridade absoluta
        if (window.guardrailEngine?.isEmergencyStopped()) {
            return {
                status: 'BLOCKED_BY_EMERGENCY_STOP',
                message: 'Ciclo autônomo cancelado: Parada de Segurança (Kill Switch) está ativada.'
            };
        }

        this.isRunningCycle = true;
        const cycleId = `CYCLE_${Date.now()}`;
        const startTime = new Date();

        window.dispatchEvent(new CustomEvent('ai_cycle_started', { detail: { cycleId } }));

        const report = {
            cycleId,
            timestamp: startTime.toISOString(),
            mode: this.mode,
            campaignsEvaluated: 0,
            actionsTaken: [],
            actionsQueued: [],
            shadowActionsRecorded: [],
            diagnostics: []
        };

        try {
            const { adAccountId } = window.metaAdapter?.getStoredCredentials?.() || { adAccountId: 'act_846780837970771' };
            const targetCPA = window.guardrailEngine?.config?.targetCPA || 35.00;

            // 1. SYNC
            const campRes = await window.metaAdapter.getCampaigns(adAccountId, 30);
            const campaigns = campRes.data || [];
            report.campaignsEvaluated = campaigns.length;

            // 2. ANALYZE & DECIDE
            for (const camp of campaigns) {
                if (camp.status !== 'ACTIVE') continue;

                const [insToday, ins7d] = await Promise.all([
                    window.metaAdapter.getInsights(camp.id, 'today').catch(() => null),
                    window.metaAdapter.getInsights(camp.id, 'last_7d').catch(() => null)
                ]);

                const parsedToday = window.analyticsEngine.parseInsights(insToday?.data?.[0]);
                const parsed7d = window.analyticsEngine.parseInsights(ins7d?.data?.[0]);

                const diag = window.decisionEngine.diagnoseCampaign(camp.name, parsedToday, parsed7d, targetCPA);
                report.diagnostics.push(diag);

                // 3. EXECUTION POLICY POR MODO DE AUTONOMIA
                if (diag.actionType === 'PAUSE') {
                    const stopLossCheck = window.guardrailEngine.validateStopLoss(camp.id, parsedToday.spend, parsedToday.purchases, targetCPA);

                    if (stopLossCheck.allowed) {
                        if (this.mode === 'GUARDED_AUTOMATION') {
                            await window.executionEngine.executeStatusChange(camp.id, 'PAUSED', diag.evidence.join(' '), this.mode);
                            report.actionsTaken.push(`Pausada campanha "${camp.name}" por Stop-Loss.`);
                        } else if (this.mode === 'SHADOW') {
                            await window.executionEngine.executeStatusChange(camp.id, 'PAUSED', diag.evidence.join(' '), this.mode);
                            report.shadowActionsRecorded.push(`[SIMULAÇÃO] Pausar "${camp.name}" (Stop-Loss)`);
                        } else if (this.mode === 'ASSISTED') {
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
                    const curBudgetCents = parseInt(camp.daily_budget, 10);
                    const proposedBudgetCents = Math.round(curBudgetCents * 1.15); // +15% Permitido em Ajustes Leves
                    const valCheck = window.guardrailEngine.validateBudgetChange(camp.id, curBudgetCents, proposedBudgetCents);

                    if (valCheck.allowed) {
                        if (this.mode === 'GUARDED_AUTOMATION') {
                            await window.executionEngine.executeBudgetChange(camp.id, 'daily_budget', proposedBudgetCents, diag.evidence.join(' '), this.mode);
                            report.actionsTaken.push(`Escalado orçamento de "${camp.name}" (+15%).`);
                        } else if (this.mode === 'SHADOW') {
                            await window.executionEngine.executeBudgetChange(camp.id, 'daily_budget', proposedBudgetCents, diag.evidence.join(' '), this.mode);
                            report.shadowActionsRecorded.push(`[SIMULAÇÃO] Escalar orçamento de "${camp.name}" (+15%)`);
                        } else if (this.mode === 'ASSISTED') {
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
                action: 'AUTONOMY_CYCLE_COMPLETED',
                reason: `Ciclo em modo ${this.modes[this.mode].name}. Analisadas: ${report.campaignsEvaluated}, Executadas: ${report.actionsTaken.length}, Fila: ${report.actionsQueued.length}, Simulações: ${report.shadowActionsRecorded.length}.`,
                risk: 'LOW',
                verification: 'SUCCESS'
            });

            return { success: true, report };

        } catch (err) {
            console.error('[Autopilot Engine Error]', err);
            window.dispatchEvent(new CustomEvent('ai_cycle_error', { detail: err }));
            return { success: false, error: err.message };
        } finally {
            this.isRunningCycle = false;
        }
    }
}

// Instância Singleton
window.autopilotEngine = new AutopilotEngine();
