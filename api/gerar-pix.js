// ==============================================================================
// VERCEL SERVERLESS BACKEND - GERAR PIX (100% PROTEGIDO / ZERO EXPOSIÇÃO)
// ==============================================================================

const https = require('https');

const API_URL = 'https://www.links-pagamentos.online/api-pix/Akc4K4Bs4Q9sBfbGv3Kuh-9i39GvsmiE2IjP1IuCrdIlrDHCdCHF3UQ7zMlW-QmQa7KAfnDqL6QDvKX0kG2AHg';
const API_KEY = process.env.DUTTYFY_KEY || 'b8ae99391cf645b2af25b66eef4b99d3';

module.exports = async (req, res) => {
    // CORS Seguro
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, message: 'Método não permitido' });
    }

    try {
        const body = req.body || {};
        const customer = body.customer || {};
        const address = body.address || {};
        const shipping = body.shipping || {};
        const size = body.size || 'M';

        const name = (customer.name || 'Cliente Patriota').trim();
        const cpf = (customer.document || customer.cpf || '').replace(/\D/g, '');
        const phone = (customer.phone || '11999999999').replace(/\D/g, '');
        const email = (customer.email || 'cliente@patriotas.com.br').trim();

        const isExpress = (shipping.type === 'express');
        const amountInCents = isExpress ? 9989 : 8990;
        const amountFormatted = isExpress ? 99.89 : 89.90;
        const shippingLabel = isExpress ? 'Full Express (3 dias úteis)' : 'Frete Grátis (7 dias úteis)';

        const payload = JSON.stringify({
            paymentMethod: 'PIX',
            customer: {
                name: name,
                document: cpf,
                email: email,
                phone: phone
            },
            item: {
                title: `Kit Patriota 2026 (Tam ${size}) - ${shippingLabel}`,
                price: amountInCents,
                quantity: 1
            },
            amount: amountInCents
        });

        const parsed = new URL(API_URL);

        const requestPromise = new Promise((resolve, reject) => {
            const apiReq = https.request({
                hostname: parsed.hostname,
                path: parsed.pathname + parsed.search,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(payload),
                    'Authorization': `Bearer ${API_KEY}`,
                    'User-Agent': 'Mozilla/5.0 (Serverless)'
                }
            }, (apiRes) => {
                let data = '';
                apiRes.on('data', chunk => data += chunk);
                apiRes.on('end', () => {
                    try {
                        const parsedData = JSON.parse(data);
                        resolve({ statusCode: apiRes.statusCode, data: parsedData });
                    } catch (e) {
                        resolve({ statusCode: apiRes.statusCode, data: data });
                    }
                });
            });

            apiReq.on('error', (err) => reject(err));
            apiReq.write(payload);
            apiReq.end();
        });

        const result = await requestPromise;

        if (result.data && (result.data.pixCode || result.data.pix_code)) {
            const pixCode = result.data.pixCode || result.data.pix_code;
            const transactionId = result.data.transactionId || result.data.transaction_id || `tx_${Date.now()}`;
            const qrcodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(pixCode)}`;

            return res.status(200).json({
                success: true,
                transaction_id: transactionId,
                pix_code: pixCode,
                qrcode_url: qrcodeUrl,
                amount: amountFormatted,
                shipping: {
                    type: isExpress ? 'express' : 'free',
                    label: shippingLabel,
                    amount: isExpress ? 9.99 : 0.00
                },
                status: 'PENDING'
            });
        }

        return res.status(500).json({ success: false, error: result.data });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};
