// ==============================================================================
// SITE INTELLIGENCE — SESSION ENGINE
// Reconstituição e classificação de sessões a partir dos eventos recebidos
// ==============================================================================

const schema = require('../client/si-schema');

class SessionEngine {
    /**
     * Processa um lote de eventos e atualiza o estado das sessões
     */
    processEvents(events, existingSessions = []) {
        const sessionMap = new Map();

        // Carregar sessões existentes
        existingSessions.forEach(s => sessionMap.set(s.session_id, Object.assign({}, s)));

        // Agrupar e reprocessar eventos
        events.forEach(evt => {
            const cleanEvt = schema.sanitizePII(evt);
            const sid = cleanEvt.session_id || 'anonymous_session';

            let session = sessionMap.get(sid);
            if (!session) {
                session = {
                    session_id: sid,
                    visitor_id: cleanEvt.visitor_id,
                    device_type: cleanEvt.device?.type || 'desktop',
                    utm_source: cleanEvt.context?.utm_source || 'direct',
                    utm_medium: cleanEvt.context?.utm_medium || 'none',
                    utm_campaign: cleanEvt.context?.utm_campaign || 'none',
                    start_time: cleanEvt.timestamp,
                    last_seen: cleanEvt.timestamp,
                    max_scroll: 0,
                    dwell_sec: 0,
                    rage_clicks: 0,
                    dead_clicks: 0,
                    reached_checkout: false,
                    generated_pix: false,
                    purchased: false,
                    status: 'active',
                    events_count: 0
                };
            }

            session.last_seen = cleanEvt.timestamp;
            session.events_count++;
            if (cleanEvt.metrics?.scroll_pct > session.max_scroll) {
                session.max_scroll = cleanEvt.metrics.scroll_pct;
            }
            if (cleanEvt.metrics?.dwell_sec > session.dwell_sec) {
                session.dwell_sec = cleanEvt.metrics.dwell_sec;
            }

            // Flags comportamentais
            if (cleanEvt.event_type === 'rage_click') session.rage_clicks++;
            if (cleanEvt.event_type === 'dead_click') session.dead_clicks++;
            if (cleanEvt.event_type === 'checkout_step') session.reached_checkout = true;
            if (cleanEvt.event_type === 'pix_generated') {
                session.reached_checkout = true;
                session.generated_pix = true;
            }
            if (cleanEvt.event_type === 'purchase_success') {
                session.reached_checkout = true;
                session.generated_pix = true;
                session.purchased = true;
                session.status = 'converted';
            }

            // Status da sessão
            if (!session.purchased) {
                session.status = session.reached_checkout ? 'abandoned_checkout' : 'bounced';
            }

            sessionMap.set(sid, session);
        });

        return Array.from(sessionMap.values());
    }

    /**
     * Calcula métricas agregadas do ecossistema de sessões
     */
    aggregateMetrics(sessions = []) {
        const total = sessions.length;
        if (total === 0) {
            return {
                total_sessions: 0,
                checkout_count: 0,
                pix_count: 0,
                purchase_count: 0,
                rage_click_sessions: 0,
                avg_scroll: 0,
                conversion_rate: 0,
                checkout_conversion_rate: 0
            };
        }

        let checkoutCount = 0;
        let pixCount = 0;
        let purchaseCount = 0;
        let rageCount = 0;
        let totalScroll = 0;

        sessions.forEach(s => {
            if (s.reached_checkout) checkoutCount++;
            if (s.generated_pix) pixCount++;
            if (s.purchased) purchaseCount++;
            if (s.rage_clicks > 0) rageCount++;
            totalScroll += (s.max_scroll || 0);
        });

        const avgScroll = Math.round(totalScroll / total);
        const convRate = parseFloat(((purchaseCount / total) * 100).toFixed(2));
        const checkoutConvRate = checkoutCount > 0 ? parseFloat(((purchaseCount / checkoutCount) * 100).toFixed(2)) : 0;
        const health = this.calculateConversionHealth(total, checkoutCount, pixCount, purchaseCount, rageCount, avgScroll);

        return {
            total_sessions: total,
            checkout_count: checkoutCount,
            pix_count: pixCount,
            purchase_count: purchaseCount,
            rage_click_sessions: rageCount,
            avg_scroll: avgScroll,
            conversion_rate: convRate,
            checkout_conversion_rate: checkoutConvRate,
            conversion_health: health
        };
    }

    /**
     * Calcula o índice de Saúde da Conversão (0-100) com fórmula auditável e conservadora
     */
    calculateConversionHealth(total, checkoutCount, pixCount, purchaseCount, rageCount, avgScroll) {
        if (total === 0) {
            return { score: null, label: '—', rating: 'Aguardando sessões' };
        }

        const convRate = (purchaseCount / total) * 100;
        const checkoutRate = (checkoutCount / total) * 100;
        const rageRate = (rageCount / total) * 100;

        // 1. Taxa de Conversão Final (Max 40 pts, benchmark 3.0%+)
        const convScore = Math.min(40, Math.round((convRate / 3.0) * 40));

        // 2. Início de Checkout (Max 30 pts, benchmark 10%+)
        const checkoutScore = Math.min(30, Math.round((checkoutRate / 10.0) * 30));

        // 3. Ausência de Fricção / Rage Clicks (Max 20 pts)
        const frictionScore = Math.max(0, Math.round(20 - (rageRate * 2)));

        // 4. Profundidade Média de Navegação / Scroll (Max 10 pts, benchmark 70%+)
        const scrollScore = Math.min(10, Math.round((avgScroll / 70) * 10));

        const totalScore = Math.min(100, Math.max(0, convScore + checkoutScore + frictionScore + scrollScore));

        let label = 'Crítico';
        let rating = 'Fricção Elevada';
        if (totalScore >= 80) {
            label = 'Excelente';
            rating = 'Conversão Saudável';
        } else if (totalScore >= 60) {
            label = 'Bom';
            rating = 'Operação Estável';
        } else if (totalScore >= 40) {
            label = 'Moderado';
            rating = 'Atenção aos Gargalos';
        }

        return {
            score: totalScore,
            label: label,
            rating: rating,
            breakdown: {
                conversion_score: convScore,
                checkout_score: checkoutScore,
                friction_score: frictionScore,
                scroll_score: scrollScore
            }
        };
    }
}

module.exports = new SessionEngine();
