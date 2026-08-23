// ==============================================================================
// ANALYTICS & UNIT ECONOMICS ENGINE
// ==============================================================================

class AnalyticsEngine {
    constructor() {
        this.unitEconomics = {
            productPrice: 89.90,
            cogs: 38.00,
            shippingCost: 15.00,
            gatewayFeePercent: 0.0399,
            taxPercent: 0.04,
            refundRatePercent: 0.015
        };
        this.loadUnitEconomics();
    }

    loadUnitEconomics() {
        try {
            const saved = localStorage.getItem('meta_unit_economics');
            if (saved) {
                this.unitEconomics = { ...this.unitEconomics, ...JSON.parse(saved) };
            }
        } catch(e){}
    }

    saveUnitEconomics(newSettings) {
        this.unitEconomics = { ...this.unitEconomics, ...newSettings };
        localStorage.setItem('meta_unit_economics', JSON.stringify(this.unitEconomics));
    }

    // Helper: Formatação monetária com suporte a qualquer moeda
    formatMoney(amount, currency = 'BRL') {
        const num = parseFloat(amount) || 0;
        return num.toLocaleString('pt-BR', {
            style: 'currency',
            currency: currency,
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });
    }

    formatPercent(val) {
        const num = parseFloat(val) || 0;
        return `${num >= 0 ? '+' : ''}${num.toFixed(1)}%`;
    }

    // Cálculo do Break-Even e Margens
    calculateBreakEven() {
        const { productPrice, cogs, shippingCost, gatewayFeePercent, taxPercent, refundRatePercent } = this.unitEconomics;
        const deductions = cogs + shippingCost + (productPrice * (gatewayFeePercent + taxPercent + refundRatePercent));
        const contributionMargin = productPrice - deductions;
        const breakEvenCPA = contributionMargin > 0 ? contributionMargin : 0;
        const breakEvenROAS = breakEvenCPA > 0 ? (productPrice / breakEvenCPA) : 0;

        return {
            contributionMargin,
            breakEvenCPA,
            breakEvenROAS,
            marginPercent: (contributionMargin / productPrice) * 100
        };
    }

    // Normalização de métricas de insights da Meta
    parseInsights(rawInsight) {
        if (!rawInsight) {
            return {
                spend: 0,
                revenue: 0,
                impressions: 0,
                clicks: 0,
                purchases: 0,
                cpa: 0,
                roas: 0,
                ctr: 0,
                cpc: 0,
                cpm: 0,
                frequency: 1.0,
                initiateCheckout: 0,
                landingPageViews: 0,
                pixCreated: 0
            };
        }

        const spend = parseFloat(rawInsight.spend) || 0;
        const impressions = parseInt(rawInsight.impressions) || 0;
        const clicks = parseInt(rawInsight.clicks) || 0;
        const ctr = parseFloat(rawInsight.ctr) || 0;
        const cpc = parseFloat(rawInsight.cpc) || 0;
        const cpm = parseFloat(rawInsight.cpm) || 0;
        const frequency = parseFloat(rawInsight.frequency) || 1.0;

        let purchases = 0;
        let revenue = 0;
        let initiateCheckout = 0;
        let landingPageViews = 0;
        let pixCreated = 0;

        if (rawInsight.actions && Array.isArray(rawInsight.actions)) {
            for (const act of rawInsight.actions) {
                if (act.action_type === 'purchase' || act.action_type === 'omni_purchase') {
                    purchases += parseInt(act.value) || 0;
                } else if (act.action_type === 'initiate_checkout' || act.action_type === 'omni_initiated_checkout') {
                    initiateCheckout += parseInt(act.value) || 0;
                } else if (act.action_type === 'landing_page_view') {
                    landingPageViews += parseInt(act.value) || 0;
                } else if (act.action_type === 'add_payment_info') {
                    pixCreated += parseInt(act.value) || 0;
                }
            }
        }

        if (rawInsight.action_values && Array.isArray(rawInsight.action_values)) {
            for (const val of rawInsight.action_values) {
                if (val.action_type === 'purchase' || val.action_type === 'omni_purchase') {
                    revenue += parseFloat(val.value) || 0;
                }
            }
        }

        // Se receita não veio informada no Pixel, estima pelo ticket base
        if (revenue === 0 && purchases > 0) {
            revenue = purchases * this.unitEconomics.productPrice;
        }

        const cpa = purchases > 0 ? (spend / purchases) : 0;
        const roas = spend > 0 ? (revenue / spend) : 0;

        return {
            spend,
            revenue,
            impressions,
            clicks,
            purchases,
            cpa,
            roas,
            ctr,
            cpc,
            cpm,
            frequency,
            initiateCheckout,
            landingPageViews,
            pixCreated
        };
    }

