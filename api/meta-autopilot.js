// ==============================================================================
// VERCEL SERVERLESS BACKEND - SECURE AUTOPILOT CRON & BACKGROUND WORKER
// ==============================================================================

const https = require('https');
const metaConstants = require('../config/meta-constants.js');
const GRAPH_VERSION = metaConstants.GRAPH_VERSION || metaConstants.META_GRAPH_VERSION || 'v21.0';
const GRAPH_BASE_URL = metaConstants.GRAPH_BASE_URL || metaConstants.META_GRAPH_BASE_URL || 'https://graph.facebook.com/v21.0';
const { ALLOWED_AD_ACCOUNT_ID, RATE_LIMIT_ERROR_CODES } = metaConstants;
const serverState = require('../lib/meta-state.js');

function getMetaToken() {
    return process.env.META_ACCESS_TOKEN || '';
}

function getCronSecret() {
    return process.env.CRON_SECRET || process.env.ADMIN_PASSWORD || '';
}

function validateEnvironment() {
    const isPreview = process.env.VERCEL_ENV === 'preview' || process.env.PREVIEW_MODE === 'true';
    if (!getMetaToken() && !isPreview) {
        throw new Error('CONFIGURATION_ERROR: META_ACCESS_TOKEN obrigatório não configurado no servidor.');
    }
    if (!getCronSecret()) {
        throw new Error('CONFIGURATION_ERROR: CRON_SECRET / ADMIN_PASSWORD obrigatório não configurado no servidor.');
    }
}

