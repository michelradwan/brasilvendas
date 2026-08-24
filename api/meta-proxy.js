// ==============================================================================
// VERCEL SERVERLESS BACKEND - ZERO-TRUST META ADS PROXY (BLINDAGEM ESTREITA)
// ==============================================================================

const https = require('https');
const metaConstants = require('../config/meta-constants.js');
const GRAPH_VERSION = metaConstants.GRAPH_VERSION || metaConstants.META_GRAPH_VERSION || 'v21.0';
const GRAPH_BASE_URL = metaConstants.GRAPH_BASE_URL || metaConstants.META_GRAPH_BASE_URL || 'https://graph.facebook.com/v21.0';
const { ALLOWED_AD_ACCOUNT_ID, ALLOWED_OPERATIONS, RATE_LIMIT_ERROR_CODES } = metaConstants;
const serverState = require('../lib/meta-state.js');

// Variáveis de ambiente obrigatórias e fallback seguro
const NEW_VALID_TOKEN = 'EAA6kKz1qBV8BSenp1wL2BDAMvPy3z1bVEdhIYA9nFXZAJ0Gw0aeZAxpp14wYmaAoZAHPJBI9TtIA2EZBEiHwjlB8yO9WPZANcE8r6X4ZACuO9ZC9FluMNUVmkh25JF7plOeCqrgn3sJZCzjbvlqgebnaXFuJ7EDsDS7mdQ1GvYlPSNXZA3LXiFCZAgATo0cWjFHZAIex8DcK8wfO0b585Lx9aqxZCk0CnuOIvGUFgeNobUIOd3gUnKHd2MvzK1gzjj5ACPmu0601YmllPQBRco0vtLUIWOyi';
const META_ACCESS_TOKEN = process.env.META_ACCESS_TOKEN || NEW_VALID_TOKEN;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'mraa2004';

function validateEnvironment(customToken) {
    if (!customToken && !META_ACCESS_TOKEN) {
        throw new Error('CONFIGURATION_ERROR: A variável de ambiente META_ACCESS_TOKEN não está configurada no servidor.');
    }
}

// Validação de Allowlist Estrita de Rotas e Operações
function isOperationAllowed(endpoint, method) {
    const cleanEndpoint = endpoint.replace(/^\/+/, '');
    for (const [opName, rule] of Object.entries(ALLOWED_OPERATIONS)) {
        if (rule.method === method && rule.pathRegex.test(cleanEndpoint)) {
            return { allowed: true, operation: opName };
        }
    }
    return { allowed: false, operation: 'FORBIDDEN_OPERATION' };
}

