// ==============================================================================
// ENTERPRISE TRACKING GATEWAY (META CAPI + UTMIFY SYNC + ATTRIBUTION ENGINE)
// Zero Untracked Sales • Strict Idempotency • SHA-256 Advanced Matching
// ==============================================================================

const https = require('https');
const crypto = require('crypto');
const { storage } = require('./storage-adapter.js');
const { META_GRAPH_VERSION, META_GRAPH_BASE_URL } = require('../config/meta-constants.js');

const PIXEL_ID = process.env.META_PIXEL_ID || '2292987404797869';
const META_ACCESS_TOKEN = process.env.META_ACCESS_TOKEN;
const UTMIFY_API_TOKEN = process.env.UTMIFY_API_TOKEN || process.env.UTMIFY_TOKEN;

// Helper para hash SHA-256 normalizado
function hashSha256(value) {
    if (!value) return null;
    const clean = String(value).trim().toLowerCase();
    if (!clean) return null;
    return crypto.createHash('sha256').update(clean).digest('hex');
}

// Formatação e normalização de telefone (DDI 55 + DDD + Número)
function formatPhoneSha256(phone) {
    if (!phone) return null;
    let clean = String(phone).replace(/\D/g, '');
    if (!clean) return null;
    if (!clean.startsWith('55') && clean.length <= 11) {
        clean = '55' + clean;
    }
    return hashSha256(clean);
}

class TrackingGateway {
    constructor() {
        this.storage = storage;
    }

    // 1. Gravação e Persistência do Pedido com Attribution Context Durável
    async saveOrderWithAttribution(orderData) {
        const txId = orderData.transaction_id || orderData.id;
        if (!txId) throw new Error('transaction_id é obrigatório para registrar o pedido.');

        const attribution = orderData.attribution || {
            first_touch: orderData.first_touch || orderData.utms || {},
            last_touch: orderData.last_touch || orderData.utms || {}
        };

        const canonicalOrder = {
            transaction_id: txId,
            status: orderData.status || 'PENDING',
            amount: parseFloat(orderData.amount) || 89.90,
            amount_in_cents: Math.round((parseFloat(orderData.amount) || 89.90) * 100),
            currency: 'BRL',
            customer: {
                name: orderData.name || (orderData.customer && orderData.customer.name) || 'Cliente',
                email: orderData.email || (orderData.customer && orderData.customer.email) || '',
                phone: orderData.phone || (orderData.customer && orderData.customer.phone) || '',
                document: orderData.cpf || (orderData.customer && (orderData.customer.document || orderData.customer.cpf)) || ''
            },
            address: orderData.address || {
                cep: orderData.cep || '',
                street: orderData.street || '',
                city: orderData.city || '',
                state: orderData.state || 'SP'
            },
            items: orderData.items || [
                {
                    title: orderData.size ? `Kit Patriota 2026 (Tam ${orderData.size})` : 'Kit Patriota Oficial 2026',
                    quantity: orderData.quantity || 1,
                    price: parseFloat(orderData.amount) || 89.90
                }
            ],
            attribution: {
                utm_source: attribution.last_touch.utm_source || attribution.first_touch.utm_source || null,
                utm_medium: attribution.last_touch.utm_medium || attribution.first_touch.utm_medium || null,
                utm_campaign: attribution.last_touch.utm_campaign || attribution.first_touch.utm_campaign || null,
                utm_content: attribution.last_touch.utm_content || attribution.first_touch.utm_content || null,
                utm_term: attribution.last_touch.utm_term || attribution.first_touch.utm_term || null,
                campaign_id: attribution.last_touch.campaign_id || attribution.first_touch.campaign_id || null,
                adset_id: attribution.last_touch.adset_id || attribution.first_touch.adset_id || null,
                ad_id: attribution.last_touch.ad_id || attribution.first_touch.ad_id || null,
                src: attribution.last_touch.src || attribution.first_touch.src || null,
                sck: attribution.last_touch.sck || attribution.first_touch.sck || null,
                xcod: attribution.last_touch.xcod || attribution.first_touch.xcod || null,
                fbclid: attribution.last_touch.fbclid || attribution.first_touch.fbclid || null,
                fbp: attribution.last_touch.fbp || attribution.first_touch.fbp || null,
                fbc: attribution.last_touch.fbc || attribution.first_touch.fbc || null,
                client_ip: orderData.client_ip || null,
                client_user_agent: orderData.client_user_agent || null
            },
            created_at: orderData.created_at || new Date().toISOString(),
            paid_at: null,
            meta_capi_sent: false,
            utmify_sale_sent: false
        };

        // Salva no storage de pedidos persistentes
        await this.storage.set('actions', `ORDER_${txId}`, { result: canonicalOrder });
        return canonicalOrder;
    }

