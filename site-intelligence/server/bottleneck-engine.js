// ==============================================================================
// SITE INTELLIGENCE — BOTTLENECK ENGINE
// Identificação matemática do Principal Gargalo (Maior Vazamento de Conversão)
// ==============================================================================

class BottleneckEngine {
    /**
     * Determina o principal ponto onde a conversão está sendo reduzida
     */
    identifyBottleneck(funnelData, frictionData, sessions = []) {
        const total = sessions.length;
        if (total === 0) {
            return {
                id: 'NO_DATA',
                name: 'Sem Dados',
                severity: 'LOW',
                drop_rate: 0,
                impact_score: 0,
                evidence: 'Aguardando primeiras sessões de visitantes para diagnóstico.'
            };
        }

        // Regra de Amostra Mínima: Requer pelo menos 10 sessões para apontar gargalo com confiança
        if (total < 10) {
            return {
                id: 'INSUFFICIENT_SAMPLE',
                name: 'Amostra Inicial em Coleta',
                severity: 'LOW',
                drop_rate: 0,
                impact_score: 0,
                evidence: `Coletadas ${total} ${total === 1 ? 'sessão' : 'sessões'}. Ainda não há volume estatístico suficiente para identificar um gargalo com confiança (mínimo 10 sessões).`
            };
        }

        const steps = funnelData.steps || [];
        const pageviewStep = steps.find(s => s.id === 'pageview' || s.name.includes('Sessões') || s.name === 'Pageview') || { count: total, drop_off_pct: 0 };
        const checkoutStep = steps.find(s => s.id === 'checkout' || s.name.includes('Checkout') || s.name === 'Initiated Checkout') || { count: 0, drop_off_pct: 0 };
        const pixStep = steps.find(s => s.id === 'pix' || s.name.includes('PIX') || s.name === 'PIX Generated') || { count: 0, drop_off_pct: 0 };
        const purchaseStep = steps.find(s => s.id === 'purchase' || s.name.includes('Compra') || s.name === 'Purchase Success') || { count: 0, drop_off_pct: 0 };

        const bottlenecks = [];

        // 1. Gargalo: Abandono de Landing Page (Não clica em comprar)
        if (pageviewStep.drop_off_pct > 75) {
            bottlenecks.push({
                id: 'LANDING_PAGE_DROP',
                name: 'Fricção / Baixa Conversão na Página',
                severity: pageviewStep.drop_off_pct > 88 ? 'HIGH' : 'MEDIUM',
                drop_rate: pageviewStep.drop_off_pct,
                impact_score: Math.round(pageviewStep.drop_off_pct * 1.2),
                evidence: `${pageviewStep.drop_off_pct}% dos visitantes navegam mas saem da página sem abrir o checkout.`
            });
        }

        // 2. Gargalo: Fricção no Form (Não gera PIX)
        if (checkoutStep.count > 0 && checkoutStep.drop_off_pct > 40) {
            bottlenecks.push({
                id: 'CHECKOUT_FORM_FRICTION',
                name: 'Abandono no Preenchimento de Dados/Frete',
                severity: checkoutStep.drop_off_pct > 60 ? 'HIGH' : 'MEDIUM',
                drop_rate: checkoutStep.drop_off_pct,
                impact_score: Math.round(checkoutStep.drop_off_pct * 1.5),
                evidence: `${checkoutStep.drop_off_pct}% dos que iniciam o checkout desistem antes de gerar o PIX.`
            });
        }

        // 3. Gargalo: Não Pagamento do PIX (Gera PIX mas não paga)
        if (pixStep.count > 0 && pixStep.drop_off_pct > 50) {
            bottlenecks.push({
                id: 'PIX_NON_PAYMENT',
                name: 'Não Pagamento do PIX Gerado',
                severity: pixStep.drop_off_pct > 70 ? 'HIGH' : 'MEDIUM',
                drop_rate: pixStep.drop_off_pct,
                impact_score: Math.round(pixStep.drop_off_pct * 1.8),
                evidence: `${pixStep.drop_off_pct}% dos códigos PIX gerados ainda não foram quitados.`
            });
        }

        // 4. Gargalo: Rage Clicks em elementos
        if (frictionData.summary?.total_rage_clicks >= 5) {
            bottlenecks.push({
                id: 'UI_RAGE_CLICKS',
                name: 'Cliques de Frustração na Interface',
                severity: 'HIGH',
                drop_rate: frictionData.friction_index,
                impact_score: 85,
                evidence: `Registrados ${frictionData.summary.total_rage_clicks} cliques repetidos de frustração em elementos.`
            });
        }

        // Se nenhum exceder os limites, fluxo saudável
        if (bottlenecks.length === 0) {
            return {
                id: 'HEALTHY_FLOW',
                name: 'Fluxo Estável de Conversão',
                severity: 'LOW',
                drop_rate: 0,
                impact_score: 10,
                evidence: 'Taxas de passagem entre etapas operando dentro dos parâmetros de normalidade.'
            };
        }

        // Ordenar pelo maior Impact Score
        bottlenecks.sort((a, b) => b.impact_score - a.impact_score);
        return bottlenecks[0];
    }
}

module.exports = new BottleneckEngine();
