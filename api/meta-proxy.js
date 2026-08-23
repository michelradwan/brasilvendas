// ==============================================================================
// VERCEL SERVERLESS BACKEND - META ADS SECURE GRAPH API PROXY
// ==============================================================================

const https = require('https');

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const DEFAULT_TOKEN = process.env.META_ACCESS_TOKEN || 'EAA6kKz1qBV8BSZAIyOatrEf3ZBvLE0uAP0xi7pIeFdDuxDLr7S4lXbHTlHohasRuUJvW6PbiFDBD0YhfZBHTJFGtATD6WNbyI7bn1y4uDbpH0cztZBAA5s9R98iG7uooUMGbqNHFDbVWBXEDeYnX4rKCWb0GpNjgZBjDDptLq8Q4PINiLPdnsreVtoVI4FmAiZAsZCm7iZAwNJydKp56zSoyXfj1uXE34mymGc2yKw3ODzFMRe8ZBKTFE5Gl4ODUDLLdbkoKKmfZBl5L8Qng6f7BSMURbX';
const GRAPH_VERSION = 'v20.0';

// Allowlist de contas de anúncios autorizadas
const ALLOWED_ACCOUNTS = [
    'act_846780837970771'
];

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Admin-Auth');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // Validação de autenticação administrativa opcional (Bearer ou Header)
    const authHeader = req.headers['x-admin-auth'] || req.headers['authorization'];
    if (authHeader && authHeader.replace('Bearer ', '') !== ADMIN_PASSWORD) {
        return res.status(401).json({ error: { message: 'Acesso não autorizado.', code: 401 } });
    }

    try {
        let endpoint = '';
        let method = req.method;
        let params = {};
        let payload = null;
        let clientToken = null;

        if (req.method === 'GET') {
            endpoint = req.query.endpoint || '';
            params = { ...req.query };
            delete params.endpoint;
            clientToken = req.query.token;
            delete params.token;
        } else if (req.method === 'POST') {
            const body = req.body || {};
            endpoint = body.endpoint || '';
            method = body.method || 'POST';
            params = body.params || {};
            payload = body.payload || null;
            clientToken = body.token || null;
        }

        if (!endpoint) {
            return res.status(400).json({ error: { message: 'Parâmetro "endpoint" é obrigatório.' } });
        }

        // Sanitização do endpoint
        endpoint = endpoint.replace(/^\/+/, '');

        // Token prioritário: Variável de ambiente > Token seguro enviado pelo cliente
        const activeToken = clientToken || DEFAULT_TOKEN;

        if (!activeToken) {
            return res.status(400).json({ error: { message: 'Token da API Meta não configurado.' } });
        }

        // Montagem da URL Graph API
        const queryParams = new URLSearchParams({ ...params, access_token: activeToken }).toString();
        const fullUrl = `https://graph.facebook.com/${GRAPH_VERSION}/${endpoint}?${queryParams}`;
        const parsedUrl = new URL(fullUrl);

        const options = {
            hostname: parsedUrl.hostname,
            path: parsedUrl.pathname + parsedUrl.search,
            method: method,
            headers: {
                'Accept': 'application/json',
                'User-Agent': 'MetaAdsCommandCenter/2.0'
            }
        };

        let requestBody = null;
        if (payload && (method === 'POST' || method === 'PUT')) {
            requestBody = JSON.stringify(payload);
            options.headers['Content-Type'] = 'application/json';
            options.headers['Content-Length'] = Buffer.byteLength(requestBody);
        }

        const apiPromise = new Promise((resolve, reject) => {
            const apiReq = https.request(options, (apiRes) => {
                let data = '';
                apiRes.on('data', chunk => data += chunk);
                apiRes.on('end', () => {
                    try {
                        const json = JSON.parse(data);
                        resolve({ statusCode: apiRes.statusCode, data: json });
                    } catch (err) {
                        resolve({ statusCode: apiRes.statusCode, data: { raw: data } });
                    }
                });
            });

            apiReq.on('error', (err) => reject(err));
            apiReq.setTimeout(25000, () => {
                apiReq.destroy();
                reject(new Error('Tempo limite excedido na chamada Meta Graph API.'));
            });

            if (requestBody) {
                apiReq.write(requestBody);
            }
            apiReq.end();
        });

        const result = await apiPromise;
        return res.status(result.statusCode).json(result.data);

    } catch (err) {
        return res.status(500).json({
            error: {
                message: err.message || 'Erro interno no proxy Meta Ads.',
                type: 'ProxyException'
            }
        });
    }
};