    // 2. Confirmação de Pagamento & Disparo Híbrido CAPI + UTMify
    async processPaymentConfirmed(txId, paidAmount = null) {
        const orderKey = `ORDER_${txId}`;
        const stored = await this.storage.get('actions', orderKey);
        let order = stored ? stored.result : null;

        if (!order) {
            // Se o pedido não foi pré-salvo, cria registro base
            order = await this.saveOrderWithAttribution({
                transaction_id: txId,
                status: 'PAID',
                amount: paidAmount || 89.90
            });
        }

        order.status = 'PAID';
        order.paid_at = new Date().toISOString();
        if (paidAmount) order.amount = parseFloat(paidAmount);

        const results = {
            transaction_id: txId,
            meta_capi: { sent: false, error: null },
            utmify: { sent: false, error: null }
        };

        // 3. Disparo Meta Conversions API (CAPI) Server-Side
        if (!order.meta_capi_sent) {
            try {
                const capiRes = await this.sendMetaCapiPurchase(order);
                order.meta_capi_sent = true;
                results.meta_capi = { sent: true, response: capiRes };
            } catch (capiErr) {
                results.meta_capi = { sent: false, error: capiErr.message };
            }
        } else {
            results.meta_capi = { sent: true, alreadySent: true };
        }

        // 4. Disparo UTMify Webhook / API
        if (!order.utmify_sale_sent) {
            try {
                const utmifyRes = await this.sendUtmifySale(order);
                order.utmify_sale_sent = true;
                results.utmify = { sent: true, response: utmifyRes };
            } catch (utmErr) {
                results.utmify = { sent: false, error: utmErr.message };
            }
        } else {
            results.utmify = { sent: true, alreadySent: true };
        }

        // Atualiza pedido no storage
        await this.storage.set('actions', orderKey, { result: order });
        return { success: true, order, results };
    }

