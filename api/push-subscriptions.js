// ==============================================================================
// VERCEL SERVERLESS BACKEND - WEB PUSH SUBSCRIPTION & DISPATCH ENGINE
// Multi-Device • Persistent KV Storage • Pure Node Crypto RFC 8291 (Zero External Dependencies)
// ==============================================================================

const https = require('https');
const crypto = require('crypto');
const { storage } = require('../lib/storage-adapter.js');
const authGuard = require('../lib/auth-guard.js');

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || 'BEuH-34ExTS9HNtHT5H2-zODJ8Df3SsvBcm1jgA8wowVtnr_l6MsikbO4tyvjUYcmKl2cMJIT1XYEL5NArnh8vY';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || 'y6ADi0UqMqvDcSiwIwlwxsQzKO4L3r8FDIPY1LW_WqA';
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:admin@radwanads.com';

function base64UrlEncode(buffer) {
    return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(str) {
    let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4) base64 += '=';
    return Buffer.from(base64, 'base64');
}

/**
 * Cria o JWT de autenticação VAPID assinado com ES256
 */
function createVapidJwt(audience) {
    const header = { alg: 'ES256', typ: 'JWT' };
    const now = Math.floor(Date.now() / 1000);
    const exp = now + (12 * 3600); // 12h
    const payload = {
        aud: audience,
        exp: exp,
        sub: VAPID_SUBJECT
    };

    const encodedHeader = base64UrlEncode(Buffer.from(JSON.stringify(header)));
    const encodedPayload = base64UrlEncode(Buffer.from(JSON.stringify(payload)));
    const signingInput = `${encodedHeader}.${encodedPayload}`;

    // Importa chave privada JWK / Base64 Raw
    const privD = base64UrlDecode(VAPID_PRIVATE_KEY);
    const pubKey = base64UrlDecode(VAPID_PUBLIC_KEY);
    const x = pubKey.subarray(1, 33);
    const y = pubKey.subarray(33, 65);

    const jwk = {
        kty: 'EC',
        crv: 'P-256',
        x: base64UrlEncode(x),
        y: base64UrlEncode(y),
        d: base64UrlEncode(privD)
    };

    const privateKeyObj = crypto.createPrivateKey({ format: 'jwk', key: jwk });
    const sign = crypto.createSign('SHA256');
    sign.update(signingInput);
    sign.end();

    const derSignature = sign.sign(privateKeyObj);

    // Converte assinatura DER para formato R || S (64 bytes) para Web Push ES256
    let r, s;
    let offset = 4;
    const rLen = derSignature[offset - 1];
    r = derSignature.subarray(offset, offset + rLen);
    offset += rLen + 2;
    const sLen = derSignature[offset - 1];
    s = derSignature.subarray(offset, offset + sLen);

    if (r.length > 32) r = r.subarray(r.length - 32);
    if (s.length > 32) s = s.subarray(s.length - 32);
    if (r.length < 32) r = Buffer.concat([Buffer.alloc(32 - r.length, 0), r]);
    if (s.length < 32) s = Buffer.concat([Buffer.alloc(32 - s.length, 0), s]);

    const rawSignature = Buffer.concat([r, s]);
    const encodedSignature = base64UrlEncode(rawSignature);

    return `${signingInput}.${encodedSignature}`;
}

/**
 * Criptografia de Payload RFC 8291 (aes128gcm) para Web Push Seguro
 */
function encryptPayload(payloadText, p256dhBase64, authBase64) {
    const userPublicKey = base64UrlDecode(p256dhBase64);
    const userAuthSecret = base64UrlDecode(authBase64);

    const localEcdh = crypto.createECDH('prime256v1');
    localEcdh.generateKeys();
    const localPublicKey = localEcdh.getPublicKey();

    const sharedSecret = localEcdh.computeSecret(userPublicKey);

    // HKDF para info 'auth'
    const authInfo = Buffer.from('WebPush: info\0', 'utf8');
    const ikm = crypto.hkdfSync('sha256', sharedSecret, userAuthSecret, Buffer.concat([authInfo, userPublicKey, localPublicKey]), 32);

    const salt = crypto.randomBytes(16);

    const prkKey = crypto.hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0', 'utf8'), 16);
    const prkNonce = crypto.hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0', 'utf8'), 12);

    const cipher = crypto.createCipheriv('aes-128-gcm', prkKey, prkNonce);
    const payloadBuf = Buffer.from(payloadText, 'utf8');
    const padding = Buffer.from([0x02]); // RFC 8291 delimiter
    const record = Buffer.concat([payloadBuf, padding]);

    const ciphertext = Buffer.concat([cipher.update(record), cipher.final()]);
    const tag = cipher.getAuthTag();

    const recordSize = 4096;
    const header = Buffer.alloc(21 + localPublicKey.length);
    salt.copy(header, 0);
    header.writeUInt32BE(recordSize, 16);
    header.writeUInt8(localPublicKey.length, 20);
    localPublicKey.copy(header, 21);

    return Buffer.concat([header, ciphertext, tag]);
}

/**
 * Dispara uma notificação Web Push para uma subscription específica
 */
