// ==============================================================================
// META EXECUTION GATEWAY (UNIFIED WRITE PIPELINE)
// Single Authorized Gateway • Write -> Read -> Verify • Fail-Closed Governance
// ==============================================================================

const metaApi = require('./meta-api-client.js');
const { storage, lock } = require('./storage-adapter.js');
const {
    ALLOWED_AD_ACCOUNT_ID,
    DEFAULT_MAX_BUDGET_CHANGE_PCT,
    HARD_CEILING_BUDGET_CHANGE_PCT,
    DEFAULT_COOLDOWN_HOURS,
    SPECIAL_AD_CATEGORIES
} = require('../config/meta-constants.js');

class MetaExecutionGateway {
    constructor() {
        this.storage = storage;
        this.lock = lock;
    }

    // 1. Pipeline Unificado de Execução Segura
    async executeAction({
        actionId,
        actor,
        adAccountId = ALLOWED_AD_ACCOUNT_ID,
        objectId,
        actionType, // 'STATUS_CHANGE', 'BUDGET_CHANGE', 'RENAME'
        payload,
        reason,
        autonomyMode = 'ASSISTED',
        humanApproved = false
    }) {
        if (!actionId) {
            actionId = `ACT_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        }

        // ETAPA 1: Verificação de Idempotência
        const existingAction = await this.storage.get('actions', actionId);
        if (existingAction) {
            return {
                status: 'IDEMPOTENT_DUPLICATE',
                success: true,
                message: 'Ação já executada anteriormente (Idempotência confirmada).',
                actionId,
                cachedResult: existingAction.result
            };
        }

        // ETAPA 2: Validação de Escopo e Conta Autorizada
        if (adAccountId !== ALLOWED_AD_ACCOUNT_ID) {
            throw new Error(`FORBIDDEN_ACCOUNT: A conta "${adAccountId}" não é a conta autorizada (${ALLOWED_AD_ACCOUNT_ID}).`);
        }

        // ETAPA 3: Verificação de Emergency Stop (Global e por Conta)
        const settings = (await this.storage.get('settings', 'main')) || {};
        if (settings.emergencyStopGlobal || (settings.emergencyStopAccounts && settings.emergencyStopAccounts[adAccountId])) {
            throw new Error('EMERGENCY_STOP_ACTIVE: Mutações bloqueadas pelo Kill Switch no servidor.');
        }

        // ETAPA 4: Validação de Modo de Autonomia
        if (autonomyMode === 'SAFE') {
            throw new Error('MUTATION_BLOCKED_SAFE_MODE: O sistema está em Safe Mode (somente leitura).');
        }
        if (autonomyMode === 'SHADOW') {
            await this.storage.append('shadow_decisions', {
                actionId,
                actor,
                objectId,
                actionType,
                payload,
                reason,
                simulatedAt: new Date().toISOString()
            });
            return {
                status: 'SHADOW_MODE_SIMULATED',
                success: true,
                message: `[SHADOW MODE] Decisão simulada: ${reason}`,
                actionId
            };
        }
        if (autonomyMode === 'ASSISTED' && !humanApproved) {
            await this.storage.append('approvals', {
                actionId,
                actor,
                objectId,
                actionType,
                payload,
                reason,
                status: 'PENDING_APPROVAL',
                createdAt: new Date().toISOString()
            });
            return {
                status: 'QUEUED_FOR_APPROVAL',
                success: true,
                message: `Ação colocada na Fila de Aprovação: ${reason}`,
                actionId
            };
        }

        // ETAPA 5: Leitura Prévia e Verificação de Categorias Especiais
        const objectBefore = await metaApi.request(objectId, 'GET', {
            fields: 'id,name,status,daily_budget,lifetime_budget,special_ad_categories'
        });

        if (!objectBefore || !objectBefore.id) {
            throw new Error(`OBJECT_NOT_FOUND: Objeto "${objectId}" não encontrado na Meta.`);
        }

        // Proteção para Categorias Especiais (Políticas, Eleitorais, Sociais)
        if (objectBefore.special_ad_categories && Array.isArray(objectBefore.special_ad_categories)) {
            const hasSpecial = objectBefore.special_ad_categories.some(cat => SPECIAL_AD_CATEGORIES.includes(cat));
            if (hasSpecial && !humanApproved) {
                throw new Error('SPECIAL_CATEGORY_HUMAN_APPROVAL_REQUIRED: Campanhas de categoria especial exigem aprovação humana obrigatória.');
            }
        }

        // ETAPA 6: Validação de Guardrails e Cooldown
        const cooldownRecord = await this.storage.get('cooldowns', objectId);
        if (cooldownRecord) {
            const elapsedHours = (Date.now() - cooldownRecord.timestamp) / (3600 * 1000);
            const requiredHours = settings.cooldownHours || DEFAULT_COOLDOWN_HOURS;
            if (elapsedHours < requiredHours && !humanApproved) {
                const remaining = (requiredHours - elapsedHours).toFixed(1);
                throw new Error(`COOLDOWN_ACTIVE: O objeto ${objectId} foi modificado recentemente. Restam ${remaining}h de cooldown.`);
            }
        }

        // Validação Específica para Alteração de Orçamento
        if (actionType === 'BUDGET_CHANGE') {
            const unitEcon = (await this.storage.get('unit_economics', 'main')) || {};
            if (!unitEcon.verifiedByOperator && !humanApproved) {
                throw new Error('UNIT_ECONOMICS_NOT_VERIFIED: Escala bloqueada até que o operador confirme os custos reais em Configurações.');
            }

            const curBudgetCents = parseInt(objectBefore.daily_budget || objectBefore.lifetime_budget || 0);
            const newBudgetCents = parseInt(payload.daily_budget || payload.lifetime_budget);

            if (newBudgetCents > curBudgetCents) {
                const pctIncrease = ((newBudgetCents - curBudgetCents) / curBudgetCents) * 100;
                const maxAllowedPct = humanApproved ? HARD_CEILING_BUDGET_CHANGE_PCT : (settings.maxBudgetChangePct || DEFAULT_MAX_BUDGET_CHANGE_PCT);
                
                if (pctIncrease > maxAllowedPct) {
                    throw new Error(`BUDGET_GUARDRAIL_VIOLATION: Aumento de ${pctIncrease.toFixed(1)}% excede o limite permitido de ${maxAllowedPct}%.`);
                }
            }
        }

        // ETAPA 7: Gravação de Snapshot Persistente para Rollback
        await this.storage.set('snapshots', objectId, {
            actionId,
            timestamp: Date.now(),
            before: objectBefore,
            payload
        });

        // ETAPA 8: EXECUÇÃO DA MUTAÇÃO NA GRAPH API (WRITE)
        let graphPayload = {};
        if (actionType === 'STATUS_CHANGE') graphPayload.status = payload.status;
        if (actionType === 'BUDGET_CHANGE') {
            if (payload.daily_budget) graphPayload.daily_budget = payload.daily_budget;
            if (payload.lifetime_budget) graphPayload.lifetime_budget = payload.lifetime_budget;
        }
        if (actionType === 'RENAME') graphPayload.name = payload.name;

        await metaApi.request(objectId, 'POST', {}, graphPayload);

        // ETAPA 9: READ BACK & VERIFY (Confronto Direto com a Meta)
        const objectAfter = await metaApi.request(objectId, 'GET', {
            fields: 'id,name,status,daily_budget,lifetime_budget'
        });

        // Validação Estrita de Efeito Esperado vs Real
        if (actionType === 'STATUS_CHANGE' && objectAfter.status !== payload.status) {
            throw new Error(`VERIFICATION_FAILED: Status esperado "${payload.status}", mas a Meta retornou "${objectAfter.status}".`);
        }
        if (actionType === 'BUDGET_CHANGE') {
            const targetField = payload.daily_budget ? 'daily_budget' : 'lifetime_budget';
            const expectedVal = String(payload[targetField]);
            const actualVal = String(objectAfter[targetField]);
            if (expectedVal !== actualVal) {
                throw new Error(`VERIFICATION_FAILED: Orçamento esperado "${expectedVal}", mas a Meta retornou "${actualVal}".`);
            }
        }

        // ETAPA 10: Atualização de Cooldown, Idempotência e Auditoria Imutável
        await this.storage.set('cooldowns', objectId, {
            actionId,
            timestamp: Date.now(),
            actionType
        });

        const executionRecord = {
            actionId,
            actor,
            objectId,
            objectName: objectBefore.name,
            actionType,
            before: objectBefore,
            after: objectAfter,
            reason,
            executedAt: new Date().toISOString(),
            status: 'VERIFIED_SUCCESS'
        };

        await this.storage.set('actions', actionId, { result: executionRecord });
        await this.storage.append('audit_logs', {
            actionId,
            action: actionType,
            objectName: objectBefore.name,
            reason,
            actor,
            verification: 'VERIFIED_SUCCESS',
            timestamp: new Date().toISOString(),
            formattedDate: new Date().toLocaleDateString('pt-BR'),
            formattedTime: new Date().toLocaleTimeString('pt-BR')
        });

        return {
            status: 'VERIFIED_SUCCESS',
            success: true,
            message: `Ação ${actionType} executada e verificada com sucesso em "${objectBefore.name}".`,
            actionId,
            before: objectBefore,
            after: objectAfter
        };
    }

    // 2. Rollback Seguro Baseado em Snapshot Persistente
    async rollbackLastAction(objectId, actor = 'OPERATOR') {
        const snapshot = await this.storage.get('snapshots', objectId);
        if (!snapshot || !snapshot.before) {
            throw new Error(`ROLLBACK_FAILED: Nenhum snapshot persistente encontrado para o objeto ${objectId}.`);
        }

        const before = snapshot.before;
        const rollbackActionId = `ROLLBACK_${objectId}_${Date.now()}`;

        let rollbackPayload = {};
        let actionType = 'STATUS_CHANGE';

        if (before.daily_budget) {
            actionType = 'BUDGET_CHANGE';
            rollbackPayload.daily_budget = before.daily_budget;
        } else if (before.status) {
            actionType = 'STATUS_CHANGE';
            rollbackPayload.status = before.status;
        }

        const res = await this.executeAction({
            actionId: rollbackActionId,
            actor: `ROLLBACK_BY_${actor}`,
            objectId,
            actionType,
            payload: rollbackPayload,
            reason: `Reversão segura de estado para snapshot anterior de ${new Date(snapshot.timestamp).toLocaleTimeString('pt-BR')}`,
            autonomyMode: 'AUTOPILOT',
            humanApproved: true
        });

        await this.storage.delete('snapshots', objectId);
        return res;
    }
}

module.exports = new MetaExecutionGateway();
