// ==============================================================================
// EXECUTION ENGINE — WRITE -> READ -> VERIFY PROTOCOL
// ==============================================================================

class ExecutionEngine {
    constructor() {
        this.rollbackSnapshots = new Map();
        this.approvalQueue = [];
        this.loadApprovalQueue();
    }

    loadApprovalQueue() {
        try {
            const saved = localStorage.getItem('meta_approval_queue');
            if (saved) this.approvalQueue = JSON.parse(saved);
        } catch(e){}
    }

    saveApprovalQueue() {
        localStorage.setItem('meta_approval_queue', JSON.stringify(this.approvalQueue));
    }

    // Adicionar item à Fila de Aprovação (Modo Assistido)
    enqueueApproval(actionItem) {
        const item = {
            id: `APPR_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            createdAt: new Date().toISOString(),
            status: 'PENDING',
            ...actionItem
        };
        this.approvalQueue.unshift(item);
        this.saveApprovalQueue();
        return item;
    }

    removeApproval(id) {
        this.approvalQueue = this.approvalQueue.filter(i => i.id !== id);
        this.saveApprovalQueue();
    }

    // Protocolo Write -> Read -> Verify para Alteração de Status
    async executeStatusChange(campaignId, newStatus, reason = 'Ação manual do operador', mode = null, isDryRun = false) {
        // 1. Trava Absoluta de Kill Switch
        if (window.guardrailEngine?.isEmergencyStopped()) {
            throw new Error('EMERGENCY_STOP_BLOCKED: Mutações bloqueadas pela Parada de Segurança (Kill Switch).');
        }

        const activeMode = mode || window.autopilotEngine?.mode || 'ASSISTED';

        // 2. Trava de Modo Somente Analisar
        if (activeMode === 'ANALYSIS_ONLY') {
            throw new Error('BLOCKED_BY_AUTONOMY_POLICY: O RADWAN está em Modo "Somente Analisar". Nenhuma alteração é permitida.');
        }

        // 3. Trava de Modo Sombra (Simulação)
        if (isDryRun || activeMode === 'SHADOW') {
            window.auditEngine?.logAction({
                action: 'SHADOW_SIMULATION',
                objectId: campaignId,
                before: 'STATUS_UNKNOWN',
                after: newStatus,
                reason: `[MODO SOMBRA] ${reason}`,
                risk: 'ZERO_RISK',
                verification: 'SIMULATED_SUCCESS'
            });
            return {
                success: true,
                dryRun: true,
                message: `[MODO SOMBRA] Status da campanha ${campaignId} seria alterado para ${newStatus}.`,
                verification: 'SIMULATED_SUCCESS'
            };
        }

        // 4. Snapshot para Rollback
        const currentData = await window.metaAdapter.request(campaignId, 'GET', { fields: 'id,name,status' });
        this.rollbackSnapshots.set(campaignId, { type: 'STATUS', before: currentData.status, timestamp: Date.now() });

        // 5. WRITE
        const writeRes = await window.metaAdapter.updateStatus(campaignId, newStatus);
        if (!writeRes || writeRes.error || writeRes.success === false) {
            throw new Error(writeRes.error?.message || 'Falha na escrita de status na Meta.');
        }

        // 6. READ (Bypass Cache)
        const readBack = await window.metaAdapter.request(campaignId, 'GET', { fields: 'id,name,status' }, null, true);

        // 7. VERIFY
        if (readBack.status !== newStatus) {
            throw new Error(`Verificação falhou: Status esperado era "${newStatus}", mas a Meta retornou "${readBack.status}".`);
        }

        // 8. Registrar no Audit Log
        window.auditEngine?.logAction({
            action: 'STATUS_CHANGE',
            objectId: campaignId,
            objectName: currentData.name,
            before: currentData.status,
            after: newStatus,
            reason: reason,
            risk: 'LOW',
            verification: 'SUCCESS'
        });

        return {
            success: true,
            message: `Status alterado para ${newStatus} e verificado com sucesso na Meta.`,
            verification: 'VERIFIED_OK'
        };
    }

    // Protocolo Write -> Read -> Verify para Alteração de Orçamento
    async executeBudgetChange(campaignId, budgetField, newBudgetCents, reason = 'Ajuste de escala/otimização', mode = null, isDryRun = false) {
        // 1. Trava Absoluta de Kill Switch
        if (window.guardrailEngine?.isEmergencyStopped()) {
            throw new Error('EMERGENCY_STOP_BLOCKED: Mutações bloqueadas pela Parada de Segurança (Kill Switch).');
        }

        const activeMode = mode || window.autopilotEngine?.mode || 'ASSISTED';

        // 2. Trava de Modo Somente Analisar
        if (activeMode === 'ANALYSIS_ONLY') {
            throw new Error('BLOCKED_BY_AUTONOMY_POLICY: O RADWAN está em Modo "Somente Analisar". Nenhuma alteração é permitida.');
        }

        // 3. Trava de Modo Sombra (Simulação)
        if (isDryRun || activeMode === 'SHADOW') {
            window.auditEngine?.logAction({
                action: 'SHADOW_SIMULATION',
                objectId: campaignId,
                before: 'BUDGET_UNKNOWN',
                after: `R$ ${(newBudgetCents / 100).toFixed(2)}`,
                reason: `[MODO SOMBRA] ${reason}`,
                risk: 'ZERO_RISK',
                verification: 'SIMULATED_SUCCESS'
            });
            return {
                success: true,
                dryRun: true,
                message: `[MODO SOMBRA] Orçamento da campanha ${campaignId} seria alterado para R$ ${(newBudgetCents / 100).toFixed(2)}.`,
                verification: 'SIMULATED_SUCCESS'
            };
        }

        // 4. Snapshot para Rollback
        const currentData = await window.metaAdapter.request(campaignId, 'GET', { fields: 'id,name,daily_budget,lifetime_budget' });
        const oldBudgetCents = currentData[budgetField] || 0;
        this.rollbackSnapshots.set(campaignId, { type: 'BUDGET', field: budgetField, before: oldBudgetCents, timestamp: Date.now() });

        // 5. WRITE
        const writeRes = await window.metaAdapter.updateBudget(campaignId, budgetField, newBudgetCents);
        if (!writeRes || writeRes.error || writeRes.success === false) {
            throw new Error(writeRes.error?.message || 'Falha ao atualizar orçamento na Meta.');
        }

        // 6. READ (Bypass Cache)
        const readBack = await window.metaAdapter.request(campaignId, 'GET', { fields: `id,name,${budgetField}` }, null, true);

        // 7. VERIFY
        const readBackCents = parseInt(readBack[budgetField], 10);
        if (readBackCents !== newBudgetCents) {
            throw new Error(`Verificação de orçamento falhou: Esperado R$ ${(newBudgetCents / 100).toFixed(2)}, Meta retornou R$ ${(readBackCents / 100).toFixed(2)}.`);
        }

        // Registrar cooldown no Guardrail
        window.guardrailEngine?.registerBudgetChange(campaignId);

        // 8. Registrar no Audit Log
        window.auditEngine?.logAction({
            action: 'BUDGET_CHANGE',
            objectId: campaignId,
            objectName: currentData.name,
            before: `R$ ${(oldBudgetCents / 100).toFixed(2)}`,
            after: `R$ ${(newBudgetCents / 100).toFixed(2)}`,
            reason: reason,
            risk: 'MEDIUM',
            verification: 'SUCCESS'
        });

        return {
            success: true,
            message: `Orçamento atualizado para R$ ${(newBudgetCents / 100).toFixed(2)} e verificado na Meta.`,
            verification: 'VERIFIED_OK'
        };
    }

    // Executar Rollback
    async rollbackLastAction(campaignId) {
        if (!this.rollbackSnapshots.has(campaignId)) {
            throw new Error('Nenhum snapshot de alteração anterior disponível para esta campanha.');
        }

        const snap = this.rollbackSnapshots.get(campaignId);
        if (snap.type === 'STATUS') {
            await this.executeStatusChange(campaignId, snap.before, 'Rollback automático solicitado pelo operador');
        } else if (snap.type === 'BUDGET') {
            await this.executeBudgetChange(campaignId, snap.field, snap.before, 'Rollback automático de orçamento');
        }

        this.rollbackSnapshots.delete(campaignId);
        return { success: true, message: 'Rollback executado e verificado com sucesso!' };
    }
}

// Instância Singleton
window.executionEngine = new ExecutionEngine();