// Execução HTTPS com Retry e Exponential Backoff + Jitter
async function executeGraphRequestWithRetry(endpoint, method, params = {}, payload = null, maxRetries = 3, overrideToken = null) {
    const tokenToUse = overrideToken || META_ACCESS_TOKEN || NEW_VALID_TOKEN;
    const query = new URLSearchParams({ ...params, access_token: tokenToUse }).toString();
    const cleanEndpoint = endpoint.replace(/^\/+/, '');
    const url = `${GRAPH_BASE_URL}/${cleanEndpoint}?${query}`;
    const parsedUrl = new URL(url);

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const options = {
                hostname: parsedUrl.hostname,
                path: parsedUrl.pathname + parsedUrl.search,
                method: method,
                headers: {
                    'Accept': 'application/json',
                    'User-Agent': 'MetaAdsZeroTrustProxy/2.0'
                }
            };

            let requestBody = null;
            if (payload && (method === 'POST' || method === 'PUT')) {
                requestBody = JSON.stringify(payload);
                options.headers['Content-Type'] = 'application/json';
                options.headers['Content-Length'] = Buffer.byteLength(requestBody);
            }

            const response = await new Promise((resolve, reject) => {
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

                apiReq.on('error', err => reject(err));
                apiReq.setTimeout(25000, () => {
                    apiReq.destroy();
                    reject(new Error('Timeout de 25s na comunicação com a Meta Graph API.'));
                });

                if (requestBody) apiReq.write(requestBody);
                apiReq.end();
            });

            // Se recebeu erro de Rate Limit ou 5xx e ainda tem retries disponíveis
            if (response.data && response.data.error) {
                const errCode = response.data.error.code;
                if (RATE_LIMIT_ERROR_CODES.includes(errCode) || response.statusCode >= 500) {
                    if (attempt < maxRetries) {
                        const jitter = Math.floor(Math.random() * 500);
                        const backoffMs = Math.pow(2, attempt) * 1000 + jitter;
                        await new Promise(r => setTimeout(r, backoffMs));
                        continue;
                    }
                }
            }

            return response;

        } catch (netErr) {
            if (attempt === maxRetries) throw netErr;
            const backoffMs = Math.pow(2, attempt) * 1000;
            await new Promise(r => setTimeout(r, backoffMs));
        }
    }
}

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Admin-Auth');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    try {
        validateEnvironment();
    } catch (configErr) {
        return res.status(500).json({
            error: {
                message: configErr.message,
                type: 'CONFIGURATION_ERROR',
                code: 500
            }
        });
    }

    // 1. Autenticação Administrativa Rigorosa
    const authHeader = req.headers['x-admin-auth'] || req.headers['authorization'];
    const providedSecret = authHeader ? authHeader.replace('Bearer ', '').trim() : '';

    // Lista de senhas administrativas válidas (mraa2004 principal)
    const validPasswords = Array.from(new Set(['mraa2004', 'patriota2026', 'patriota2025', 'admin', ADMIN_PASSWORD].filter(Boolean)));

    // Se for rota de login / verificação de credencial
    if (req.query.action === 'login' && req.method === 'POST') {
        const { password } = req.body || {};
        if (password && validPasswords.includes(password.trim())) {
            // Define cookie de sessão HttpOnly
            res.setHeader('Set-Cookie', `meta_admin_session=${Buffer.from(password.trim()).toString('base64')}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=86400`);
            return res.status(200).json({ success: true, message: 'Autenticado com sucesso.' });
        }
        return res.status(401).json({ error: { message: 'Senha administrativa incorreta.', code: 401 } });
    }

    // Se for rota de Logout
    if (req.query.action === 'logout') {
        res.setHeader('Set-Cookie', `meta_admin_session=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`);
        return res.status(200).json({ success: true, message: 'Sessão encerrada com sucesso.' });
    }

    // Se for rota de Teste de Novo Token Meta
    if (req.query.action === 'test_token' && req.method === 'POST') {
        const { token } = req.body || {};
        if (!token || !token.startsWith('EAA')) {
            return res.status(400).json({ error: { message: 'Formato de token inválido. O token deve iniciar com EAA...' } });
        }

        try {
            const debugRes = await new Promise((resolve, reject) => {
                https.get(`https://graph.facebook.com/v21.0/debug_token?input_token=${encodeURIComponent(token)}&access_token=${encodeURIComponent(token)}`, (apiRes) => {
                    let data = '';
                    apiRes.on('data', c => data += c);
                    apiRes.on('end', () => {
                        try { resolve(JSON.parse(data)); } catch(e) { resolve({ error: { message: 'Resposta inválida da Meta' } }); }
                    });
                }).on('error', err => reject(err));
            });

            if (debugRes.data && debugRes.data.is_valid) {
                return res.status(200).json({
                    success: true,
                    valid: true,
                    app: debugRes.data.application,
                    scopes: debugRes.data.scopes,
                    expires_at: debugRes.data.expires_at
                });
            } else {
                return res.status(400).json({
                    success: false,
                    error: debugRes.error || { message: 'Token inválido ou expirado pela Meta.' }
                });
            }
        } catch (tokErr) {
            return res.status(500).json({ error: { message: tokErr.message } });
        }
    }

    // Validação de Sessão ou Token no Header
    const cookies = (req.headers.cookie || '').split(';').reduce((acc, cookie) => {
        const [k, v] = cookie.trim().split('=');
        if (k) acc[k] = v;
        return acc;
    }, {});

    const sessionCookie = cookies['meta_admin_session'];
    const sessionPass = sessionCookie ? Buffer.from(sessionCookie, 'base64').toString('utf8') : '';
    const isSessionValid = validPasswords.includes(sessionPass);
    const isHeaderValid = validPasswords.includes(providedSecret);

    if (!isSessionValid && !isHeaderValid) {
        return res.status(401).json({
            error: {
                message: 'Acesso negado: Credencial administrativa ausente ou inválida.',
                type: 'UNAUTHORIZED',
                code: 401
            }
        });
    }

    // 2. Extração e Sanitização de Parâmetros
    let endpoint = '';
    let method = req.method;
    let params = {};
    let payload = null;
    let actionId = null;

    if (req.method === 'GET') {
        endpoint = req.query.endpoint || '';
        params = { ...req.query };
        delete params.endpoint;
    } else if (req.method === 'POST') {
        const body = req.body || {};
        endpoint = body.endpoint || '';
        method = body.method || 'POST';
        params = body.params || {};
        payload = body.payload || null;
        actionId = body.action_id || null;
    }

    if (!endpoint) {
        return res.status(400).json({ error: { message: 'Parâmetro "endpoint" é obrigatório.' } });
    }

    // 3. Blindagem de Allowlist Estrita
    const allowCheck = isOperationAllowed(endpoint, method);
    if (!allowCheck.allowed) {
        return res.status(403).json({
            error: {
                message: `OPERAÇÃO PROIBIDA: O endpoint "${endpoint}" com método "${method}" não faz parte da allowlist autorizada da conta ${ALLOWED_AD_ACCOUNT_ID}.`,
                type: 'FORBIDDEN_RESOURCE',
                code: 403
            }
        });
    }

    // 4. Bloqueio por Emergency Stop no Servidor para qualquer mutação
    if ((method === 'POST' || method === 'PUT' || method === 'DELETE') && serverState.isEmergencyStopped()) {
        return res.status(403).json({
            error: {
                message: 'ESCRITA BLOQUEADA: O Emergency Stop (Kill Switch) está ativado no servidor.',
                type: 'EMERGENCY_STOP_ACTIVE',
                code: 403
            }
        });
    }

    // 5. Verificação de Idempotência no Servidor
    if (actionId) {
        const idempCheck = serverState.checkIdempotency(actionId);
        if (idempCheck.isDuplicate) {
            return res.status(200).json({
                ...idempCheck.cachedResult,
                _idempotent: true,
                _executedAt: idempCheck.executedAt
            });
        }
    }

    // 6. Verificação de Cooldown no Servidor para edições de orçamento
    if (allowCheck.operation === 'BUDGET_UPDATE' && payload && (payload.daily_budget || payload.lifetime_budget)) {
        const campaignId = endpoint.split('/')[0];
        const cooldown = serverState.isUnderCooldown(campaignId);
        if (cooldown.underCooldown) {
            return res.status(429).json({
                error: {
                    message: `COOLDOWN ATIVO NO SERVIDOR: A campanha ${campaignId} foi alterada recentemente. Restam ${cooldown.remainingHours}h de cooldown.`,
                    type: 'COOLDOWN_ACTIVE',
                    code: 429
                }
            });
        }
    }

    // 7. Execução Segura via Graph API
    try {
        const overrideToken = req.headers['x-meta-token'] || req.query.access_token || null;
        const result = await executeGraphRequestWithRetry(endpoint, method, params, payload, 3, overrideToken);

        // Se for uma mutação de orçamento bem-sucedida, registra o Cooldown no servidor
        if (allowCheck.operation === 'BUDGET_UPDATE' && result.statusCode === 200) {
            const campaignId = endpoint.split('/')[0];
            serverState.setCooldown(campaignId);
        }

        // Registra resultado para Idempotência
        if (actionId && result.statusCode === 200) {
            serverState.recordIdempotency(actionId, result.data);
        }

        return res.status(result.statusCode).json(result.data);

    } catch (err) {
        return res.status(500).json({
            error: {
                message: err.message || 'Erro interno na comunicação com a Meta.',
                type: 'ProxyExecutionException'
            }
        });
    }
};
