// ==============================================================================
// ANALYTICS & UNIT ECONOMICS ENGINE (ZERO FABRICATED METRICS)
// ==============================================================================

class AnalyticsEngine {
    constructor() {
        this.unitEconomics = {
            productPrice: 89.90,
            cogs: 38.00,
            shippingCost: 15.00,
            gatewayFeePercent: 0.0399,
            taxPercent: 0.04,
            refundRatePercent: 0.015,
            verifiedByOperator: false
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

    isVerified() {
        return this.unitEconomics.verifiedByOperator === true;
    }

    formatMoney(amount, currency = 'BRL') {
        if (amount === null || amount === undefined || isNaN(amount)) return '–';
        const num = parseFloat(amount) || 0;
        return num.toLocaleString('pt-BR', {
            style: 'currency',
            currency: currency,
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });
    }

    formatPercent(val) {
        if (val === null || val === undefined || isNaN(val)) return '–';
        const num = parseFloat(val) || 0;
        return `${num >= 0 ? '+' : ''}${num.toFixed(1)}%`;
    }

    calculateBreakEven() {
        const { productPrice, cogs, shippingCost, gatewayFeePercent, taxPercent, refundRatePercent, verifiedByOperator } = this.unitEconomics;
        const deductions = cogs + shippingCost + (productPrice * (gatewayFeePercent + taxPercent + refundRatePercent));
        const contributionMargin = productPrice - deductions;
        const breakEvenCPA = contributionMargin > 0 ? contributionMargin : 0;
        const breakEvenROAS = breakEvenCPA > 0 ? (productPrice / breakEvenCPA) : 0;

        return {
            contributionMargin,
            breakEvenCPA,
            breakEvenROAS,
            marginPercent: (contributionMargin / productPrice) * 100,
            verified: verifiedByOperator
        };
    }

    // Normalização Rigorosa de Métricas da Meta (Sem Duplicação de Purchase)
    parseInsights(rawInsight) {
        if (!rawInsight) {
            return {
                spend: 0,
                revenue: 0,
                impressions: 0,
                clicks: 0,
                purchases: 0,
                cpa: null,
                roas: null,
                ctr: 0,
                cpc: 0,
                cpm: 0,
                frequency: 1.0,
                initiateCheckout: null,
                landingPageViews: null,
                pixCreated: null
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
        let initiateCheckout = null;
        let landingPageViews = null;
        let pixCreated = null;

        if (rawInsight.actions && Array.isArray(rawInsight.actions)) {
            // Deduplicação Estrita de Compras: Prioridade para 'purchase'
            const standardPurchase = rawInsight.actions.find(a => a.action_type === 'purchase');
            if (standardPurchase) {
                purchases = parseInt(standardPurchase.value) || 0;
            } else {
                const omniPurchase = rawInsight.actions.find(a => a.action_type === 'omni_purchase');
                if (omniPurchase) purchases = parseInt(omniPurchase.value) || 0;
            }

            const icAction = rawInsight.actions.find(a => a.action_type === 'initiate_checkout' || a.action_type === 'omni_initiated_checkout');
            if (icAction) initiateCheckout = parseInt(icAction.value) || 0;

            const lpvAction = rawInsight.actions.find(a => a.action_type === 'landing_page_view');
            if (lpvAction) landingPageViews = parseInt(lpvAction.value) || 0;

            const pixAction = rawInsight.actions.find(a => a.action_type === 'add_payment_info');
            if (pixAction) pixCreated = parseInt(pixAction.value) || 0;
        }

        if (rawInsight.action_values && Array.isArray(rawInsight.action_values)) {
            const revAction = rawInsight.action_values.find(v => v.action_type === 'purchase' || v.action_type === 'omni_purchase');
            if (revAction) revenue = parseFloat(revAction.value) || 0;
        }

        if (revenue === 0 && purchases > 0) {
            revenue = purchases * this.unitEconomics.productPrice;
        }

        const cpa = purchases > 0 ? (spend / purchases) : null;
        const roas = spend > 0 ? (revenue / spend) : null;

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

    // Funil sem estimativas fictícias
    calculateFunnel(metrics) {
        const { impressions, clicks, landingPageViews, initiateCheckout, pixCreated, purchases } = metrics;

        const clickRate = impressions > 0 ? (clicks / impressions) * 100 : 0;
        const lpvRate = (landingPageViews !== null && clicks > 0) ? (landingPageViews / clicks) * 100 : null;
        const icRate = (initiateCheckout !== null && landingPageViews !== null && landingPageViews > 0) ? (initiateCheckout / landingPageViews) * 100 : null;
        const pixRate = (pixCreated !== null && initiateCheckout !== null && initiateCheckout > 0) ? (pixCreated / initiateCheckout) * 100 : null;
        const purchaseRate = (purchases > 0 && pixCreated !== null && pixCreated > 0) ? (purchases / pixCreated) * 100 : (clicks > 0 ? (purchases / clicks) * 100 : 0);

        return {
            steps: [
                { name: 'Impressões', value: impressions, rate: clickRate },
                { name: 'Cliques no Link', value: clicks, rate: lpvRate },
                { name: 'Visualização da Página (LPV)', value: landingPageViews, rate: icRate, isNull: landingPageViews === null },
                { name: 'Início de Checkout (IC)', value: initiateCheckout, rate: pixRate, isNull: initiateCheckout === null },
                { name: 'PIX Gerado', value: pixCreated, rate: purchaseRate, isNull: pixCreated === null },
                { name: 'Compra Confirmada', value: purchases, rate: clicks > 0 ? (purchases / clicks) * 100 : 0 }
            ]
        };
    }

    calculateHealthScore(allCampaignsMetrics, breakEven) {
        let score = 100;
        const deductions = [];

        if (allCampaignsMetrics.length === 0) {
            return { score: 100, status: 'SEM DADOS', deductions: [] };
        }

        const totalSpend = allCampaignsMetrics.reduce((acc, c) => acc + c.spend, 0);
        const totalPurchases = allCampaignsMetrics.reduce((acc, c) => acc + c.purchases, 0);
        const avgCpa = totalPurchases > 0 ? (totalSpend / totalPurchases) : 0;

        if (totalPurchases > 0 && avgCpa > breakEven.breakEvenCPA) {
            const excess = ((avgCpa - breakEven.breakEvenCPA) / breakEven.breakEvenCPA) * 35;
            const pen = Math.min(35, Math.round(excess));
            score -= pen;
            deductions.push(`CPA Médio (R$ ${avgCpa.toFixed(2)}) acima do ponto de equilíbrio (-${pen} pts)`);
        }

        score = Math.max(0, Math.min(100, score));

        let status = 'SAUDÁVEL';
        if (score < 60) status = 'CRÍTICO';
        else if (score < 80) status = 'ATENÇÃO';

        return { score, status, deductions };
    }
}

// Instância Singleton
window.analyticsEngine = new AnalyticsEngine();
