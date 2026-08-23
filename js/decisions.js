// ==============================================================================
// DECISION ENGINE, CREATIVE INTELLIGENCE & ROOT CAUSE DIAGNOSTICS
// ==============================================================================

class DecisionEngine {
    constructor() {
        this.shadowDecisions = [];
        this.loadShadowDecisions();
    }

    loadShadowDecisions() {
        try {
            const saved = localStorage.getItem('meta_shadow_decisions');
            if (saved) this.shadowDecisions = JSON.parse(saved);
        } catch(e){}
    }

    saveShadowDecisions() {
        localStorage.setItem('meta_shadow_decisions', JSON.stringify(this.shadowDecisions.slice(0, 100)));
    }

    // Creative Intelligence Score (0 a 100) e Classificação
    evaluateCreative(metrics, targetCPA) {
        const { spend, purchases, cpa, roas, ctr, cpc, frequency } = metrics;
        let score = 50;
        let classification = 'TESTING';
        let confidence = 'LOW';

        // 1. Confiança estatística por volume de compras
        if (purchases >= 10) confidence = 'VERY HIGH';
        else if (purchases >= 5) confidence = 'HIGH';
        else if (purchases >= 2) confidence = 'MEDIUM';
        else confidence = 'LOW';

        // 2. Pontuação por CPA
        if (purchases > 0) {
            if (cpa <= targetCPA * 0.7) score += 35;
            else if (cpa <= targetCPA) score += 20;
            else if (cpa <= targetCPA * 1.3) score -= 10;
            else score -= 30;
        } else if (spend > targetCPA) {
            score -= 35;
        }

        // 3. Pontuação por CTR
        if (ctr >= 2.5) score += 15;
        else if (ctr >= 1.5) score += 8;
        else if (ctr < 0.9 && spend > 20) score -= 15;

        // 4. Detecção de Fadiga (Frequência alta + CTR em queda)
        const isFatigued = frequency >= 2.3 && ctr < 1.2 && spend > 50;

        score = Math.max(0, Math.min(100, score));

        // Classificação Final
        if (isFatigued) {
            classification = 'FATIGUE';
        } else if (purchases >= 4 && cpa <= targetCPA * 0.85 && roas >= 2.5) {
            classification = score >= 80 ? 'WINNER' : 'SCALING';
        } else if (purchases === 0 && spend > targetCPA * 1.2) {
            classification = 'LOSER';
        } else if (cpa > targetCPA * 1.4 && purchases >= 2) {
            classification = 'LOSER';
        } else if (spend < targetCPA * 1.2 && purchases < 3) {
            classification = 'TESTING';
        } else {
            classification = 'WATCH';
        }

        return { score, classification, confidence, isFatigued };
    }

    // Motor de Causa Raiz (Root Cause Engine)
    diagnoseCampaign(campName, metricsToday, metrics7d, targetCPA) {
        const evidence = [];
        let likelyCause = 'PERFORMANCE_ESTÁVEL';
        let recommendation = 'Manter monitoramento ativo sem intervenção.';
        let confidence = 'HIGH';
        let actionType = 'HOLD';

        // Diagnóstico 1: Fadiga de Criativo
        if (metricsToday.frequency > 2.2 && metricsToday.ctr < (metrics7d.ctr * 0.75) && metricsToday.spend > 40) {
            likelyCause = 'CREATIVE_FATIGUE';
            evidence.push(`Frequência elevada (${metricsToday.frequency.toFixed(2)}) combinada com queda de CTR de ${metrics7d.ctr.toFixed(2)}% para ${metricsToday.ctr.toFixed(2)}%.`);
            recommendation = 'Inserir novos criativos/hooks no conjunto ou renovar o público.';
            confidence = 'HIGH';
            actionType = 'ROTATE_CREATIVE';
        }
        // Diagnóstico 2: Fricção de Checkout / Falha de Pagamento PIX
        else if (metricsToday.initiateCheckout >= 5 && metricsToday.purchases === 0) {
            likelyCause = 'CHECKOUT_OR_PIX_FRICTION';
            evidence.push(`${metricsToday.initiateCheckout} inícios de checkout registrados hoje e 0 compras confirmadas.`);
            recommendation = 'Verificar funcionamento da API PIX, carregamento do modal e tempo de resposta do gateway.';
            confidence = 'VERY HIGH';
            actionType = 'CHECKOUT_AUDIT';
        }
        // Diagnóstico 3: Perdedor Claro (Stop-loss indicado)
        else if (metricsToday.purchases === 0 && metricsToday.spend >= targetCPA * 1.15) {
            likelyCause = 'UNPROFITABLE_SPEND';
            evidence.push(`Gasto acumulado de R$ ${metricsToday.spend.toFixed(2)} sem conversões (limite: R$ ${(targetCPA * 1.15).toFixed(2)}).`);
            recommendation = 'Pausar campanha para estancar consumo desnecessário de verba.';
            confidence = 'HIGH';
            actionType = 'PAUSE';
        }
        // Diagnóstico 4: Vencedor Consistente (Escala indicada)
        else if (metricsToday.purchases >= 3 && metricsToday.cpa <= targetCPA * 0.85 && metricsToday.roas >= 2.2) {
            likelyCause = 'HIGH_EFFICIENCY_SCALE';
            evidence.push(`${metricsToday.purchases} vendas hoje com CPA de R$ ${metricsToday.cpa.toFixed(2)} (abaixo da meta de R$ ${targetCPA.toFixed(2)}) e ROAS ${metricsToday.roas.toFixed(2)}x.`);
            recommendation = 'Escalar orçamento diário em +15% de forma gradual.';
            confidence = 'HIGH';
            actionType = 'SCALE_BUDGET';
        }

        return {
            campaignName: campName,
            likelyCause,
            evidence,
            recommendation,
            confidence,
            actionType
        };
    }

