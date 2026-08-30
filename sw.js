/**
 * ==============================================================================
 * RADWAN ADS — SERVICE WORKER & WEB PUSH RECEIVER (v2.0 PWA ENTERPRISE)
 * Background Notification • Badging • Deep Linking • Multi-Device Support
 * ==============================================================================
 */

const CACHE_NAME = 'radwan-ads-sw-v2';

self.addEventListener('install', (event) => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(self.clients.claim());
});

// ─── 1. RECEBIMENTO DE NOTIFICAÇÃO WEB PUSH (BACKGROUND / APP FECHADO) ────────
self.addEventListener('push', (event) => {
    let payload = {
        title: 'RADWAN ADS',
        body: 'Nova atualização de performance',
        icon: '/assets/logo-radwan-ads.png',
        badge: '/assets/logo-radwan-ads.png',
        tag: 'radwan-notification',
        data: { url: '/#orders' }
    };

    if (event.data) {
        try {
            const data = event.data.json();
            payload = {
                title: data.title || payload.title,
                body: data.body || payload.body,
                icon: data.icon || payload.icon,
                badge: data.badge || payload.badge,
                tag: data.tag || (data.eventId ? `sale-${data.eventId}` : payload.tag),
                data: data.data || { url: data.url || '/#orders' },
                renotify: true,
                requireInteraction: data.requireInteraction || false
            };
        } catch (e) {
            try {
                payload.body = event.data.text();
            } catch (err) {}
        }
    }

    // App Badging API (quando suportado pelo SO/Browser)
    if ('setAppBadge' in self.navigator) {
        self.navigator.setAppBadge().catch(() => {});
    }

    event.waitUntil(
        self.registration.showNotification(payload.title, {
            body: payload.body,
            icon: payload.icon,
            badge: payload.badge,
            tag: payload.tag,
            data: payload.data,
            renotify: payload.renotify,
            requireInteraction: payload.requireInteraction,
            vibrate: [200, 100, 200]
        })
    );
});

// ─── 2. CLIQUE NA NOTIFICAÇÃO (DEEP LINKING / FOCUS WINDOW) ───────────────────
self.addEventListener('notificationclick', (event) => {
    event.notification.close();

    // Limpa badge ao interagir
    if ('clearAppBadge' in self.navigator) {
        self.navigator.clearAppBadge().catch(() => {});
    }

    const targetUrl = (event.notification.data && event.notification.data.url) ? event.notification.data.url : '/';

    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
            // Se houver uma janela aberta do RADWAN ADS, foca nela e navega se necessário
            for (const client of clientList) {
                if (client.url && 'focus' in client) {
                    if (targetUrl.includes('#orders') && typeof client.navigate === 'function') {
                        client.navigate(targetUrl).catch(() => {});
                    }
                    return client.focus();
                }
            }
            // Se nenhuma janela estiver aberta, abre nova janela na rota de pedidos/dashboard
            if (self.clients.openWindow) {
                return self.clients.openWindow(targetUrl);
            }
        })
    );
});
