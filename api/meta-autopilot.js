// ==============================================================================
// VERCEL SERVERLESS BACKEND - META ADS AUTOPILOT CRON / BACKGROUND WORKER
// ==============================================================================

const https = require('https');

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const DEFAULT_TOKEN = process.env.META_ACCESS_TOKEN || 'EAA6kKz1qBV8BSZAIyOatrEf3ZBvLE0uAP0xi7pIeFdDuxDLr7S4lXbHTlHohasRuUJvW6PbiFDBD0YhfZBHTJFGtATD6WNbyI7bn1y4uDbpH0cztZBAA5s9R98iG7uooUMGbqNHFDbVWBXEDeYnX4rKCWb0GpNjgZBjDDptLq8Q4PINiLPdnsreVtoVI4FmAiZAsZCm7iZAwNJydKp56zSoyXfj1uXE34mymGc2yKw3ODzFMRe8ZBKTFE5Gl4ODUDLLdbkoKKmfZBl5L8Qng6f7BSMURbX';
const GRAPH_VERSION = 'v20.0';

// Armazenamento em memória de estado dos ciclos
let autopilotExecutionState = {
    lastRunTime: null,
    totalCycles: 0,
    actionsToday: 0,
    errorsToday: 0,
    status: 'ACTIVE_STANDBY'
};

async function graphCall(endpoint, method = 'GET', params = {}, payload = null, token = DEFAULT_TOKEN) {
    const query = new URLSearchParams({ ...params, access_token: token }).toString();
    const fullUrl = `https://graph.facebook.com/${GRAPH_VERSION}/${endpoint}?${query}`;
    const parsed = new URL(fullUrl);

    const options = {
        hostname: parsed.hostname,
        path: parsed.pathname + parsed.search,
        method: method,
        headers: { 'Accept': 'application/json' }
    };

    let bodyData = null;
    if (payload && method === 'POST') {
        bodyData = JSON.stringify(payload);
        options.headers['Content-Type'] = 'application/json';
        options.headers['Content-Length'] = Buffer.byteLength(bodyData);
    }

    return new Promise((resolve, reject) => {
        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    resolve({ raw: data });
                }
            });
        });
        req.on('error', (err) => reject(err));
        if (bodyData) req.write(bodyData);
        req.end();
    });
}

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Admin-Auth');

    if (req.method === 'OPTIONS') return res.status(200).end();

    const authHeader = req.headers['x-admin-auth'] || req.headers['authorization'];
    if (authHeader && authHeader.replace('Bearer ', '') !== ADMIN_PASSWORD) {
        return res.status(401).json({ error: { message: 'Acesso não autorizado ao worker.' } });
    }

    // GET: Retornar status e telemetria do autopilot
    if (req.method === 'GET') {
        return res.status(200).json({
            success: true,
            telemetry: autopilotExecutionState,
            server_time: new Date().toISOString(),
            engine_version: '2.0.0-PRO'
        });
    }

    // POST: Disparar ciclo autônomo de varredura (Health Check / Otimização)
    if (req.method === 'POST') {
        const { ad_account_id = 'act_846780837970771', target_cpa = 35, dry_run = true, mode = 'ASSISTED' } = req.body || {};

        const cycleReport = {
            cycle_id: `CYCLE_${Date.now()}`,
            timestamp: new Date().toISOString(),
            mode: mode,
            dry_run: dry_run,
            campaigns_analyzed: 0,
            actions_proposed: [],
            actions_executed: [],
            warnings: []
        };

        try {
            // 1. Sincronizar campanhas ativas
            const campRes = await graphCall(`${ad_account_id}/campaigns`, 'GET', {
                fields: 'name,status,daily_budget,lifetime_budget',
                limit: 30
            });

            if (!campRes.data || campRes.error) {
                throw new Error(campRes.error?.message || 'Falha ao sincronizar campanhas.');
            }

            cycleReport.campaigns_analyzed = campRes.data.length;

            for (const camp of campRes.data) {
                if (camp.status !== 'ACTIVE') continue;

                // 2. Buscar insights de hoje
                const insRes = await graphCall(`${camp.id}/insights`, 'GET', {
                    fields: 'spend,actions,cpc,cpm,ctr,frequency',
                    date_preset: 'today'
                });

                if (insRes.data && insRes.data[0]) {
                    const ins = insRes.data[0];
                    const spend = parseFloat(ins.spend) || 0;
                    let purchases = 0;
                    if (ins.actions) {
                        const p = ins.actions.find(a => a.action_type === 'purchase');
                        if (p) purchases = parseInt(p.value) || 0;
                    }

                    // Regra: Stop-Loss Inteligente
                    if (purchases === 0 && spend > target_cpa * 1.15) {
                        const actionItem = {
                            type: 'PAUSE_STOP_LOSS',
                            object_id: camp.id,
                            object_name: camp.name,
                            reason: `Spend de R$ ${spend.toFixed(2)} acima do teto de CPA (R$ ${target_cpa}) com 0 conversões.`,
                            risk: 'MEDIUM',
                            executed: false
                        };

                        if (!dry_run && mode === 'AUTOPILOT') {
                            const pauseRes = await graphCall(camp.id, 'POST', {}, { status: 'PAUSED' });
                            actionItem.executed = pauseRes.success === true;
                            cycleReport.actions_executed.push(actionItem);
                        } else {
                            cycleReport.actions_proposed.push(actionItem);
                        }
                    }

                    // Regra: Escala Controlada (+15%)
                    if (purchases >= 3) {
                        const currentCpa = spend / purchases;
                        if (currentCpa < target_cpa * 0.85 && camp.daily_budget) {
                            const curBudget = parseFloat(camp.daily_budget);
                            const newBudget = Math.round(curBudget * 1.15);

                            const scaleAction = {
                                type: 'BUDGET_SCALE',
                                object_id: camp.id,
                                object_name: camp.name,
                                before: curBudget,
                                after: newBudget,
                                reason: `CPA consistente de R$ ${currentCpa.toFixed(2)} (${purchases} vendas). Escala preventiva +15%.`,
                                risk: 'LOW',
                                executed: false
                            };

                            if (!dry_run && mode === 'AUTOPILOT') {
                                const bRes = await graphCall(camp.id, 'POST', {}, { daily_budget: newBudget });
                                scaleAction.executed = bRes.success === true;
                                cycleReport.actions_executed.push(scaleAction);
                            } else {
                                cycleReport.actions_proposed.push(scaleAction);
                            }
                        }
                    }
                }
            }

            autopilotExecutionState.lastRunTime = cycleReport.timestamp;
            autopilotExecutionState.totalCycles++;
            autopilotExecutionState.actionsToday += cycleReport.actions_executed.length;

            return res.status(200).json({ success: true, report: cycleReport });

        } catch (err) {
            autopilotExecutionState.errorsToday++;
            return res.status(500).json({ success: false, error: err.message, report: cycleReport });
        }
    }

    return res.status(405).json({ error: 'Método não suportado' });
};
