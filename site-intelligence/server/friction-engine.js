// ==============================================================================
// SITE INTELLIGENCE — FRICTION ENGINE
// Detecção de pontos de atrito: Rage Clicks, Dead Clicks, Abandono Precoce
// ==============================================================================

class FrictionEngine {
    /**
     * Mapeia elementos e áreas que geram maior frustração
     */
    analyzeFriction(events = [], sessions = []) {
        const rageElements = new Map();
        const deadElements = new Map();
        let totalRageClicks = 0;
        let totalDeadClicks = 0;

        events.forEach(evt => {
            if (evt.event_type === 'rage_click') {
                totalRageClicks++;
                const key = evt.data?.target_tag ? `${evt.data.target_tag}${evt.data.target_id ? '#' + evt.data.target_id : ''}${evt.data.target_class ? '.' + evt.data.target_class : ''}` : 'unknown_element';
                rageElements.set(key, (rageElements.get(key) || 0) + 1);
            }

            if (evt.event_type === 'dead_click') {
                totalDeadClicks++;
                const key = evt.data?.target_tag ? `${evt.data.target_tag}${evt.data.target_id ? '#' + evt.data.target_id : ''}${evt.data.target_class ? '.' + evt.data.target_class : ''}` : 'unknown_element';
                deadElements.set(key, (deadElements.get(key) || 0) + 1);
            }
        });

        // Formatar Top Elementos de Atrito
        const topRage = Array.from(rageElements.entries())
            .map(([element, count]) => ({ element, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 5);

        const topDead = Array.from(deadElements.entries())
            .map(([element, count]) => ({ element, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 5);

        // Abandono de Checkout sem Ação
        let silentAbandonmentCount = 0;
        sessions.forEach(s => {
            if (s.reached_checkout && !s.generated_pix && s.dwell_sec < 15) {
                silentAbandonmentCount++;
            }
        });

        return {
            summary: {
                total_rage_clicks: totalRageClicks,
                total_dead_clicks: totalDeadClicks,
                silent_checkout_abandonment: silentAbandonmentCount
            },
            top_rage_elements: topRage,
            top_dead_elements: topDead,
            friction_index: this.calculateFrictionIndex(totalRageClicks, totalDeadClicks, sessions.length)
        };
    }

    calculateFrictionIndex(rageCount, deadCount, totalSessions) {
        if (totalSessions === 0) return 0;
        const rawScore = ((rageCount * 3 + deadCount * 1) / totalSessions) * 20;
        return Math.min(100, Math.round(rawScore));
    }
}

module.exports = new FrictionEngine();
