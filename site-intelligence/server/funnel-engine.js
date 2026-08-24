// ==============================================================================
// SITE INTELLIGENCE — FUNNEL ENGINE
// Análise de etapas e taxas de queda (drop-off) no funil de conversão
// ==============================================================================

class FunnelEngine {
    /**
     * Monta o funil comportamental com contagens exatas e drop-offs
     */
    calculateFunnel(sessions = []) {
        const totalSessions = sessions.length;
        let checkoutStarted = 0;
        let pixGenerated = 0;
        let purchaseCompleted = 0;

        sessions.forEach(s => {
            if (s.reached_checkout) checkoutStarted++;
            if (s.generated_pix) pixGenerated++;
            if (s.purchased) purchaseCompleted++;
        });

        // Cálculo de Drop-off
        const dropPageToCheckout = totalSessions > 0 ? parseFloat((((totalSessions - checkoutStarted) / totalSessions) * 100).toFixed(1)) : 0;
        const dropCheckoutToPix = checkoutStarted > 0 ? parseFloat((((checkoutStarted - pixGenerated) / checkoutStarted) * 100).toFixed(1)) : 0;
        const dropPixToPurchase = pixGenerated > 0 ? parseFloat((((pixGenerated - purchaseCompleted) / pixGenerated) * 100).toFixed(1)) : 0;

        return {
            steps: [
                {
                    name: 'Pageview',
                    count: totalSessions,
                    pct: 100,
                    drop_off_pct: dropPageToCheckout
                },
                {
                    name: 'Initiated Checkout',
                    count: checkoutStarted,
                    pct: totalSessions > 0 ? parseFloat(((checkoutStarted / totalSessions) * 100).toFixed(1)) : 0,
                    drop_off_pct: dropCheckoutToPix
                },
                {
                    name: 'PIX Generated',
                    count: pixGenerated,
                    pct: totalSessions > 0 ? parseFloat(((pixGenerated / totalSessions) * 100).toFixed(1)) : 0,
                    drop_off_pct: dropPixToPurchase
                },
                {
                    name: 'Purchase Success',
                    count: purchaseCompleted,
                    pct: totalSessions > 0 ? parseFloat(((purchaseCompleted / totalSessions) * 100).toFixed(1)) : 0,
                    drop_off_pct: 0
                }
            ],
            summary: {
                total_visitors: totalSessions,
                converters: purchaseCompleted,
                overall_conversion_rate: totalSessions > 0 ? parseFloat(((purchaseCompleted / totalSessions) * 100).toFixed(2)) : 0
            }
        };
    }
}

module.exports = new FunnelEngine();
