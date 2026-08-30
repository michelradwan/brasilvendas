// ==============================================================================
// API ENDPOINT: /api/si-query (Site Intelligence Dashboard Reader)
// Retorna os dados agregados do Site Intelligence para renderização no painel
// ==============================================================================

const storage = require('../lib/si-storage');
const sessionEngine = require('../site-intelligence/server/session-engine');
const funnelEngine = require('../site-intelligence/server/funnel-engine');
const frictionEngine = require('../site-intelligence/server/friction-engine');
const bottleneckEngine = require('../site-intelligence/server/bottleneck-engine');
const aiDiagnosisEngine = require('../site-intelligence/server/ai-diagnosis');
const authGuard = require('../lib/auth-guard.js');

module.exports = async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Admin-Auth');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'GET') {
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    // Validação de Autenticação Administrativa
    const authCheck = authGuard.validateAdminSession(req);
    if (!authCheck.authenticated) {
        return res.status(401).json({
            success: false,
            error: 'Acesso negado: Autenticação necessária para consultar dados de Site Intelligence.'
        });
    }

    try {
        const query = req.query || {};
        const startDate = query.start_date || query.since || null;
        const endDate = query.end_date || query.until || null;

        const events = await storage.getFilteredEvents(startDate, endDate, 1000);
        const sessions = await storage.getFilteredSessions(startDate, endDate, 200);
        const lastEventInfo = await storage.getLastEventInfo();

        const overviewMetrics = sessionEngine.aggregateMetrics(sessions);
        const funnelData = funnelEngine.calculateFunnel(sessions);
        const frictionData = frictionEngine.analyzeFriction(events, sessions);
        const mainBottleneck = bottleneckEngine.identifyBottleneck(funnelData, frictionData, sessions);
        const aiDiagnosis = aiDiagnosisEngine.generateDiagnosis(funnelData, frictionData, mainBottleneck, sessions);

        return res.status(200).json({
            success: true,
            period: {
                start_date: startDate,
                end_date: endDate
            },
            tracking_health: lastEventInfo,
            data: {
                overview: overviewMetrics,
                funnel: funnelData,
                friction: frictionData,
                bottleneck: mainBottleneck,
                diagnosis: aiDiagnosis,
                recent_sessions: sessions.slice(-50).reverse()
            }
        });

    } catch (err) {
        console.error('[SI Query Error]', err.message);
        return res.status(500).json({ success: false, error: 'Failed to fetch Site Intelligence metrics' });
    }
};