    // Cálculo do Funil de Conversão
    calculateFunnel(metrics) {
        const { impressions, clicks, landingPageViews, initiateCheckout, pixCreated, purchases } = metrics;

        const effectiveLPV = landingPageViews || Math.round(clicks * 0.82); // Estimativa se LPV não estiver no pixel
        const effectivePix = pixCreated || initiateCheckout;

        const clickRate = impressions > 0 ? (clicks / impressions) * 100 : 0;
        const lpvRate = clicks > 0 ? (effectiveLPV / clicks) * 100 : 0;
        const icRate = effectiveLPV > 0 ? (initiateCheckout / effectiveLPV) * 100 : 0;
        const pixRate = initiateCheckout > 0 ? (effectivePix / initiateCheckout) * 100 : 0;
        const purchaseRate = effectivePix > 0 ? (purchases / effectivePix) * 100 : 0;
        const overallRate = clicks > 0 ? (purchases / clicks) * 100 : 0;

        return {
            steps: [
                { name: 'Impressões', value: impressions, drop: 100 - clickRate, rate: clickRate },
                { name: 'Cliques no Link', value: clicks, drop: 100 - lpvRate, rate: lpvRate },
                { name: 'Visualização da Página (LPV)', value: effectiveLPV, drop: 100 - icRate, rate: icRate },
                { name: 'Início de Checkout (IC)', value: initiateCheckout, drop: 100 - pixRate, rate: pixRate },
                { name: 'PIX Gerado', value: effectivePix, drop: 100 - purchaseRate, rate: purchaseRate },
                { name: 'Compra Confirmada', value: purchases, rate: overallRate }
            ],
            bottlenecks: this.diagnoseFunnelBottlenecks({ clickRate, lpvRate, icRate, purchaseRate })
        };
    }

    diagnoseFunnelBottlenecks(rates) {
        const issues = [];
        if (rates.clickRate < 1.2 && rates.clickRate > 0) {
            issues.push({
                stage: 'Hook / Criativo',
                severity: 'HIGH',
                message: 'CTR abaixo de 1.2%. O gancho dos anúncios está com baixa atração de clique.'
            });
        }
        if (rates.lpvRate < 65 && rates.lpvRate > 0) {
            issues.push({
                stage: 'Página de Destino (LPV)',
                severity: 'HIGH',
                message: 'Queda acentuada entre clique e carregamento da página (< 65%). Possível lentidão do site ou perda de tráfego móvel.'
            });
        }
        if (rates.icRate < 8 && rates.icRate > 0) {
            issues.push({
                stage: 'Oferta / Dobra',
                severity: 'MEDIUM',
                message: 'Taxa de início de checkout abaixo de 8%. O cliente vê o produto mas não clica em comprar.'
            });
        }
        if (rates.purchaseRate < 35 && rates.purchaseRate > 0) {
            issues.push({
                stage: 'Checkout & PIX',
                severity: 'CRITICAL',
                message: 'Taxa de pagamento de PIX abaixo de 35%. Alto abandono após abertura do checkout.'
            });
        }
        return issues;
    }