    // Rankear Top 10 Oportunidades
    generateTopOpportunities(campaignsEvaluated, targetCPA) {
        const opportunities = [];

        for (const item of campaignsEvaluated) {
            const diag = this.diagnoseCampaign(item.campaign.name, item.insightsToday, item.insights7d, targetCPA);

            if (diag.actionType === 'SCALE_BUDGET') {
                opportunities.push({
                    title: `Escalar "${item.campaign.name}" (+15%)`,
                    impact: 'HIGH',
                    risk: 'LOW',
                    confidence: diag.confidence,
                    score: 90,
                    reason: diag.evidence.join(' '),
                    action: 'SCALE',
                    campaignId: item.campaign.id
                });
            } else if (diag.actionType === 'PAUSE') {
                opportunities.push({
                    title: `Pausar "${item.campaign.name}" (Stop-Loss)`,
                    impact: 'HIGH',
                    risk: 'LOW',
                    confidence: diag.confidence,
                    score: 85,
                    reason: diag.evidence.join(' '),
                    action: 'PAUSE',
                    campaignId: item.campaign.id
                });
            } else if (diag.actionType === 'CHECKOUT_AUDIT') {
                opportunities.push({
                    title: `Auditar Checkout da Campanha "${item.campaign.name}"`,
                    impact: 'VERY HIGH',
                    risk: 'LOW',
                    confidence: diag.confidence,
                    score: 95,
                    reason: diag.evidence.join(' '),
                    action: 'AUDIT',
                    campaignId: item.campaign.id
                });
            } else if (diag.actionType === 'ROTATE_CREATIVE') {
                opportunities.push({
                    title: `Renovar Criativo em "${item.campaign.name}" (Fadiga)`,
                    impact: 'MEDIUM',
                    risk: 'LOW',
                    confidence: diag.confidence,
                    score: 75,
                    reason: diag.evidence.join(' '),
                    action: 'ROTATE',
                    campaignId: item.campaign.id
                });
            }
        }

        // Ordenação decrescente de pontuação de oportunidade
        opportunities.sort((a, b) => b.score - a.score);
        return opportunities.slice(0, 10);
    }

    // Registrar decisão hipotética (Shadow Mode)
    recordShadowDecision(actionPlan) {
        const entry = {
            id: `DEC_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            timestamp: new Date().toISOString(),
            campaignId: actionPlan.campaignId,
            campaignName: actionPlan.campaignName,
            action: actionPlan.action,
            reason: actionPlan.reason,
            metricsBefore: actionPlan.metricsBefore,
            evaluatedOutcome: 'PENDING_EVALUATION'
        };
        this.shadowDecisions.unshift(entry);
        this.saveShadowDecisions();
        return entry;
    }
}

// Instância Singleton
window.decisionEngine = new DecisionEngine();
