// ==============================================================================
// VERCEL SERVERLESS BACKEND - GERAR PIX (100% PROTEGIDO / ZERO EXPOSIÇÃO)
// ==============================================================================

const https = require('https');

const API_URL = 'https://www.links-pagamentos.online/api-pix/Akc4K4Bs4Q9sBfbGv3Kuh-9i39GvsmiE2IjP1IuCrdIlrDHCdCHF3UQ7zMlW-QmQa7KAfnDqL6QDvKX0kG2AHg';
const API_KEY = process.env.DUTTYFY_KEY;

// ALLOWLIST OFICIAL DE PREÇOS NO SERVIDOR (EM CENTAVOS)
const ORDER_BUMP_PRICES = {
    stickers100: { priceCents: 1990, label: 'Kit 100 Adesivos' },
    flavioKeychain: { priceCents: 2490, label: 'Chaveiro Colecionável' }
};

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

    if (!API_KEY) {
        console.error('[Payment Gateway Error] DUTTYFY_KEY não configurada no servidor.');
        return res.status(500).json({
            success: false,
            error: 'CONFIGURATION_ERROR: DUTTYFY_KEY obrigatória não configurada no servidor (Fail-Closed).'
        });
    }

    try {
        const body = req.body || {};
        const customer = body.customer || {};
        const address = body.address || {};
        const shipping = body.shipping || {};
        const size = body.size || 'M';
        // Limite de 1 a 10 unidades
        const quantity = Math.min(10, Math.max(1, parseInt(body.quantity || (body.item && body.item.quantity) || 1)));

        const name = (customer.name || 'Cliente Patriota').trim();
        const cpf = (customer.document || customer.cpf || '').replace(/\D/g, '');
        const phone = (customer.phone || '11999999999').replace(/\D/g, '');
        const email = (customer.email || 'cliente@patriotas.com.br').trim();

        // Processamento seguro e com deduplicação dos Order Bumps
        const rawBumps = Array.isArray(body.orderBumps) ? body.orderBumps : [];
        const uniqueBumps = Array.from(new Set(rawBumps));

        let bumpTotalCents = 0;
        const validBumpsLabels = [];
        const validBumpsIds = [];

        uniqueBumps.forEach(bumpId => {
            if (ORDER_BUMP_PRICES[bumpId]) {
                bumpTotalCents += ORDER_BUMP_PRICES[bumpId].priceCents;
                validBumpsLabels.push(ORDER_BUMP_PRICES[bumpId].label);
                validBumpsIds.push(bumpId);
            }
        });

        const isExpress = (shipping.type === 'express');
        const kitTotalCents = quantity * 8990;
        const shippingCents = isExpress ? 999 : 0;
        const amountInCents = kitTotalCents + shippingCents + bumpTotalCents;
        const amountFormatted = amountInCents / 100;
        const shippingLabel = isExpress ? 'Full Express (3 dias úteis)' : 'Frete Grátis (7 dias úteis)';

        let itemTitle = `${quantity}x Kit Patriota 2026 (Tam ${size})`;
        if (validBumpsLabels.length > 0) {
            itemTitle += ` + ${validBumpsLabels.join(' + ')}`;
        }
        itemTitle += ` - ${shippingLabel}`;

        // Captura do AttributionContext (UTMs, FBP, FBC, FBCLID, IP, User Agent)
        const attribution = body.attribution || {
            first_touch: body.first_touch || body.utms || {},
            last_touch: body.last_touch || body.utms || {}
        };
        const clientIp = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress;
        const clientUserAgent = req.headers['user-agent'] || '';

        // Payload estrito exigido pela API da Duttyfy
        const payload = JSON.stringify({
            paymentMethod: 'PIX',
            customer: {
                name: name,
                document: cpf,
                email: email,
                phone: phone
            },
            item: {
                title: itemTitle,
                price: amountInCents,
                quantity: quantity
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

            // Persistência segura do pedido com autoridade comercial e attribution durável
            try {
                const trackingGateway = require('./tracking-gateway.js');
                await trackingGateway.saveOrderWithAttribution({
                    transaction_id: transactionId,
                    amount: amountFormatted,
                    customer: { name, document: cpf, email, phone },
                    address,
                    size,
                    quantity,
                    attribution,
                    client_ip: clientIp,
                    client_user_agent: clientUserAgent,
                    status: 'PENDING'
                });
            } catch (saveErr) {
                console.error('[Order Save Error]', saveErr);
            }

            return res.status(200).json({
                success: true,
                transaction_id: transactionId,
                pix_code: pixCode,
                qrcode_url: qrcodeUrl,
                amount: amountFormatted,
                order_bumps: validBumpsIds,
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
