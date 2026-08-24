// ==============================================================================
// SITE INTELLIGENCE — EVENT SCHEMA & VALIDATION ENGINE
// Fail-open, Zero PII, Privacy-First, Standardized Event Contract
// ==============================================================================

(function(exports) {
    'use strict';

    // Lista estrita de campos Proibidos (Zero PII Enforcement)
    const FORBIDDEN_FIELDS = [
        'cpf', 'email', 'phone', 'telefone', 'nome', 'name', 'address', 'endereco',
        'cep', 'zip', 'password', 'senha', 'card', 'cartao', 'cvv', 'pix_code',
        'pix_qr', 'payload', 'value_input'
    ];

    // Padrões de detecção Regex para PII residual em strings
    const PII_PATTERNS = {
        cpf: /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g,
        email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
        phone: /\b(?:\+?55\s?)?(?:\(?\d{2}\)?\s?)?\d{4,5}-?\d{4}\b/g
    };

    // Tipos de Eventos Válidos
    const EVENT_TYPES = [
        'pageview', 'scroll', 'click', 'rage_click', 'dead_click',
        'checkout_step', 'pix_generated', 'purchase_success', 'abandonment', 'dwell_time'
    ];

    /**
     * Sanitiza qualquer objeto ou string removendo PII antes do envio/armazenamento
     */
    function sanitizePII(obj) {
        if (obj === null || obj === undefined) return obj;
        if (typeof obj === 'number' || typeof obj === 'boolean') return obj;

        if (typeof obj === 'string') {
            let sanitized = obj;
            sanitized = sanitized.replace(PII_PATTERNS.cpf, '[REDACTED_CPF]');
            sanitized = sanitized.replace(PII_PATTERNS.email, '[REDACTED_EMAIL]');
            sanitized = sanitized.replace(PII_PATTERNS.phone, '[REDACTED_PHONE]');
            return sanitized;
        }

        if (Array.isArray(obj)) {
            return obj.map(item => sanitizePII(item));
        }

        if (typeof obj === 'object') {
            const clean = {};
            for (const key in obj) {
                if (Object.prototype.hasOwnProperty.call(obj, key)) {
                    const lowerKey = key.toLowerCase();
                    if (FORBIDDEN_FIELDS.includes(lowerKey)) {
                        clean[key] = '[REDACTED_PII]';
                    } else {
                        clean[key] = sanitizePII(obj[key]);
                    }
                }
            }
            return clean;
        }

        return obj;
    }

    /**
     * Constrói o Envelope Canônico de Evento SI
     */
    function createSIEnvelope(eventType, payload = {}) {
        if (!EVENT_TYPES.includes(eventType)) {
            eventType = 'pageview';
        }

        const rawEvent = {
            event_id: 'si_' + Math.random().toString(36).substring(2, 11) + '_' + Date.now(),
            event_type: eventType,
            timestamp: new Date().toISOString(),
            session_id: payload.session_id || 'anonymous_session',
            visitor_id: payload.visitor_id || 'anonymous_visitor',
            device: {
                type: payload.device_type || 'desktop',
                screen_w: payload.screen_w || 0,
                screen_h: payload.screen_h || 0,
                viewport_w: payload.viewport_w || 0,
                viewport_h: payload.viewport_h || 0,
                user_agent_short: (payload.user_agent || '').substring(0, 100)
            },
            context: {
                page_path: payload.page_path || '/',
                utm_source: payload.utm_source || 'direct',
                utm_medium: payload.utm_medium || 'none',
                utm_campaign: payload.utm_campaign || 'none',
                utm_content: payload.utm_content || 'none',
                offer_id: payload.offer_id || 'default'
            },
            metrics: {
                scroll_pct: typeof payload.scroll_pct === 'number' ? Math.min(100, Math.max(0, payload.scroll_pct)) : 0,
                dwell_sec: typeof payload.dwell_sec === 'number' ? Math.max(0, payload.dwell_sec) : 0,
                rage_click_count: typeof payload.rage_click_count === 'number' ? payload.rage_click_count : 0,
                dead_click_count: typeof payload.dead_click_count === 'number' ? payload.dead_click_count : 0
            },
            data: payload.data || {}
        };

        return sanitizePII(rawEvent);
    }

    // Exportação Isomórfica (Node.js + Browser)
    exports.FORBIDDEN_FIELDS = FORBIDDEN_FIELDS;
    exports.EVENT_TYPES = EVENT_TYPES;
    exports.sanitizePII = sanitizePII;
    exports.createSIEnvelope = createSIEnvelope;

})(typeof exports !== 'undefined' ? exports : (window.SI_SCHEMA = {}));
