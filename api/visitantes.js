// ==============================================================================
// VERCEL SERVERLESS BACKEND - MONITOR DE VISITANTES AO VIVO (REALTIME VISITOR TRACKER)
// ==============================================================================

const authGuard = require('../lib/auth-guard.js');

// Armazenamento em memória dos visitantes ativos nos últimos 45 segundos
let visitantesAtivos = new Map();

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Admin-Auth');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    const agora = Date.now();

    // Limpar visitantes inativos (mais de 25 segundos sem ping)
    for (const [id, data] of visitantesAtivos.entries()) {
        if (agora - data.ultimo_ping > 25000) {
            visitantesAtivos.delete(id);
        }
    }

    // POST: Registrar Heartbeat / Ping do Visitante (Público durante navegação no site)
    if (req.method === 'POST') {
        try {
            const body = req.body || {};
            const visitId = body.visit_id || req.headers['x-forwarded-for'] || `v_anon_${agora}`;
            
            // Geolocalização nativa da Vercel (Edge Headers)
            const cidade = decodeURIComponent(req.headers['x-vercel-ip-city'] || body.city || 'São Paulo');
            const estado = req.headers['x-vercel-ip-country-region'] || body.state || 'SP';
            const pais = req.headers['x-vercel-ip-country'] || 'BR';
            const userAgent = req.headers['user-agent'] || '';

            // Detectar dispositivo
            let dispositivo = 'Celular';
            if (/iphone/i.test(userAgent)) dispositivo = 'iPhone';
            else if (/android/i.test(userAgent)) dispositivo = 'Android';
            else if (/windows|macintosh|linux/i.test(userAgent)) dispositivo = 'Computador';
            else if (/ipad|tablet/i.test(userAgent)) dispositivo = 'Tablet';

            const existing = visitantesAtivos.get(visitId);
            visitantesAtivos.set(visitId, {
                visit_id: visitId,
                cidade: cidade,
                estado: estado,
                pais: pais,
                dispositivo: dispositivo,
                etapa: body.etapa || 'Visualizando Página',
                origem: body.origem || 'Meta Ads',
                campanha: body.campanha || 'Direto',
                criado_em: existing?.criado_em || agora,
                ultimo_ping: agora
            });

            return res.status(200).json({ success: true, online: visitantesAtivos.size });
        } catch(e) {
            return res.status(500).json({ success: false, error: e.message });
        }
    }

    // GET: Retornar lista de visitantes online para o admin.html (EXIGE AUTENTICAÇÃO ADMINISTRATIVA)
    if (req.method === 'GET') {
        const authCheck = authGuard.validateAdminSession(req);
        if (!authCheck.authenticated) {
            return res.status(401).json({
                success: false,
                error: 'Acesso negado: Visualização de visitantes online restrita a administradores autenticados.'
            });
        }

        const lista = Array.from(visitantesAtivos.values()).map(v => ({
            ...v,
            tempo_online_segundos: Math.round((agora - v.criado_em) / 1000)
        }));

        return res.status(200).json({
            success: true,
            total_online: lista.length,
            visitantes: lista
        });
    }

    return res.status(405).json({ success: false, message: 'Método não permitido' });
};
