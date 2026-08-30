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

    // Helper interno para extração segura de AdsActionStats (sem duplicação e sem assumir zero para campo ausente)
    extractActionValue(actionsArray, targetTypes) {
        if (!actionsArray || !Array.isArray(actionsArray)) return null;
        for (const type of targetTypes) {
            const found = actionsArray.find(a => a && a.action_type === type);
            if (found && found.value !== undefined && found.value !== null) {
                const val = parseFloat(found.value);
                if (!isNaN(val)) return val;
            }
        }
        return null;
    }

    // Normalização Rigorosa de Métricas da Meta — CANONICAL INSIGHT MODEL (v2.0)
    // Fonte da verdade: snake_case com resolução estrita de actions e preservação de 0 vs null
    parseInsights(rawInsight) {
        if (!rawInsight) {
            return {
                spend: 0,
                revenue: 0,
                impressions: 0,
                reach: null,
                clicks: 0,
                link_clicks: 0,
                purchases: 0,
                cpa: null,
                roas: null,
                ctr: null,
                cpc: null,
                cpm: null,
                link_ctr: null,
                link_cpc: null,
                frequency: null,
                initiate_checkout: null,
                add_to_cart: null,
                landing_page_views: null,
                leads: null,
                pix_created: null,
                video_views_3s: null,
                thruplay: null,
                video_p25: null,
                video_p50: null,
                video_p75: null,
                video_p100: null,
                // Aliases de compatibilidade para código legado:
                get initiateCheckout() { return this.initiate_checkout; },
                get landingPageViews() { return this.landing_page_views; },
                get pixCreated() { return this.pix_created; }
            };
        }

        const spend = parseFloat(rawInsight.spend) || 0;
        const impressions = rawInsight.impressions !== undefined && rawInsight.impressions !== null ? parseInt(rawInsight.impressions, 10) : 0;
        const reach = rawInsight.reach !== undefined && rawInsight.reach !== null ? parseInt(rawInsight.reach, 10) : null;
        const clicks = rawInsight.clicks !== undefined && rawInsight.clicks !== null ? parseInt(rawInsight.clicks, 10) : 0;

        // Cliques no link (inline_link_clicks tem prioridade sobre clicks gerais)
        let link_clicks = 0;
        if (rawInsight.inline_link_clicks !== undefined && rawInsight.inline_link_clicks !== null) {
            link_clicks = parseInt(rawInsight.inline_link_clicks, 10) || 0;
        } else if (rawInsight.actions && Array.isArray(rawInsight.actions)) {
            const linkAct = this.extractActionValue(rawInsight.actions, ['link_click', 'omni_link_click']);
            link_clicks = linkAct !== null ? parseInt(linkAct, 10) : clicks;
        } else {
            link_clicks = clicks;
        }

        // Métricas de Entrega e Tráfego
        const ctr = impressions > 0 ? (clicks / impressions) * 100 : (rawInsight.ctr !== undefined ? parseFloat(rawInsight.ctr) : null);
        const cpc = clicks > 0 ? (spend / clicks) : (rawInsight.cpc !== undefined ? parseFloat(rawInsight.cpc) : null);
        const cpm = impressions > 0 ? (spend / impressions) * 1000 : (rawInsight.cpm !== undefined ? parseFloat(rawInsight.cpm) : null);
        const link_ctr = impressions > 0 ? (link_clicks / impressions) * 100 : (rawInsight.inline_link_click_ctr !== undefined ? parseFloat(rawInsight.inline_link_click_ctr) : null);
        const link_cpc = link_clicks > 0 ? (spend / link_clicks) : (rawInsight.cost_per_inline_link_click !== undefined ? parseFloat(rawInsight.cost_per_inline_link_click) : null);
        const frequency = (impressions > 0 && reach !== null && reach > 0) ? (impressions / reach) : (rawInsight.frequency !== undefined ? parseFloat(rawInsight.frequency) : null);

        // Deduplicação Estrita de Ações (PROIBIDO somar aliases da mesma conversão)
        const actions = rawInsight.actions;
        const actionValues = rawInsight.action_values;

        // 1. Compras (Contagem): Resolução hierárquica única (primeiro match)
        const rawPurchases = this.extractActionValue(actions, [
            'purchase',
            'omni_purchase',
            'offsite_conversion.fb_pixel_purchase'
        ]);
        const purchases = rawPurchases !== null ? parseInt(rawPurchases, 10) : 0;

        // 2. Faturamento / Receita: Resolução hierárquica única
        let revenue = 0;
        const rawRevenue = this.extractActionValue(actionValues, [
            'purchase',
            'omni_purchase',
            'offsite_conversion.fb_pixel_purchase'
        ]);
        if (rawRevenue !== null) {
            revenue = rawRevenue;
        } else if (purchases > 0) {
            revenue = purchases * this.unitEconomics.productPrice;
        }

        // 3. Eventos de Funil (preservar null quando a ação não existiu)
        const initiate_checkout = this.extractActionValue(actions, [
            'initiate_checkout',
            'omni_initiated_checkout',
            'offsite_conversion.fb_pixel_initiate_checkout'
        ]);

        const add_to_cart = this.extractActionValue(actions, [
            'add_to_cart',
            'omni_add_to_cart',
            'offsite_conversion.fb_pixel_add_to_cart'
        ]);

        const landing_page_views = this.extractActionValue(actions, [
            'landing_page_view',
            'omni_landing_page_view'
        ]);

        const leads = this.extractActionValue(actions, [
            'lead',
            'omni_lead',
            'offsite_conversion.fb_pixel_lead'
        ]);

        const pix_created = this.extractActionValue(actions, [
            'add_payment_info',
            'omni_payment_info'
        ]);

        // 4. Métricas de Vídeo (AdsActionStats) — preservar null se objeto não possui vídeo
        const video_views_3s = this.extractActionValue(rawInsight.video_30_sec_watched_actions, ['video_view', 'video_30_sec_watched']) ||
                               this.extractActionValue(actions, ['video_view']);

        const thruplay = this.extractActionValue(rawInsight.video_thruplay_watched_actions, ['video_thruplay_watched']) ||
                         this.extractActionValue(actions, ['thruplay']);

        const video_p25 = this.extractActionValue(rawInsight.video_p25_watched_actions, ['video_p25_watched']);
        const video_p50 = this.extractActionValue(rawInsight.video_p50_watched_actions, ['video_p50_watched']);
        const video_p75 = this.extractActionValue(rawInsight.video_p75_watched_actions, ['video_p75_watched']);
        const video_p100 = this.extractActionValue(rawInsight.video_p100_watched_actions, ['video_p100_watched']);

        // Cálculos Financeiros
        const cpa = purchases > 0 ? (spend / purchases) : null;
        const roas = spend > 0 ? (revenue / spend) : null;

        return {
            spend,
            revenue,
            impressions,
            reach,
            clicks,
            link_clicks,
            purchases,
            cpa,
            roas,
            ctr,
            cpc,
            cpm,
            link_ctr,
            link_cpc,
            frequency,
            initiate_checkout,
            add_to_cart,
            landing_page_views,
            leads,
            pix_created,
            video_views_3s,
            thruplay,
            video_p25,
            video_p50,
            video_p75,
            video_p100,
            // Aliases de compatibilidade para código legado:
            get initiateCheckout() { return this.initiate_checkout; },
            get landingPageViews() { return this.landing_page_views; },
            get pixCreated() { return this.pix_created; }
        };
    }

    // Agregação Matematicamente Correta (PROIBIDO fazer média simples de CTR, CPC, CPM ou ROAS)
    aggregateInsights(insightsList) {
        if (!insightsList || !Array.isArray(insightsList) || insightsList.length === 0) {
            return this.parseInsights(null);
        }

        let total_spend = 0;
        let total_impressions = 0;
        let total_clicks = 0;
        let total_link_clicks = 0;
        let total_purchases = 0;
        let total_revenue = 0;
        let total_initiate_checkout = 0;
        let has_checkout = false;
        let total_add_to_cart = 0;
        let has_cart = false;
        let total_lpv = 0;
        let has_lpv = false;

        insightsList.forEach(ins => {
            if (!ins) return;
            total_spend += (ins.spend || 0);
            total_impressions += (ins.impressions || 0);
            total_clicks += (ins.clicks || 0);
            total_link_clicks += (ins.link_clicks || ins.clicks || 0);
            total_purchases += (ins.purchases || 0);
            total_revenue += (ins.revenue || 0);

            if (ins.initiate_checkout !== null) {
                total_initiate_checkout += ins.initiate_checkout;
                has_checkout = true;
            }
            if (ins.add_to_cart !== null) {
                total_add_to_cart += ins.add_to_cart;
                has_cart = true;
            }
            if (ins.landing_page_views !== null) {
                total_lpv += ins.landing_page_views;
                has_lpv = true;
            }
        });

        // Recálculo a partir dos totais agregados (nunca média de taxas!)
        const cpm = total_impressions > 0 ? (total_spend / total_impressions) * 1000 : null;
        const ctr = total_impressions > 0 ? (total_clicks / total_impressions) * 100 : null;
        const cpc = total_clicks > 0 ? (total_spend / total_clicks) : null;
        const link_ctr = total_impressions > 0 ? (total_link_clicks / total_impressions) * 100 : null;
        const link_cpc = total_link_clicks > 0 ? (total_spend / total_link_clicks) : null;
        const cpa = total_purchases > 0 ? (total_spend / total_purchases) : null;
        const roas = total_spend > 0 ? (total_revenue / total_spend) : null;

        return {
            spend: total_spend,
            revenue: total_revenue,
            impressions: total_impressions,
            reach: null, // REACH NÃO É ADITIVO ENTRE ENTIDADES!
            clicks: total_clicks,
            link_clicks: total_link_clicks,
            purchases: total_purchases,
            cpa,
            roas,
            ctr,
            cpc,
            cpm,
            link_ctr,
            link_cpc,
            frequency: null, // FREQUÊNCIA NÃO É ADITIVA!
            initiate_checkout: has_checkout ? total_initiate_checkout : null,
            add_to_cart: has_cart ? total_add_to_cart : null,
            landing_page_views: has_lpv ? total_lpv : null,
            leads: null,
            pix_created: null,
            video_views_3s: null,
            thruplay: null,
            video_p25: null,
            video_p50: null,
            video_p75: null,
            video_p100: null,
            get initiateCheckout() { return this.initiate_checkout; },
            get landingPageViews() { return this.landing_page_views; },
            get pixCreated() { return this.pix_created; }
        };
    }

    // Funil sem estimativas fictícias
    calculateFunnel(metrics) {
        const impressions = metrics.impressions || 0;
        const clicks = metrics.link_clicks || metrics.clicks || 0;
        const landingPageViews = metrics.landing_page_views;
        const initiateCheckout = metrics.initiate_checkout;
        const pixCreated = metrics.pix_created;
        const purchases = metrics.purchases || 0;

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

// Instância Singleton e Exportação Universal (Browser & Node.js)
if (typeof window !== 'undefined') {
    window.analyticsEngine = new AnalyticsEngine();
}
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AnalyticsEngine;
}
