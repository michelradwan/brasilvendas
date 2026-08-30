// ==============================================================================
// VERCEL SERVERLESS BACKEND - ZERO-TRUST META ADS PROXY (BLINDAGEM ESTREITA)
// ==============================================================================

const https = require('https');
const metaConstants = require('../config/meta-constants.js');
const GRAPH_VERSION = metaConstants.GRAPH_VERSION || metaConstants.META_GRAPH_VERSION || 'v21.0';
const GRAPH_BASE_URL = metaConstants.GRAPH_BASE_URL || metaConstants.META_GRAPH_BASE_URL || 'https://graph.facebook.com/v21.0';
const { ALLOWED_AD_ACCOUNT_ID, ALLOWED_OPERATIONS, RATE_LIMIT_ERROR_CODES } = metaConstants;
const serverState = require('../lib/meta-state.js');
const authGuard = require('../lib/auth-guard.js');

// Token Oficial Ativo e Autenticado
const NEW_VALID_TOKEN = 'EAA6kKz1qBV8BScqZAG8mVrcPD4ICruA1t9WqObGj21tgmjSmOz5w2ngISSd2m9LSgETqq8zZCrfBERBmbSwMzTJaAxUvwSFnlZCOY0lK0CDZAihxtzHieFl6dyDAQdM9xJVpXBT8Ya6KpWnVctmTqUugUUaaujxfpAu7J7ZBKkx17UN2o0BbWjyUQ8lR38UDnagZDZD';
const META_ACCESS_TOKEN = NEW_VALID_TOKEN;

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
    const tokenToUse = overrideToken || process.env.META_ACCESS_TOKEN || NEW_VALID_TOKEN;
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

    // 1. Autenticação Administrativa Rigorosa via Auth Guard
    const authCheck = authGuard.validateAdminSession(req);
    if (!authCheck.authenticated) {
        return res.status(401).json({
            error: {
                message: 'Acesso negado: Autenticação administrativa ausente ou inválida.',
                type: 'UNAUTHORIZED',
                code: 401
            }
        });
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

    // Suporte ao Kill Switch / Emergency Stop Server-Side
    if (req.query.action === 'emergency_stop') {
        if (req.method === 'POST') {
            const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
            await serverState.setEmergencyStop(!!body.enabled);
            const isStopped = await serverState.isEmergencyStoppedAsync();
            return res.status(200).json({ success: true, emergency_stop: isStopped });
        }
        const isStopped = await serverState.isEmergencyStoppedAsync();
        return res.status(200).json({ success: true, emergency_stop: isStopped });
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

    // 4. Bloqueio por Governança & Fail-Closed Mutation Safety no Servidor
    if (method === 'POST' || method === 'PUT' || method === 'DELETE') {
        const mutationGov = await serverState.isMutationAllowed();
        if (!mutationGov.allowed) {
            return res.status(mutationGov.code || 403).json({
                error: {
                    message: `ESCRITA BLOQUEADA: ${mutationGov.reason}`,
                    type: mutationGov.reason,
                    code: mutationGov.code || 403
                }
            });
        }
    }

    // 4.1 Bloqueio de Mutações no Ambiente Preview (Defense-in-Depth Read-Only Guard)
    const isPreviewEnv = process.env.VERCEL_ENV === 'preview' || process.env.PREVIEW_MODE === 'true';
    if ((method === 'POST' || method === 'PUT' || method === 'DELETE') && isPreviewEnv) {
        console.log(`[Preview Guard] Mutação interceptada e simulada em ambiente Preview (${method} ${endpoint})`);
        return res.status(200).json({
            success: true,
            preview_mode: true,
            dry_run: true,
            simulated: true,
            message: 'Ambiente Preview: Mutação simulada com sucesso sem impacto na conta de produção real da Meta.',
            endpoint,
            payload
        });
    }

    // 5. Verificação de Idempotência no Servidor
    if (actionId) {
        const idempCheck = await serverState.checkIdempotency(actionId);
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
        const cooldown = await serverState.isUnderCooldown(campaignId);
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
        const overrideToken = req.headers['x-meta-token'] || req.query.access_token || (req.body && req.body.access_token) || null;
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
