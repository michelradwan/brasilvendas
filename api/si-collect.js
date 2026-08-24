// ==============================================================================
// API ENDPOINT: /api/si-collect (Site Intelligence Event Collector)
// Fail-Open, Privacy-First (Zero PII), Async Processing, Cors Compliant
// ==============================================================================

const storage = require('../lib/si-storage');
const sessionEngine = require('../site-intelligence/server/session-engine');
const schema = require('../site-intelligence/client/si-schema');

module.exports = async function handler(req, res) {
    // Configuração CORS Fail-Open
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    try {
        const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
        const rawEvents = Array.isArray(body.events) ? body.events : [body];

        if (rawEvents.length === 0) {
            return res.status(200).json({ success: true, processed: 0 });
        }

        // Sanitização em 100% dos eventos para garantia absoluta de Zero PII
        const sanitizedEvents = rawEvents.map(evt => schema.sanitizePII(evt));

        // Armazenar eventos brutos sanitizados
        await storage.appendEvents(sanitizedEvents);

        // Atualizar agregação de sessões de forma assíncrona
        const currentSessions = await storage.getSessions(200);
        const updatedSessions = sessionEngine.processEvents(sanitizedEvents, currentSessions);
        
        for (const sess of updatedSessions) {
            await storage.saveSession(sess);
        }

        return res.status(200).json({ success: true, processed: sanitizedEvents.length });

    } catch (err) {
        // Fail-Open supremo: NUNCA retorne 500 para não quebrar a chamada do cliente
        console.error('[SI Collect Warning]', err.message);
        return res.status(200).json({ success: true, fail_open: true });
    }
};
