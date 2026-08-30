// ==============================================================================
// VERCEL SERVERLESS BACKEND - CONSULTAR STATUS PIX
// ==============================================================================

const https = require('https');

const API_KEY = process.env.DUTTYFY_KEY;

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (!API_KEY) {
        console.error('[Payment Gateway Error] DUTTYFY_KEY não configurada no servidor.');
        return res.status(500).json({
            success: false,
            error: 'CONFIGURATION_ERROR: DUTTYFY_KEY obrigatória não configurada no servidor (Fail-Closed).'
        });
    }

    const txId = req.query.id || (req.body && req.body.id);
    if (!txId) {
        return res.status(200).json({ success: false, status: 'pending' });
    }

    const apiUrl = `https://www.links-pagamentos.online/api-pix/status/${encodeURIComponent(txId)}`;
    const parsed = new URL(apiUrl);

    try {
        const checkPromise = new Promise((resolve, reject) => {
            const apiReq = https.request({
                hostname: parsed.hostname,
                path: parsed.pathname + parsed.search,
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${API_KEY}`,
                    'Accept': 'application/json',
                    'User-Agent': 'Mozilla/5.0 (Serverless)'
                }
            }, (apiRes) => {
                let data = '';
                apiRes.on('data', chunk => data += chunk);
                apiRes.on('end', () => {
                    try {
                        resolve(JSON.parse(data));
                    } catch (e) {
                        resolve({ status: 'pending' });
                    }
                });
            });

            apiReq.on('error', (e) => reject(e));
            apiReq.end();
        });

        const data = await checkPromise;
        let status = 'pending';
        if (data && data.status && ['paid', 'approved', 'pago', 'completed'].includes(data.status.toLowerCase())) {
            status = 'paid';

            // Disparo Seguro de CAPI + UTMify de forma assíncrona / idempotente
            try {
                const trackingGateway = require('./tracking-gateway.js');
                await trackingGateway.processPaymentConfirmed(txId, data.amount || data.value);
            } catch (trackErr) {
                console.error('[Tracking Gateway Error]', trackErr);
            }
        }

        return res.status(200).json({
            success: true,
            transaction_id: txId,
            status: status
        });
    } catch (e) {
        return res.status(200).json({ success: true, transaction_id: txId, status: 'pending' });
    }
};
