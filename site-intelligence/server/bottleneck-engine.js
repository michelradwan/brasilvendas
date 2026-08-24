// ==============================================================================
// SITE INTELLIGENCE — BOTTLENECK ENGINE
// Identificação matemática do Gargalo Principal (Maior Vazamento de Conversão)
// ==============================================================================

class BottleneckEngine {
    /**
     * Determina o principal ponto onde a conversão está sendo destruída
     */
    identifyBottleneck(funnelData, frictionData, sessions = []) {
        const total = sessions.length;
        if (total === 0) {
            return {
                id: 'NO_DATA',
                name: 'Insuficiente',
                severity: 'LOW',
                drop_rate: 0,
                impact_score: 0,
                evidence: 'Aguardando primeiras sessões de visitantes para diagnóstico.'
            };
        }

        const steps = funnelData.steps || [];
        const pageviewStep = steps.find(s => s.name === 'Pageview') || { count: 0, drop_off_pct: 0 };
        const checkoutStep = steps.find(s => s.name === 'Initiated Checkout') || { count: 0, drop_off_pct: 0 };
        const pixStep = steps.find(s => s.name === 'PIX Generated') || { count: 0, drop_off_pct: 0 };
        const purchaseStep = steps.find(s => s.name === 'Purchase Success') || { count: 0, drop_off_pct: 0 };

        const bottlenecks = [];

        // 1. Gargalo: Abandono de Landing Page (Não clica em comprar)
        if (pageviewStep.drop_off_pct > 70) {
            bottlenecks.push({
                id: 'LANDING_PAGE_DROP',
                name: 'Fricção / Baixa Oferta na Landing Page',
                severity: pageviewStep.drop_off_pct > 85 ? 'HIGH' : 'MEDIUM',
                drop_rate: pageviewStep.drop_off_pct,
                impact_score: Math.round(pageviewStep.drop_off_pct * 1.2),
                evidence: `${pageviewStep.drop_off_pct}% dos visitantes abandonam a página sem avançar para o checkout.`
            });
        }

        // 2. Gargalo: Fricção no Form (Não gera PIX)
        if (checkoutStep.count > 0 && pixStep.drop_off_pct > 40) {
            bottlenecks.push({
                id: 'CHECKOUT_FORM_FRICTION',
                name: 'Abandono na Etapa de Dados/Frete',
                severity: pixStep.drop_off_pct > 60 ? 'HIGH' : 'MEDIUM',
                drop_rate: pixStep.drop_off_pct,
                impact_score: Math.round(pixStep.drop_off_pct * 1.5),
                evidence: `${pixStep.drop_off_pct}% dos que iniciam o checkout desistem antes de gerar o PIX.`
            });
        }

        // 3. Gargalo: Não Pagamento do PIX (Gera PIX mas não paga)
        if (pixStep.count > 0 && purchaseStep.drop_off_pct > 50) {
            bottlenecks.push({
                id: 'PIX_NON_PAYMENT',
                name: 'Não Pagamento de PIX Gerado',
                severity: purchaseStep.drop_off_pct > 70 ? 'HIGH' : 'MEDIUM',
                drop_rate: purchaseStep.drop_off_pct,
                impact_score: Math.round(purchaseStep.drop_off_pct * 1.8),
                evidence: `${purchaseStep.drop_off_pct}% dos códigos PIX gerados expiraram sem pagamento.`
            });
        }

        // 4. Gargalo: Rage Clicks em elementos
        if (frictionData.summary?.total_rage_clicks >= 5) {
            bottlenecks.push({
                id: 'UI_RAGE_CLICKS',
                name: 'Frustração em Elementos de Interface',
                severity: 'HIGH',
                drop_rate: frictionData.friction_index,
                impact_score: 85,
                evidence: `Registrados ${frictionData.summary.total_rage_clicks} rage clicks em elementos não responsivos.`
            });
        }

        // Se nenhum exceder os limites, selecionar o de maior taxa de queda
        if (bottlenecks.length === 0) {
            return {
                id: 'HEALTHY_FLOW',
                name: 'Fluxo Estável de Conversão',
                severity: 'LOW',
                drop_rate: 0,
                impact_score: 10,
                evidence: 'Taxas de queda dentro da margem de tolerância operacional.'
            };
        }

        // Ordenar pelo maior Impact Score
        bottlenecks.sort((a, b) => b.impact_score - a.impact_score);
        return bottlenecks[0];
    }
}

module.exports = new BottleneckEngine();
