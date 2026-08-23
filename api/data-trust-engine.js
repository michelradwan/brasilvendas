// ==============================================================================
// DATA TRUST ENGINE & CANONICAL PURCHASE RESOLVER
// Strict Data Confidence Scoring (0-100) • Zero Fabricated Metrics
// ==============================================================================

class CanonicalPurchaseResolver {
    resolvePurchases(rawInsight) {
        if (!rawInsight || !rawInsight.actions || !Array.isArray(rawInsight.actions)) {
            return { purchases: 0, revenue: 0, pixCreated: null, initiateCheckout: null, lpv: null };
        }

        const actions = rawInsight.actions;
        const actionValues = rawInsight.action_values || [];

        // 1. Deduplicação Estrita de Compras (Prioridade Canônica)
        let purchases = 0;
        const standardPurchase = actions.find(a => a.action_type === 'purchase');
        if (standardPurchase) {
            purchases = parseInt(standardPurchase.value) || 0;
        } else {
            const omniPurchase = actions.find(a => a.action_type === 'omni_purchase');
            if (omniPurchase) {
                purchases = parseInt(omniPurchase.value) || 0;
            }
        }

        // 2. Extração de Receita
        let revenue = 0;
        const revAction = actionValues.find(v => v.action_type === 'purchase' || v.action_type === 'omni_purchase');
        if (revAction) {
            revenue = parseFloat(revAction.value) || 0;
        }

        // 3. Demais Ações (NULL quando não existirem no payload)
        let initiateCheckout = null;
        const icAction = actions.find(a => a.action_type === 'initiate_checkout' || a.action_type === 'omni_initiated_checkout');
        if (icAction) initiateCheckout = parseInt(icAction.value) || 0;

        let lpv = null;
        const lpvAction = actions.find(a => a.action_type === 'landing_page_view');
        if (lpvAction) lpv = parseInt(lpvAction.value) || 0;

        let pixCreated = null;
        const pixAction = actions.find(a => a.action_type === 'add_payment_info');
        if (pixAction) pixCreated = parseInt(pixAction.value) || 0;

        return { purchases, revenue, pixCreated, initiateCheckout, lpv };
    }
}

class DataTrustEngine {
    constructor() {
        this.resolver = new CanonicalPurchaseResolver();
    }

    calculateDataConfidence({
        insight,
        campaignStatus,
        lastSyncTimestamp,
        hasTrackingErrors = false
    }) {
        let score = 100;
        const factors = [];

        if (!insight) {
            return {
                score: 0,
                rating: 'NO_DATA',
                usableForAutopilot: false,
                reasons: ['Nenhum insight disponível para o período selecionado.']
            };
        }

        const impressions = parseInt(insight.impressions) || 0;
        const clicks = parseInt(insight.clicks) || 0;
        const spend = parseFloat(insight.spend) || 0;

        // Fator 1: Volume Amostral
        if (impressions < 500) {
            score -= 30;
            factors.push('Amostra de impressões muito baixa (< 500 imp).');
        } else if (impressions < 2000) {
            score -= 15;
            factors.push('Amostra moderada de impressões (< 2000 imp).');
        }

        if (clicks < 15) {
            score -= 25;
            factors.push('Volume de cliques insuficiente para inferência estatística (< 15 cliques).');
        }

        // Fator 2: Completude do Rastreamento
        const resolved = this.resolver.resolvePurchases(insight);
        if (resolved.lpv === null) {
            score -= 10;
            factors.push('Evento Landing Page View (LPV) ausente no payload da Meta.');
        }

        if (hasTrackingErrors) {
            score -= 40;
            factors.push('Erros ou discrepâncias ativas detectadas no Tracking Health.');
        }

        // Fator 3: Freshness dos Dados
        if (lastSyncTimestamp) {
            const ageMinutes = (Date.now() - lastSyncTimestamp) / (60 * 1000);
            if (ageMinutes > 120) {
                score -= 20;
                factors.push(`Dados desatualizados (última sincronização há ${Math.round(ageMinutes)} min).`);
            }
        }

        score = Math.max(0, Math.min(100, score));

        let rating = 'HIGH';
        if (score < 50) rating = 'UNRELIABLE';
        else if (score < 75) rating = 'MODERATE';

        const usableForAutopilot = score >= 75 && !hasTrackingErrors;

        return {
            score,
            rating,
            usableForAutopilot,
            factors,
            resolved
        };
    }
}

module.exports = {
    DataTrustEngine: new DataTrustEngine(),
    purchaseResolver: new CanonicalPurchaseResolver()
};