async function sendSinglePush(subscription, payloadObj) {
    return new Promise((resolve, reject) => {
        try {
            const endpointUrl = new URL(subscription.endpoint);
            const audience = `${endpointUrl.protocol}//${endpointUrl.hostname}`;
            const jwt = createVapidJwt(audience);

            const payloadStr = JSON.stringify(payloadObj);
            const bodyBuffer = (subscription.keys && subscription.keys.p256dh && subscription.keys.auth)
                ? encryptPayload(payloadStr, subscription.keys.p256dh, subscription.keys.auth)
                : Buffer.from(payloadStr, 'utf8');

            const headers = {
                'TTL': '86400',
                'Urgency': 'high',
                'Authorization': `vapid t=${jwt}, k=${VAPID_PUBLIC_KEY}`,
                'Content-Length': bodyBuffer.length
            };

            if (subscription.keys && subscription.keys.p256dh) {
                headers['Content-Type'] = 'application/octet-stream';
                headers['Content-Encoding'] = 'aes128gcm';
            } else {
                headers['Content-Type'] = 'application/json';
            }

            const req = https.request({
                hostname: endpointUrl.hostname,
                port: endpointUrl.port || 443,
                path: endpointUrl.pathname + endpointUrl.search,
                method: 'POST',
                headers: headers
            }, (res) => {
                let resData = '';
                res.on('data', c => resData += c);
                res.on('end', () => {
                    if (res.statusCode === 201 || res.statusCode === 200 || res.statusCode === 202) {
                        resolve({ success: true, statusCode: res.statusCode });
                    } else if (res.statusCode === 404 || res.statusCode === 410) {
                        // Subscription expirada/desinstalada
                        resolve({ success: false, expired: true, statusCode: res.statusCode });
                    } else {
                        resolve({ success: false, statusCode: res.statusCode, error: resData });
                    }
                });
            });

            req.on('error', (err) => resolve({ success: false, error: err.message }));
            req.setTimeout(7000, () => {
                req.destroy();
                resolve({ success: false, error: 'Push timeout 7s' });
            });

            req.write(bodyBuffer);
            req.end();

        } catch (err) {
            resolve({ success: false, error: err.message });
        }
    });
}

/**
 * Dispara notificação push para todas as subscriptions ativas registradas
 */
async function broadcastPush(notificationPayload) {
    try {
        const stored = await storage.list('push_subscriptions') || [];
        const validSubs = stored.filter(s => s && s.endpoint);

        if (validSubs.length === 0) {
            return { total: 0, sent: 0, expired: 0 };
        }

        const results = await Promise.all(validSubs.map(async (sub) => {
            const res = await sendSinglePush(sub, notificationPayload);
            if (res.expired) {
                const subKey = Buffer.from(sub.endpoint).toString('base64').replace(/[^a-zA-Z0-9]/g, '_').slice(-40);
                await storage.delete('push_subscriptions', subKey);
            }
            return res;
        }));

        const sent = results.filter(r => r.success).length;
        const expired = results.filter(r => r.expired).length;

        return { total: validSubs.length, sent, expired };
    } catch (e) {
        console.error('[WebPush Broadcast Error]', e);
        return { total: 0, sent: 0, error: e.message };
    }
}

// ─── API ROUTE HANDLER ─────────────────────────────────────────────────────────

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') return res.status(200).end();

    const authCheck = authGuard.validateAdminSession(req);
    if (!authCheck.authenticated) {
        return res.status(401).json({ success: false, error: 'Autenticação necessária' });
    }

    // 1. GET: Retorna chave pública VAPID e status de subscriptions
    if (req.method === 'GET') {
        const action = req.query.action;
        if (action === 'public_key') {
            return res.status(200).json({
                success: true,
                publicKey: VAPID_PUBLIC_KEY
            });
        }

        const stored = await storage.list('push_subscriptions') || [];
        return res.status(200).json({
            success: true,
            publicKey: VAPID_PUBLIC_KEY,
            subscriptionCount: stored.length
        });
    }

    // 2. POST: Salvar nova subscription ou enviar push de teste
    if (req.method === 'POST') {
        const action = req.query.action;

        // Teste de Push
        if (action === 'test') {
            const testType = req.query.type || 'approved';
            const isApproved = testType === 'approved';
            const testPayload = {
                title: isApproved ? '🟢 [TESTE] Pagamento aprovado' : '🟡 [TESTE] Venda pendente',
                body: isApproved ? 'R$ 89,90 • Venda confirmada' : 'R$ 89,90 • PIX aguardando pagamento',
                icon: '/assets/logo-radwan-ads.png',
                badge: '/assets/logo-radwan-ads.png',
                tag: `test-${Date.now()}`,
                data: { url: '/#orders', test: true }
            };

            const pushResult = await broadcastPush(testPayload);
            return res.status(200).json({
                success: true,
                message: 'Push de teste disparado com sucesso',
                result: pushResult
            });
        }

        // Salvar Subscription
        const subscription = req.body;
        if (!subscription || !subscription.endpoint) {
            return res.status(400).json({ success: false, error: 'Subscription endpoint obrigatório' });
        }

        const subKey = Buffer.from(subscription.endpoint).toString('base64').replace(/[^a-zA-Z0-9]/g, '_').slice(-40);
        await storage.set('push_subscriptions', subKey, subscription);

        return res.status(200).json({
            success: true,
            message: 'Dispositivo cadastrado com sucesso para notificações Web Push'
        });
    }

    // 3. DELETE: Descadastrar subscription
    if (req.method === 'DELETE') {
        const { endpoint } = req.body || {};
        if (endpoint) {
            const subKey = Buffer.from(endpoint).toString('base64').replace(/[^a-zA-Z0-9]/g, '_').slice(-40);
            await storage.delete('push_subscriptions', subKey);
        }
        return res.status(200).json({ success: true, message: 'Dispositivo descadastrado' });
    }

    return res.status(405).json({ success: false, message: 'Método não permitido' });
};

module.exports.broadcastPush = broadcastPush;
module.exports.sendSinglePush = sendSinglePush;
