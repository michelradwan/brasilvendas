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

        // Taxas de Progressão entre Etapas
        const rateSessionToCheckout = totalSessions > 0 ? parseFloat(((checkoutStarted / totalSessions) * 100).toFixed(1)) : 0;
        const rateCheckoutToPix = checkoutStarted > 0 ? parseFloat(((pixGenerated / checkoutStarted) * 100).toFixed(1)) : 0;
        const ratePixToPurchase = pixGenerated > 0 ? parseFloat(((purchaseCompleted / pixGenerated) * 100).toFixed(1)) : 0;

        return {
            steps: [
                {
                    id: 'pageview',
                    name: '1. Sessões no Site',
                    count: totalSessions,
                    pct: 100,
                    drop_off_pct: dropPageToCheckout,
                    progression_rate: rateSessionToCheckout
                },
                {
                    id: 'checkout',
                    name: '2. Checkout Iniciado',
                    count: checkoutStarted,
                    pct: totalSessions > 0 ? parseFloat(((checkoutStarted / totalSessions) * 100).toFixed(1)) : 0,
                    drop_off_pct: dropCheckoutToPix,
                    progression_rate: rateCheckoutToPix
                },
                {
                    id: 'pix',
                    name: '3. PIX Gerado',
                    count: pixGenerated,
                    pct: totalSessions > 0 ? parseFloat(((pixGenerated / totalSessions) * 100).toFixed(1)) : 0,
                    drop_off_pct: dropPixToPurchase,
                    progression_rate: ratePixToPurchase
                },
                {
                    id: 'purchase',
                    name: '4. Compra Confirmada',
                    count: purchaseCompleted,
                    pct: totalSessions > 0 ? parseFloat(((purchaseCompleted / totalSessions) * 100).toFixed(1)) : 0,
                    drop_off_pct: 0,
                    progression_rate: 100
                }
            ],
            rates: {
                session_to_checkout: rateSessionToCheckout,
                checkout_to_pix: rateCheckoutToPix,
                pix_to_purchase: ratePixToPurchase,
                session_to_purchase: totalSessions > 0 ? parseFloat(((purchaseCompleted / totalSessions) * 100).toFixed(2)) : 0
            },
            summary: {
                total_visitors: totalSessions,
                converters: purchaseCompleted,
                overall_conversion_rate: totalSessions > 0 ? parseFloat(((purchaseCompleted / totalSessions) * 100).toFixed(2)) : 0
            }
        };
    }
}

module.exports = new FunnelEngine();
