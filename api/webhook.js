// ==============================================================================
// VERCEL SERVERLESS BACKEND - WEBHOOK DUTTYFY / GATEWAY PIX (SERVER-SIDE CAPI)
// Zero Untracked Sales • Instant Meta CAPI Sync • Strict Idempotency
// ==============================================================================

const trackingGateway = require('./tracking-gateway.js');
const { storage } = require('../lib/storage-adapter.js');

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Webhook-Secret');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method === 'GET') {
        return res.status(200).json({
            status: 'ONLINE',
            service: 'BrasilVendas Webhook & Meta CAPI Engine',
            version: '2.0.0',
            timestamp: new Date().toISOString()
        });
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, message: 'Método não permitido' });
    }

    try {
        const body = req.body || {};
        console.log('[Webhook Received]', JSON.stringify(body));

        // Normalização flexível do ID da transação
        const txId = body.transactionId || body.transaction_id || body.id || (body.data && (body.data.transactionId || body.data.id));
        const rawStatus = (body.status || body.event || (body.data && body.data.status) || '').toLowerCase();
        const amount = body.amount || body.value || (body.data && (body.data.amount || body.data.value));

        if (!txId) {
            return res.status(400).json({ success: false, message: 'transaction_id ausente no payload do webhook' });
        }

        // Verifica se o evento é de pagamento aprovado
        const isPaid = ['paid', 'approved', 'pago', 'completed', 'transaction.paid', 'payment.approved'].some(s => rawStatus.includes(s));

        // Preview Guard: Em Preview, webhooks reais são suprimidos para evitar contaminação
        const isPreview = process.env.VERCEL_ENV === 'preview' || process.env.PREVIEW_MODE === 'true';
        const isTestEvent = Boolean(body.sandbox || body.is_test || String(txId).startsWith('TEST_') || String(txId).startsWith('preview_'));

        if (isPreview && !isTestEvent && isPaid) {
            console.log(`[Webhook Preview Guard] Evento de produção real (${txId}) ignorado no ambiente Preview para evitar poluição.`);
            return res.status(200).json({
                success: true,
                preview_mode: true,
                skipped: true,
                message: 'Ambiente Preview: Webhook de produção real ignorado com segurança.',
                transaction_id: txId
            });
        }

        if (isPaid) {
            console.log(`[Webhook] Processando pagamento confirmado para transação: ${txId}`);
            const result = await trackingGateway.processPaymentConfirmed(txId, amount);
            
            return res.status(200).json({
                success: true,
                message: 'Pagamento processado com sucesso e sincronizado via Meta CAPI',
                transaction_id: txId,
                meta_capi: result.results.meta_capi
            });
        }

        return res.status(200).json({
            success: true,
            message: `Evento recebido (status: ${rawStatus}), sem ação necessária.`,
            transaction_id: txId
        });

    } catch (error) {
        console.error('[Webhook Processing Error]', error);
        return res.status(500).json({ success: false, error: error.message });
    }
};