async function graphCallWithRetry(endpoint, method = 'GET', params = {}, payload = null, maxRetries = 3) {
    const token = getMetaToken();
    const query = new URLSearchParams({ ...params, access_token: token }).toString();
    const cleanEndpoint = endpoint.replace(/^\/+/, '');
    const url = `${GRAPH_BASE_URL}/${cleanEndpoint}?${query}`;
    const parsed = new URL(url);

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const options = {
                hostname: parsed.hostname,
                path: parsed.pathname + parsed.search,
                method: method,
                headers: {
                    'Accept': 'application/json',
                    'User-Agent': 'MetaAdsAutopilotWorker/2.0'
                }
            };

            let bodyData = null;
            if (payload && method === 'POST') {
                bodyData = JSON.stringify(payload);
                options.headers['Content-Type'] = 'application/json';
                options.headers['Content-Length'] = Buffer.byteLength(bodyData);
            }

            const response = await new Promise((resolve, reject) => {
                const req = https.request(options, (res) => {
                    let data = '';
                    res.on('data', chunk => data += chunk);
                    res.on('end', () => {
                        try {
                            resolve({ statusCode: res.statusCode, data: JSON.parse(data) });
                        } catch (e) {
                            resolve({ statusCode: res.statusCode, data: { raw: data } });
                        }
                    });
                });
                req.on('error', err => reject(err));
                req.setTimeout(25000, () => {
                    req.destroy();
                    reject(new Error('Timeout de 25s na chamada da Graph API.'));
                });
                if (bodyData) req.write(bodyData);
                req.end();
            });

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

// Paginação Completa de Campanhas
async function fetchAllCampaigns(adAccountId) {
    let allCampaigns = [];
    let nextUrl = null;
    let params = {
        fields: 'id,name,status,daily_budget,lifetime_budget,objective,buying_type',
        limit: 50
    };

    let endpoint = `${adAccountId}/campaigns`;

    do {
        const res = await graphCallWithRetry(endpoint, 'GET', params);
        if (res.data && res.data.data) {
            allCampaigns = allCampaigns.concat(res.data.data);
            if (res.data.paging && res.data.paging.cursors && res.data.paging.cursors.after && res.data.data.length === 50) {
                params.after = res.data.paging.cursors.after;
            } else {
                break;
            }
        } else {
            break;
        }
    } while (allCampaigns.length < 5000); // Limite de segurança de 5.000 campanhas por ciclo

    return allCampaigns;
}

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Cron-Auth, X-Admin-Auth');

    if (req.method === 'OPTIONS') return res.status(200).end();

    try {
        validateEnvironment();
    } catch (configErr) {
        return res.status(500).json({
            error: { message: configErr.message, type: 'CONFIGURATION_ERROR', code: 500 }
        });
    }

    // 1. Validação de Autorização (Cron Secret ou Admin Password)
    const authHeader = req.headers['x-cron-auth'] || req.headers['x-admin-auth'] || req.headers['authorization'];
    const providedToken = authHeader ? authHeader.replace('Bearer ', '').trim() : '';

    if (providedToken !== getCronSecret()) {
        return res.status(401).json({ error: { message: 'Acesso não autorizado ao Autopilot Worker.', code: 401 } });
    }

    const adAccountId = ALLOWED_AD_ACCOUNT_ID;

    // 2. Bloqueio por Emergency Stop no Servidor
    const isEmergency = await serverState.isEmergencyStoppedAsync();
    if (isEmergency) {
        return res.status(403).json({
            error: { message: 'EXECUÇÃO BLOQUEADA: Emergency Stop ativo no servidor.', code: 403 }
        });
    }

    // 3. Aquisição de Distributed Lock para Evitar Concorrência
    const lockResult = await serverState.acquireLock(adAccountId, 300); // 5 min TTL
    if (!lockResult.acquired) {
        return res.status(409).json({
            error: { message: `CONCORRÊNCIA BLOQUEADA: ${lockResult.reason}`, type: 'LOCK_ACQUISITION_FAILED', code: 409 }
        });
    }

    const cycleId = `CYCLE_${Date.now()}`;
    const report = {
        cycle_id: cycleId,
        timestamp: new Date().toISOString(),
        ad_account_id: adAccountId,
        campaigns_analyzed: 0,
        actions_taken: [],
        actions_blocked: [],
        shadow_recommendations: []
    };

    try {
        const isPreviewEnvironment = process.env.VERCEL_ENV === 'preview' || process.env.PREVIEW_MODE === 'true';
        const { target_cpa = 35.00, mode = 'AUTOPILOT', dry_run = false } = req.body || {};
        const effectiveDryRun = dry_run || isPreviewEnvironment;
        const isUnitEconomicsVerified = await serverState.isUnitEconomicsVerified();

        if (isPreviewEnvironment) {
            report.preview_safety_guard = 'Ativo: Execução restrita a simulação (dry-run) no ambiente Preview.';
        }

        // 4. Busca Paginada de Todas as Campanhas
        let campaigns = [];
        try {
            campaigns = await fetchAllCampaigns(adAccountId);
        } catch (fetchErr) {
            console.warn('[Autopilot Warning] Falha ao consultar campanhas da Meta:', fetchErr.message);
            report.fetch_warning = fetchErr.message;
        }
        report.campaigns_analyzed = campaigns.length;

        for (const camp of campaigns) {
            if (camp.status !== 'ACTIVE') continue;

            // Busca Insights de Hoje
            const insRes = await graphCallWithRetry(`${camp.id}/insights`, 'GET', {
                fields: 'spend,actions,action_values,cpc,cpm,ctr,frequency',
                date_preset: 'today'
            });

            if (insRes.data && insRes.data.data && insRes.data.data[0]) {
                const ins = insRes.data.data[0];
                const spend = parseFloat(ins.spend) || 0;
                
                // Deduplicação Estrita de Purchase (Prioritário: purchase > omni_purchase)
                let purchases = 0;
                if (ins.actions && Array.isArray(ins.actions)) {
                    const pAction = ins.actions.find(a => a.action_type === 'purchase');
                    if (pAction) {
                        purchases = parseInt(pAction.value) || 0;
                    } else {
                        const omniP = ins.actions.find(a => a.action_type === 'omni_purchase');
                        if (omniP) purchases = parseInt(omniP.value) || 0;
                    }
                }

                // REGRA 1: Stop-Loss Inteligente
                if (purchases === 0 && spend >= target_cpa * 1.15) {
                    const actionId = `ACT_STOPLOSS_${camp.id}_${new Date().toISOString().split('T')[0]}`;
                    const idemp = await serverState.checkIdempotency(actionId);

                    if (!idemp.isDuplicate) {
                        if (mode === 'AUTOPILOT' && !effectiveDryRun) {
                            // Salva snapshot persistente antes de pausar
                            await serverState.saveSnapshot(camp.id, { status: 'ACTIVE', beforeSpend: spend });
                            await graphCallWithRetry(camp.id, 'POST', {}, { status: 'PAUSED' });
                            await serverState.recordIdempotency(actionId, { action: 'PAUSED', spend });
                            report.actions_taken.push(`[PAUSED] Campanha "${camp.name}" pausada por Stop-Loss (Gasto: R$ ${spend.toFixed(2)} sem compras).`);
                        } else {
                            report.shadow_recommendations.push(`Pausar campanha "${camp.name}" por Stop-Loss.`);
                        }
                    }
                }

                // REGRA 2: Escala Controlada (+15%) com Verificação de Unit Economics
                if (purchases >= 3 && camp.daily_budget) {
                    const curCpa = spend / purchases;
                    if (curCpa <= target_cpa * 0.85) {
                        if (!isUnitEconomicsVerified) {
                            report.actions_blocked.push(`Escala de "${camp.name}" bloqueada: Unit Economics ainda não verificado pelo operador.`);
                            continue;
                        }

                        // Verificação de Cooldown no Servidor
                        const cooldown = await serverState.isUnderCooldown(camp.id);
                        if (cooldown.underCooldown) {
                            report.actions_blocked.push(`Escala de "${camp.name}" ignorada: Em cooldown (restam ${cooldown.remainingHours}h).`);
                            continue;
                        }

                        const curBudget = parseInt(camp.daily_budget);
                        const newBudget = Math.round(curBudget * 1.15); // +15%
                        const actionId = `ACT_SCALE_${camp.id}_${Date.now()}`;

                        if (mode === 'AUTOPILOT' && !effectiveDryRun) {
                            await serverState.saveSnapshot(camp.id, { daily_budget: curBudget });
                            await graphCallWithRetry(camp.id, 'POST', {}, { daily_budget: newBudget });
                            await serverState.setCooldown(camp.id);
                            await serverState.recordIdempotency(actionId, { before: curBudget, after: newBudget });
                            report.actions_taken.push(`[SCALE] Orçamento de "${camp.name}" aumentado em 15% (R$ ${(curBudget/100).toFixed(2)} -> R$ ${(newBudget/100).toFixed(2)}).`);
                        } else {
                            report.shadow_recommendations.push(`Escalar orçamento de "${camp.name}" de R$ ${(curBudget/100).toFixed(2)} para R$ ${(newBudget/100).toFixed(2)}.`);
                        }
                    }
                }
            }
        }

        return res.status(200).json({ success: true, report });

    } catch (err) {
        return res.status(500).json({ success: false, error: err.message, report });
    } finally {
        // Libera o lock no servidor
        await serverState.releaseLock(adAccountId);
    }
};
