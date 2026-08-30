// ==============================================================================
// SITE INTELLIGENCE — ULTRA LIGHTWEIGHT TRACKER SCRIPT (< 4KB, FAIL-OPEN, ZERO PII)
// Observa comportamento do visitante sem bloquear vendas ou afetar checkout
// ==============================================================================

(function(window, document) {
    'use strict';

    if (window.__SI_TRACKER_LOADED__) return;
    window.__SI_TRACKER_LOADED__ = true;

    const ENDPOINT = '/api/si-collect';
    const BUFFER_LIMIT = 4;
    const FLUSH_INTERVAL_MS = 6000;
    const SESSION_EXPIRY_MS = 30 * 60 * 1000; // 30 minutos

    let eventQueue = [];
    let visitorId = getOrCreateVisitorId();
    let sessionId = getOrCreateSessionId();
    let maxScroll = 0;
    let clickTracker = {};
    let rageClickCount = 0;
    let deadClickCount = 0;
    let startTime = Date.now();

    function getOrCreateVisitorId() {
        try {
            let val = localStorage.getItem('si_vid');
            if (!val || val.length < 15) {
                val = 'si_v_' + Math.random().toString(36).substring(2, 11) + '_' + Date.now().toString(36);
                localStorage.setItem('si_vid', val);
            }
            return val;
        } catch (e) {
            return 'si_v_temp_' + Math.random().toString(36).substring(2, 9);
        }
    }

    function getOrCreateSessionId() {
        try {
            const now = Date.now();
            let sid = sessionStorage.getItem('si_sid');
            let lastActivity = parseInt(sessionStorage.getItem('si_last_act') || '0', 10);

            if (!sid || (now - lastActivity > SESSION_EXPIRY_MS)) {
                sid = 'si_s_' + Math.random().toString(36).substring(2, 11) + '_' + Date.now().toString(36);
                sessionStorage.setItem('si_sid', sid);
            }
            sessionStorage.setItem('si_last_act', String(now));
            return sid;
        } catch (e) {
            return 'si_s_temp_' + Math.random().toString(36).substring(2, 9);
        }
    }

    function getUTM(param) {
        try {
            const urlParams = new URLSearchParams(window.location.search);
            return urlParams.get(param) || 'none';
        } catch (e) {
            return 'none';
        }
    }

    function getDeviceType() {
        return window.innerWidth <= 768 ? 'mobile' : (window.innerWidth <= 1024 ? 'tablet' : 'desktop');
    }

    function sanitizeString(str) {
        if (!str) return '';
        return String(str).replace(/[^\w\s\-\.\#\/]/gi, '').substring(0, 80);
    }

    function pushEvent(eventType, customData = {}) {
        try {
            const dwellSec = Math.round((Date.now() - startTime) / 1000);
            try { sessionStorage.setItem('si_last_act', String(Date.now())); } catch(e){}
            
            // Garantia estrita de ZERO PII no client-side
            const cleanData = {};
            for (const k in customData) {
                if (!['cpf', 'email', 'phone', 'nome', 'address', 'cep', 'password', 'pix', 'cartao'].includes(k.toLowerCase())) {
                    cleanData[k] = typeof customData[k] === 'string' ? sanitizeString(customData[k]) : customData[k];
                }
            }

            const evt = {
                event_id: 'si_' + Math.random().toString(36).substring(2, 10) + '_' + Date.now(),
                event_type: eventType,
                timestamp: new Date().toISOString(),
                session_id: sessionId,
                visitor_id: visitorId,
                device: {
                    type: getDeviceType(),
                    viewport_w: window.innerWidth,
                    viewport_h: window.innerHeight
                },
                context: {
                    page_path: window.location.pathname || '/',
                    utm_source: getUTM('utm_source'),
                    utm_medium: getUTM('utm_medium'),
                    utm_campaign: getUTM('utm_campaign'),
                    utm_content: getUTM('utm_content')
                },
                metrics: {
                    scroll_pct: maxScroll,
                    dwell_sec: dwellSec,
                    rage_click_count: rageClickCount,
                    dead_click_count: deadClickCount
                },
                data: cleanData
            };

            eventQueue.push(evt);

            if (eventQueue.length >= BUFFER_LIMIT || ['checkout_step', 'pix_generated', 'purchase_success'].includes(eventType)) {
                flushQueue();
            }
        } catch (err) {
            // Fail-Open: Qualquer erro no tracker morre em silêncio absoluto
        }
    }

    function flushQueue() {
        if (eventQueue.length === 0) return;
        const payload = JSON.stringify({ events: eventQueue.splice(0, eventQueue.length) });

        try {
            const endpointUrl = (window.location.protocol === 'file:') ? 'https://brasilvendas.vercel.app' + ENDPOINT : ENDPOINT;
            if (navigator.sendBeacon) {
                const blob = new Blob([payload], { type: 'application/json' });
                navigator.sendBeacon(endpointUrl, blob);
            } else {
                fetch(endpointUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: payload,
                    keepalive: true
                }).catch(() => {});
            }
        } catch (err) {
            // Fail-open
        }
    }

    // Listener de Scroll (Debounced)
    let scrollTimer = null;
    window.addEventListener('scroll', function() {
        if (scrollTimer) return;
        scrollTimer = setTimeout(function() {
            scrollTimer = null;
            const h = document.documentElement;
            const b = document.body;
            const st = 'scrollTop' in h ? h.scrollTop : b.scrollTop;
            const sh = 'scrollHeight' in h ? h.scrollHeight : b.scrollHeight;
            const ch = h.clientHeight;
            const pct = Math.round((st / (sh - ch)) * 100) || 0;
            if (pct > maxScroll) {
                maxScroll = Math.min(100, pct);
            }
        }, 300);
    }, { passive: true });

    // Listener de Clique (Rage Click & Dead Click Detection)
    document.addEventListener('click', function(e) {
        try {
            const target = e.target;
            const tag = target.tagName ? target.tagName.toLowerCase() : '';
            const isInteractive = ['a', 'button', 'input', 'select', 'textarea'].includes(tag) || 
                                  target.onclick || 
                                  target.getAttribute('role') === 'button';

            const now = Date.now();
            const key = (target.id || target.className || tag) + '_' + Math.round(e.clientX / 20) + '_' + Math.round(e.clientY / 20);

            // Rage Click: 3+ cliques na mesma área em < 1.5s
            if (!clickTracker[key]) clickTracker[key] = [];
            clickTracker[key] = clickTracker[key].filter(t => now - t < 1500);
            clickTracker[key].push(now);

            if (clickTracker[key].length >= 3) {
                rageClickCount++;
                pushEvent('rage_click', {
                    target_tag: tag,
                    target_id: sanitizeString(target.id),
                    target_class: sanitizeString(target.className)
                });
                clickTracker[key] = [];
            } else if (!isInteractive) {
                // Dead Click em elemento não interativo
                deadClickCount++;
                pushEvent('dead_click', {
                    target_tag: tag,
                    target_id: sanitizeString(target.id),
                    target_class: sanitizeString(target.className)
                });
            } else {
                pushEvent('click', {
                    target_tag: tag,
                    target_id: sanitizeString(target.id)
                });
            }
        } catch (err) {
            // Fail-open
        }
    }, { passive: true });

    // Envio Periódico & Descarregamento da Janela
    setInterval(flushQueue, FLUSH_INTERVAL_MS);
    window.addEventListener('beforeunload', flushQueue);
    window.addEventListener('pagehide', flushQueue);

    // Evento Inicial Pageview
    pushEvent('pageview');

    // API Pública Global Isolada
    window.SiteIntelligence = {
        trackStep: function(stepName, data) {
            pushEvent('checkout_step', Object.assign({ step: stepName }, data));
            flushQueue();
        },
        trackPix: function(data) {
            pushEvent('pix_generated', data || {});
            flushQueue();
        },
        trackPurchase: function(data) {
            pushEvent('purchase_success', data || {});
            flushQueue();
        },
        trackCustom: function(name, data) {
            pushEvent(name, data || {});
        },
        flush: flushQueue
    };

})(window, document);
