// ==============================================================================
// GUARDRAIL & FINANCIAL SAFETY ENGINE
// ==============================================================================

class GuardrailEngine {
    constructor() {
        this.config = {
            maxDailyAccountSpend: 500.00,
            maxBudgetChangePercent: 20, // Padrão de 20% para não resetar aprendizado
            maxCampaignDailyBudget: 300.00,
            cooldownHours: 12,
            targetCPA: 35.00,
            protectedWinners: [],
            emergencyStop: false
        };
        this.loadConfig();
    }

    loadConfig() {
        try {
            const saved = localStorage.getItem('meta_guardrail_config');
            if (saved) {
                this.config = { ...this.config, ...JSON.parse(saved) };
            }
        } catch(e){}
    }

    saveConfig(newConfig) {
        this.config = { ...this.config, ...newConfig };
        localStorage.setItem('meta_guardrail_config', JSON.stringify(this.config));
    }

    // Emergency Stop / Kill Switch
    async triggerEmergencyStop() {
        this.config.emergencyStop = true;
        this.saveConfig({ emergencyStop: true });

        // Log de Auditoria
        window.auditEngine?.logAction({
            action: 'KILL_SWITCH_ACTIVATED',
            reason: 'PARADA DE SEGURANÇA ATIVADA PELO OPERADOR. Todas as mutações Meta e automações foram bloqueadas.',
            risk: 'CRITICAL',
            verification: 'KILL_SWITCH_ACTIVE'
        });

        // Sincroniza com o backend em background
        try {
            await fetch('/api/meta-proxy?action=emergency_stop', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ enabled: true })
            });
        } catch(e){}

        window.dispatchEvent(new CustomEvent('radwan_kill_switch_changed', { detail: { active: true } }));
        return true;
    }

    async resumeEmergencyStop() {
        this.config.emergencyStop = false;
        this.saveConfig({ emergencyStop: false });

        // Log de Auditoria
        window.auditEngine?.logAction({
            action: 'KILL_SWITCH_DEACTIVATED',
            reason: 'Parada de segurança desativada. Operação e mutações permitidas retornaram ao estado normal.',
            risk: 'LOW',
            verification: 'NORMAL_OPERATION'
        });

        // Sincroniza com o backend em background
        try {
            await fetch('/api/meta-proxy?action=emergency_stop', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ enabled: false })
            });
        } catch(e){}

        window.dispatchEvent(new CustomEvent('radwan_kill_switch_changed', { detail: { active: false } }));
        return false;
    }

    isEmergencyStopped() {
        return this.config.emergencyStop === true;
    }

    // Protected Winners
    isProtectedWinner(campaignId) {
        return this.config.protectedWinners.includes(campaignId);
    }

    toggleProtectedWinner(campaignId) {
        if (this.isProtectedWinner(campaignId)) {
            this.config.protectedWinners = this.config.protectedWinners.filter(id => id !== campaignId);
        } else {
            this.config.protectedWinners.push(campaignId);
        }
        this.saveConfig({ protectedWinners: this.config.protectedWinners });
        return this.isProtectedWinner(campaignId);
    }

    // Cooldown de Edições
    getCooldownKey(campaignId) {
        return `meta_cooldown_${campaignId}`;
    }

    isUnderCooldown(campaignId) {
        try {
            const lastChange = localStorage.getItem(this.getCooldownKey(campaignId));
            if (!lastChange) return { underCooldown: false };

            const elapsedMs = Date.now() - parseInt(lastChange);
            const cooldownMs = this.config.cooldownHours * 3600 * 1000;

            if (elapsedMs < cooldownMs) {
                const remainingHours = ((cooldownMs - elapsedMs) / (3600 * 1000)).toFixed(1);
                return {
                    underCooldown: true,
                    remainingHours: remainingHours,
                    lastChangeDate: new Date(parseInt(lastChange)).toLocaleTimeString('pt-BR')
                };
            }
        } catch(e){}
        return { underCooldown: false };
    }

    registerBudgetChange(campaignId) {
        localStorage.setItem(this.getCooldownKey(campaignId), Date.now().toString());
    }

    // Validação Estrita de Alteração de Orçamento
    validateBudgetChange(campaignId, currentBudgetCents, newBudgetCents, totalEstimatedAccountSpend = 0) {
        if (this.isEmergencyStopped()) {
            return {
                allowed: false,
                reason: 'Ação bloqueada: O Kill Switch (Emergency Stop) está ativado.',
                risk: 'CRITICAL'
            };
        }

        const currentVal = currentBudgetCents / 100;
        const newVal = newBudgetCents / 100;

        // 1. Verificação de Cooldown
        const cooldown = this.isUnderCooldown(campaignId);
        if (cooldown.underCooldown) {
            return {
                allowed: false,
                reason: `Campanha em período de Cooldown. Faltam ${cooldown.remainingHours}h para a próxima alteração permitida.`,
                risk: 'HIGH'
            };
        }

        // 2. Verificação de Teto Individual da Campanha
        if (newVal > this.config.maxCampaignDailyBudget) {
            return {
                allowed: false,
                reason: `Orçamento proposto (R$ ${newVal.toFixed(2)}) ultrapassa o teto individual configurado (R$ ${this.config.maxCampaignDailyBudget.toFixed(2)}).`,
                risk: 'HIGH'
            };
        }

        // 3. Verificação do Percentual Máximo de Alteração (ex: 20%)
        if (currentVal > 0) {
            const pctChange = ((newVal - currentVal) / currentVal) * 100;
            if (pctChange > this.config.maxBudgetChangePercent) {
                const maxAllowedVal = currentVal * (1 + (this.config.maxBudgetChangePercent / 100));
                return {
                    allowed: false,
                    reason: `Aumento de ${pctChange.toFixed(1)}% ultrapassa o limite seguro de +${this.config.maxBudgetChangePercent}% por ciclo (Máximo permitido: R$ ${maxAllowedVal.toFixed(2)}/dia).`,
                    risk: 'MEDIUM',
                    suggestedAmountCents: Math.round(maxAllowedVal * 100)
                };
            }
        }

        // 4. Verificação de Teto Global da Conta
        if (totalEstimatedAccountSpend > this.config.maxDailyAccountSpend) {
            return {
                allowed: false,
                reason: `Gasto acumulado da conta (R$ ${totalEstimatedAccountSpend.toFixed(2)}) ultrapassa o teto global de R$ ${this.config.maxDailyAccountSpend.toFixed(2)}.`,
                risk: 'HIGH'
            };
        }

        return {
            allowed: true,
            risk: newVal > currentVal ? 'LOW' : 'LOW',
            reason: 'Parâmetros dentro dos limites de segurança.'
        };
    }

    // Validação de Stop-Loss
    validateStopLoss(campaignId, spend, purchases, cpaTarget) {
        if (this.isEmergencyStopped()) return { allowed: false, reason: 'Kill Switch Ativo' };
        if (this.isProtectedWinner(campaignId)) {
            return {
                allowed: false,
                reason: 'Esta campanha está marcada como PROTECTED WINNER e não pode ser pausada automaticamente.'
            };
        }

        // Se tiver 0 compras e gastou mais que 1.15x o CPA Alvo
        if (purchases === 0 && spend >= cpaTarget * 1.15) {
            return {
                allowed: true,
                action: 'PAUSE',
                reason: `Gasto de R$ ${spend.toFixed(2)} sem conversões (limite de segurança: R$ ${(cpaTarget * 1.15).toFixed(2)}).`
            };
        }

        return { allowed: false };
    }
}

// Instância Singleton
window.guardrailEngine = new GuardrailEngine();
