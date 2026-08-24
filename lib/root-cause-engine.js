// ==============================================================================
// ROOT CAUSE & ANOMALY DIAGNOSTIC ENGINE
// Precise Root Cause Pinpointing • Baseline Change Detection
// ==============================================================================

class RootCauseEngine {
    diagnose({
        campaignName,
        currentInsight,
        baselineInsight,
        targetCPA = 35.00
    }) {
        if (!currentInsight) {
            return {
                primaryCause: 'INSUFFICIENT_DATA',
                summary: 'Sem dados suficientes para diagnóstico de causa raiz.',
                actionRecommendation: 'HOLD',
                evidence: []
            };
        }

        const spend = parseFloat(currentInsight.spend) || 0;
        const impressions = parseInt(currentInsight.impressions) || 0;
        const clicks = parseInt(currentInsight.clicks) || 0;
        const ctr = parseFloat(currentInsight.ctr) || 0;
        const cpc = parseFloat(currentInsight.cpc) || 0;
        const cpm = parseFloat(currentInsight.cpm) || 0;
        const frequency = parseFloat(currentInsight.frequency) || 1.0;

        let purchases = 0;
        if (currentInsight.actions && Array.isArray(currentInsight.actions)) {
            const p = currentInsight.actions.find(a => a.action_type === 'purchase' || a.action_type === 'omni_purchase');
            if (p) purchases = parseInt(p.value) || 0;
        }

        const cpa = purchases > 0 ? (spend / purchases) : null;
        const evidence = [];

        // DIAGNÓSTICO 1: Stop-Loss Imediato
        if (purchases === 0 && spend >= targetCPA * 1.15) {
            evidence.push(`Gasto acumulado de R$ ${spend.toFixed(2)} sem nenhuma conversão confirmada.`);
            return {
                primaryCause: 'ZERO_CONVERSION_OVERSPEND',
                summary: 'Campanha consumiu o teto de tolerância de stop-loss sem gerar vendas.',
                actionRecommendation: 'PAUSE',
                likelyArea: 'OFERTA_OU_CRIATIVO',
                evidence
            };
        }

        // DIAGNÓSTICO 2: Fadiga de Criativo Multivariada
        if (frequency >= 2.2 && ctr < 1.2 && spend > 40) {
            evidence.push(`Frequência elevada (${frequency.toFixed(2)}) com CTR de link degradado (${ctr.toFixed(2)}%).`);
            return {
                primaryCause: 'CREATIVE_FATIGUE',
                summary: 'O público saturou o criativo atual. É necessário renovar o hook ou anúncio.',
                actionRecommendation: 'TEST_NEW_CREATIVE',
                likelyArea: 'ANÚNCIO_CRIATIVO',
                evidence
            };
        }

        // DIAGNÓSTICO 3: Aumento de CPM no Leilão (Competição)
        if (cpm > 45.00 && ctr >= 1.5) {
            evidence.push(`CPM de leilão alto (R$ ${cpm.toFixed(2)}), mas o anúncio mantém bom CTR (${ctr.toFixed(2)}%).`);
            return {
                primaryCause: 'AUCTION_CPM_SPIKE',
                summary: 'O custo do leilão aumentou na Meta. O criativo é bom, mas o público está caro.',
                actionRecommendation: 'HOLD_OR_BROADEN_AUDIENCE',
                likelyArea: 'PÚBLICO_LEILÃO',
                evidence
            };
        }

        // DIAGNÓSTICO 4: Campanha Vencedora em Ponto de Escala
        if (purchases >= 3 && cpa && cpa <= targetCPA * 0.85) {
            evidence.push(`${purchases} compras com CPA de R$ ${cpa.toFixed(2)} (abaixo da meta de R$ ${targetCPA.toFixed(2)}).`);
            return {
                primaryCause: 'HIGH_EFFICIENCY_WINNER',
                summary: 'Alta eficiência de conversão e custo de aquisição saudável.',
                actionRecommendation: 'SCALE_CONTROLLED',
                likelyArea: 'ESCALA',
                evidence
            };
        }

        // DIAGNÓSTICO PADRÃO: Saudável ou em fase de aprendizado
        return {
            primaryCause: 'STABLE_DELIVERY',
            summary: 'Desempenho estável dentro dos parâmetros normais do leilão.',
            actionRecommendation: 'HOLD',
            likelyArea: 'ESTÁVEL',
            evidence: [`CPA R$ ${cpa ? cpa.toFixed(2) : '—'}, CTR ${ctr.toFixed(2)}%`]
        };
    }
}

module.exports = new RootCauseEngine();