    // 5. Envio do Evento Purchase para o Meta Conversions API
    async sendMetaCapiPurchase(order) {
        const token = process.env.META_ACCESS_TOKEN || META_ACCESS_TOKEN;
        if (!token) {
            console.warn('[CAPI Warning] META_ACCESS_TOKEN não configurado. CAPI ignorado.');
            return { skipped: true, reason: 'META_ACCESS_TOKEN_MISSING' };
        }

        const attr = order.attribution || {};
        const cust = order.customer || {};
        const addr = order.address || {};

        // Extração de primeiro e último nome
        const nameParts = (cust.name || '').trim().split(' ');
        const firstName = nameParts[0] || '';
        const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : '';

        // Montagem dos Dados de Usuário com Hashing SHA-256
        const userData = {
            em: cust.email ? [hashSha256(cust.email)] : [],
            ph: cust.phone ? [formatPhoneSha256(cust.phone)] : [],
            fn: firstName ? [hashSha256(firstName)] : [],
            ln: lastName ? [hashSha256(lastName)] : [],
            ct: addr.city ? [hashSha256(addr.city)] : [],
            st: addr.state ? [hashSha256(addr.state)] : [],
            zp: addr.cep ? [hashSha256(addr.cep.replace(/\D/g, ''))] : [],
            country: [hashSha256('br')]
        };

        if (attr.fbp) userData.fbp = attr.fbp;
        if (attr.fbc) userData.fbc = attr.fbc;
        if (attr.client_ip) userData.client_ip_address = attr.client_ip;
        if (attr.client_user_agent) userData.client_user_agent = attr.client_user_agent;

        const payload = {
            data: [
                {
                    event_name: 'Purchase',
                    event_time: Math.floor(Date.now() / 1000),
                    event_id: order.transaction_id, // Deduplicação estrita com o frontend
                    event_source_url: process.env.SITE_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://brasilvendas.vercel.app'),
                    action_source: 'website',
                    user_data: userData,
                    custom_data: {
                        currency: 'BRL',
                        value: order.amount || 89.90,
                        content_name: 'Kit Patriota Oficial 2026',
                        content_type: 'product',
                        order_id: order.transaction_id
                    }
                }
            ]
        };

        const url = `${META_GRAPH_BASE_URL}/${PIXEL_ID}/events?access_token=${token}`;
        const parsed = new URL(url);
        const postData = JSON.stringify(payload);

        return new Promise((resolve, reject) => {
            const req = https.request({
                hostname: parsed.hostname,
                path: parsed.pathname + parsed.search,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(postData),
                    'User-Agent': 'BrasilVendasCAPI/2.0'
                }
            }, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        const json = JSON.parse(data);
                        if (json.error) {
                            reject(new Error(`CAPI Error [${json.error.code}]: ${json.error.message}`));
                        } else {
                            resolve(json);
                        }
                    } catch (e) {
                        resolve({ raw: data });
                    }
                });
            });

            req.on('error', err => reject(err));
            req.setTimeout(15000, () => {
                req.destroy();
                reject(new Error('Timeout de 15s no envio do Meta CAPI'));
            });
            req.write(postData);
            req.end();
        });
    }

    // 6. Notificação Direta para o Webhook / API da UTMify
    async sendUtmifySale(order) {
        const attr = order.attribution || {};
        const cust = order.customer || {};

        const utmifyPayload = {
            orderId: order.transaction_id,
            platform: 'BrasilVendas',
            paymentMethod: 'PIX',
            status: 'paid',
            createdAt: order.created_at || new Date().toISOString(),
            approvedDate: order.paid_at || new Date().toISOString(),
            customer: {
                name: cust.name,
                email: cust.email,
                phone: cust.phone,
                document: cust.document
            },
            products: [
                {
                    id: 'kit_patriota_2026',
                    name: 'Kit Patriota Oficial 2026',
                    price: Math.round((order.amount || 89.90) * 100),
                    quantity: 1
                }
            ],
            commission: {
                totalPriceInCents: Math.round((order.amount || 89.90) * 100)
            },
            trackingParameters: {
                src: attr.src || null,
                sck: attr.sck || null,
                utm_source: attr.utm_source || null,
                utm_campaign: attr.utm_campaign || null,
                utm_medium: attr.utm_medium || null,
                utm_content: attr.utm_content || null,
                utm_term: attr.utm_term || null,
                campaign_id: attr.campaign_id || null,
                adset_id: attr.adset_id || null,
                ad_id: attr.ad_id || null,
                fbclid: attr.fbclid || null,
                xcod: attr.xcod || null
            }
        };

        // Envio para o Webhook da UTMify se configurado
        const utmifyWebhookUrl = process.env.UTMIFY_WEBHOOK_URL;
        if (!utmifyWebhookUrl) {
            return { skipped: true, reason: 'UTMIFY_WEBHOOK_URL_NOT_CONFIGURED', payload: utmifyPayload };
        }

        const parsed = new URL(utmifyWebhookUrl);
        const postData = JSON.stringify(utmifyPayload);

        return new Promise((resolve, reject) => {
            const req = https.request({
                hostname: parsed.hostname,
                path: parsed.pathname + parsed.search,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(postData),
                    'User-Agent': 'BrasilVendasUtmify/2.0'
                }
            }, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    resolve({ statusCode: res.statusCode, raw: data });
                });
            });

            req.on('error', err => reject(err));
            req.setTimeout(15000, () => {
                req.destroy();
                reject(new Error('Timeout de 15s no envio UTMify'));
            });
            req.write(postData);
            req.end();
        });
    }
}

module.exports = new TrackingGateway();