    // Cálculo do Account Health Score (0 a 100)
    calculateHealthScore(allCampaignsMetrics, breakEven) {
        let score = 100;
        const deductions = [];

        if (allCampaignsMetrics.length === 0) {
            return { score: 100, status: 'SEM DADOS', deductions: [] };
        }

        const totalSpend = allCampaignsMetrics.reduce((acc, c) => acc + c.spend, 0);
        const totalPurchases = allCampaignsMetrics.reduce((acc, c) => acc + c.purchases, 0);
        const avgCpa = totalPurchases > 0 ? (totalSpend / totalPurchases) : 0;
        const avgRoas = totalSpend > 0 ? (allCampaignsMetrics.reduce((acc, c) => acc + c.revenue, 0) / totalSpend) : 0;

        // 1. Penalidade por CPA acima do Break-Even
        if (totalPurchases > 0 && avgCpa > breakEven.breakEvenCPA) {
            const excess = ((avgCpa - breakEven.breakEvenCPA) / breakEven.breakEvenCPA) * 35;
            const pen = Math.min(35, Math.round(excess));
            score -= pen;
            deductions.push(`CPA Médio (R$ ${avgCpa.toFixed(2)}) acima do ponto de equilíbrio (-${pen} pts)`);
        }

        // 2. Penalidade por Alta Frequência / Fadiga
        const highFreqCamps = allCampaignsMetrics.filter(c => c.frequency > 2.5 && c.spend > 50);
        if (highFreqCamps.length > 0) {
            score -= 15;
            deductions.push(`${highFreqCamps.length} campanha(s) com saturação de frequência > 2.5 (-15 pts)`);
        }

        // 3. Penalidade por Gastos Sem Conversão (Stop-loss pendente)
        const unconvertingSpend = allCampaignsMetrics.filter(c => c.purchases === 0 && c.spend > breakEven.breakEvenCPA);
        if (unconvertingSpend.length > 0) {
            score -= 20;
            deductions.push(`${unconvertingSpend.length} campanha(s) consumindo orçamento sem vendas (-20 pts)`);
        }

        score = Math.max(0, Math.min(100, score));

        let status = 'SAUDÁVEL';
        if (score < 60) status = 'CRÍTICO';
        else if (score < 80) status = 'ATENÇÃO';

        return { score, status, deductions, avgCpa, avgRoas };
    }

    // Detector de Anomalias (P0 a P3)
    detectAnomalies(todayMetrics, baseline7dMetrics) {
        const anomalies = [];
        if (!baseline7dMetrics || baseline7dMetrics.spend === 0) return anomalies;

        // P0: Entrega parada com gasto zero ou parada brusca
        if (baseline7dMetrics.spend > 100 && todayMetrics.spend < 5) {
            anomalies.push({
                code: 'DELIVERY_STOP',
                severity: 'P0',
                title: 'Interrupção Crítica na Entrega',
                description: 'A conta parou de gastar orçamento comparado à média de 7 dias. Verifique status da conta e faturamento.'
            });
        }

        // P1: Salto no CPM (> 45%)
        if (baseline7dMetrics.cpm > 0 && todayMetrics.cpm > baseline7dMetrics.cpm * 1.45) {
            const diff = Math.round(((todayMetrics.cpm - baseline7dMetrics.cpm) / baseline7dMetrics.cpm) * 100);
            anomalies.push({
                code: 'CPM_SPIKE',
                severity: 'P1',
                title: `Pico no CPM (+${diff}%)`,
                description: `O CPM subiu de R$ ${baseline7dMetrics.cpm.toFixed(2)} para R$ ${todayMetrics.cpm.toFixed(2)}. Leilão mais competitivo ou público esgotado.`
            });
        }

        // P1: Queda no CTR (> 35%)
        if (baseline7dMetrics.ctr > 0 && todayMetrics.ctr < baseline7dMetrics.ctr * 0.65) {
            const diff = Math.round(((baseline7dMetrics.ctr - todayMetrics.ctr) / baseline7dMetrics.ctr) * 100);
            anomalies.push({
                code: 'CTR_DROP',
                severity: 'P1',
                title: `Queda Acentuada no CTR (-${diff}%)`,
                description: 'Queda forte no engajamento com criativos. Forte indicador de fadiga do criativo atual.'
            });
        }

        // P2: Salto no CPA (> 40%)
        if (baseline7dMetrics.cpa > 0 && todayMetrics.cpa > baseline7dMetrics.cpa * 1.40 && todayMetrics.purchases >= 2) {
            anomalies.push({
                code: 'CPA_SPIKE',
                severity: 'P2',
                title: 'Aumento Expressivo no CPA',
                description: `O CPA hoje está em R$ ${todayMetrics.cpa.toFixed(2)} vs média de R$ ${baseline7dMetrics.cpa.toFixed(2)} dos últimos 7 dias.`
            });
        }

        return anomalies;
    }
}

// Instância Singleton
window.analyticsEngine = new AnalyticsEngine();
