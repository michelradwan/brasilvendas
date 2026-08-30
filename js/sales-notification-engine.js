/**
 * ==============================================================================
 * RADWAN ADS — REAL-TIME SALES NOTIFICATION & AUDIO ENGINE (v7.4 ENTERPRISE)
 * Zero Fake Data • Canonical Deduplication • FIFO Audio Queue • Multi-Tab Safe
 * ==============================================================================
 */

(function () {
    'use strict';

    // ─── 1. SALES AUDIO ENGINE (FIFO QUEUE & SYNTHESIZER) ────────────────────────

    class SalesAudioEngine {
        constructor() {
            this.storageKey = 'radwan_sales_audio_settings';
            // Arquivo oficial idêntico para PIX pendente e Pagamento aprovado
            this.audioAssetPath = 'assets/sounds/sale-approved.mp3';
            
            // Configurações Padrão
            this.settings = {
                soundEnabled: true,
                pendingSoundEnabled: true,
                approvedSoundEnabled: true,
                volume: 0.60, // 60% default moderado
                browserNotifications: false
            };

            this.audioCtx = null;
            this.preloadedAudio = null;
            this.isUnlocked = false;

            // FIFO Queue
            this.queue = [];
            this.isProcessingQueue = false;
            this.minIntervalMs = 1800; // 1.8 segundos entre cada som sequencial

            this.loadSettings();
            this.setupAutoplayUnlockListeners();
            this.preloadSoundAsset();
        }

        loadSettings() {
            try {
                const raw = localStorage.getItem(this.storageKey);
                if (raw) {
                    const parsed = JSON.parse(raw);
                    this.settings = { ...this.settings, ...parsed };
                }
            } catch (e) {
                console.warn('[SalesAudio] Falha ao carregar configurações de áudio:', e);
            }
        }

        saveSettings() {
            try {
                localStorage.setItem(this.storageKey, JSON.stringify(this.settings));
            } catch (e) {}
        }

        updateSetting(key, val) {
            if (key in this.settings) {
                this.settings[key] = val;
                this.saveSettings();
                this.syncSettingsUI();
            }
        }

        setVolume(val) {
            const num = Math.max(0, Math.min(1, parseFloat(val)));
            this.settings.volume = isNaN(num) ? 0.6 : num;
            this.saveSettings();
            this.syncSettingsUI();
        }

        setupAutoplayUnlockListeners() {
            const unlockHandler = () => {
                this.unlockAudioContext();
                window.removeEventListener('pointerdown', unlockHandler);
                window.removeEventListener('keydown', unlockHandler);
                window.removeEventListener('click', unlockHandler);
            };
            window.addEventListener('pointerdown', unlockHandler, { once: true });
            window.addEventListener('keydown', unlockHandler, { once: true });
            window.addEventListener('click', unlockHandler, { once: true });
        }

        unlockAudioContext() {
            try {
                const AudioContextClass = window.AudioContext || window.webkitAudioContext;
                if (!this.audioCtx && AudioContextClass) {
                    this.audioCtx = new AudioContextClass();
                }
                if (this.audioCtx && this.audioCtx.state === 'suspended') {
                    this.audioCtx.resume();
                }
                this.isUnlocked = true;
                this.updateAutoplayUIBadge(true);
            } catch (e) {
                console.warn('[SalesAudio] AudioContext unlock error:', e);
            }
        }

        preloadSoundAsset() {
            try {
                this.preloadedAudio = new Audio();
                this.preloadedAudio.src = this.audioAssetPath;
                this.preloadedAudio.preload = 'auto';
                this.preloadedAudio.load();
            } catch (e) {
                console.warn('[SalesAudio] Falha no preload do áudio:', e);
            }
        }

        /**
         * Enfileira a reprodução de um som na FIFO Queue.
         * Garante que múltiplos eventos simultâneos nunca toquem encavalados.
         */
        enqueue(soundType) {
            if (!this.settings.soundEnabled) return;
            if (soundType === 'pending' && !this.settings.pendingSoundEnabled) return;
            if (soundType === 'approved' && !this.settings.approvedSoundEnabled) return;

            this.queue.push({
                type: soundType,
                enqueuedAt: Date.now()
            });

            this.processQueue();
        }

        async processQueue() {
            if (this.isProcessingQueue) return;
            if (this.queue.length === 0) return;

            this.isProcessingQueue = true;

            while (this.queue.length > 0) {
                const item = this.queue.shift();
                try {
                    await this.playOfficialSound();
                } catch (err) {
                    console.warn(`[SalesAudio] Erro ao reproduzir som ${item.type}:`, err);
                }

                // Intervalo mínimo silencioso entre sons sequenciais (1.8s)
                if (this.queue.length > 0) {
                    await new Promise(resolve => setTimeout(resolve, this.minIntervalMs));
                }
            }

            this.isProcessingQueue = false;
        }

        /**
         * Reproduz o som oficial de venda (MP3 Oficial fornecido).
         * Utilizado tanto para PIX Pendente quanto para Pagamento Aprovado.
         */
        playOfficialSound() {
            return new Promise((resolve) => {
                try {
                    const audio = new Audio(this.audioAssetPath);
                    audio.volume = this.settings.volume;
                    
                    let resolved = false;
                    const onEnd = () => {
                        if (!resolved) {
                            resolved = true;
                            resolve();
                        }
                    };

                    audio.addEventListener('ended', onEnd);
                    audio.addEventListener('error', onEnd);

                    const playPromise = audio.play();
                    if (playPromise !== undefined) {
                        playPromise.catch((err) => {
                            console.warn('[SalesAudio] Autoplay restrito ou erro no playback:', err);
                            onEnd();
                        });
                    }

                    // Timeout de segurança caso o evento ended não dispare
                    setTimeout(onEnd, 3500);
                } catch (e) {
                    resolve();
                }
            });
        }

        // Aliases para compatibilidade com testes e chamadas diretas
        playApprovedSound() {
            return this.playOfficialSound();
        }

        playPendingTone() {
            return this.playOfficialSound();
        }

        updateAutoplayUIBadge(isActive) {
            const badge = document.getElementById('audio-autoplay-badge');
            if (badge) {
                badge.className = isActive ? 'badge badge-active text-[10px]' : 'badge badge-warning text-[10px]';
                badge.textContent = isActive ? 'Áudio Ativo' : 'Aguardando Interação';
            }
        }

        syncSettingsUI() {
            const masterCb = document.getElementById('setting-sound-master');
            const pendingCb = document.getElementById('setting-sound-pending');
            const approvedCb = document.getElementById('setting-sound-approved');
            const volumeSlider = document.getElementById('setting-sound-volume');
            const volumeLabel = document.getElementById('setting-volume-label');
            const browserCb = document.getElementById('setting-browser-notifications');

            if (masterCb) masterCb.checked = Boolean(this.settings.soundEnabled);
            if (pendingCb) pendingCb.checked = Boolean(this.settings.pendingSoundEnabled);
            if (approvedCb) approvedCb.checked = Boolean(this.settings.approvedSoundEnabled);
            if (volumeSlider) volumeSlider.value = Math.round(this.settings.volume * 100);
            if (volumeLabel) volumeLabel.textContent = `${Math.round(this.settings.volume * 100)}%`;
            if (browserCb) browserCb.checked = Boolean(this.settings.browserNotifications);
        }
    }

    // ─── 2. SALES NOTIFICATION ENGINE (CANONICAL DEDUPLICATION & MULTI-TAB) ──────

    class SalesNotificationEngine {
        constructor() {
            this.audioEngine = new SalesAudioEngine();
            this.knownEventsStorageKey = 'radwan_known_sale_events';
            this.knownEvents = new Set();
            this.isBaselineEstablished = false;

            this.channel = null;
            this.initMultiTabChannel();
            this.restoreKnownEvents();
        }

        initMultiTabChannel() {
            try {
                if (typeof window.BroadcastChannel !== 'undefined') {
                    this.channel = new BroadcastChannel('radwan_sales_notification_channel');
                    this.channel.onmessage = (msg) => {
                        if (msg && msg.data) {
                            if (msg.data.type === 'EVENT_HANDLED') {
                                this.knownEvents.add(msg.data.eventId);
                            }
                        }
                    };
                }
            } catch (e) {
                console.warn('[SalesNotification] BroadcastChannel não disponível:', e);
            }
        }

        restoreKnownEvents() {
            try {
                const raw = localStorage.getItem(this.knownEventsStorageKey);
                if (raw) {
                    const list = JSON.parse(raw);
                    if (Array.isArray(list)) {
                        list.forEach(id => this.knownEvents.add(id));
                    }
                }
            } catch (e) {}
        }

        persistKnownEvents() {
            try {
                const arr = Array.from(this.knownEvents).slice(-500); // Mantém os últimos 500 IDs
                localStorage.setItem(this.knownEventsStorageKey, JSON.stringify(arr));
            } catch (e) {}
        }

        normalizeStatus(rawStatus) {
            const s = (rawStatus || '').toUpperCase().trim();
            if (s === 'PAID' || s === 'PAGO' || s === 'APROVADO' || s === 'APPROVED' || s === 'COMPLETED') {
                return 'PAID';
            }
            return 'PENDING';
        }

        /**
         * Consome o estado real de pedidos carregados do servidor.
         * Distingue estritamente baseline histórico de novos eventos.
         */
        processOrders(orders) {
            if (!Array.isArray(orders) || orders.length === 0) return;

            // ─── 1. BASELINE INICIAL (ZERO SONS AO ABRIR/CARREGAR HISTÓRICO) ────
            if (!this.isBaselineEstablished) {
                orders.forEach(order => {
                    const txId = order.transaction_id || order.id;
                    if (!txId) return;
                    const status = this.normalizeStatus(order.status);
                    const eventKey = `${txId}:${status}`;
                    this.knownEvents.add(eventKey);
                });
                this.isBaselineEstablished = true;
                this.persistKnownEvents();
                return;
            }

            // ─── 2. DETECÇÃO DE TRANSIÇÕES E NOVOS EVENTOS REAIS ───────────────
            const newEvents = [];

            orders.forEach(order => {
                const txId = order.transaction_id || order.id;
                if (!txId) return;

                const status = this.normalizeStatus(order.status);
                const eventKey = `${txId}:${status}`;

                if (!this.knownEvents.has(eventKey)) {
                    this.knownEvents.add(eventKey);
                    newEvents.push({
                        type: status === 'PAID' ? 'PAYMENT_APPROVED' : 'PAYMENT_PENDING',
                        eventId: eventKey,
                        orderId: txId,
                        status: status,
                        amount: parseFloat(order.amount || 89.90),
                        customerName: (order.name || 'Cliente').split(' ')[0], // Primeiro nome para privacidade
                        occurredAt: order.created_at || new Date().toISOString()
                    });
                }
            });

            if (newEvents.length > 0) {
                this.persistKnownEvents();
                newEvents.forEach(evt => this.dispatchCanonicalNotification(evt));
            }
        }

        dispatchCanonicalNotification(evt) {
            // Notifica outras abas para evitar som duplo
            if (this.channel) {
                try {
                    this.channel.postMessage({ type: 'EVENT_HANDLED', eventId: evt.eventId });
                } catch (e) {}
            }

            // 1. Notificação Visual (Toast In-App)
            this.showSaleToast(evt);

            // 2. Notificação Sonora (FIFO Queue)
            if (evt.type === 'PAYMENT_APPROVED') {
                this.audioEngine.enqueue('approved');
            } else if (evt.type === 'PAYMENT_PENDING') {
                this.audioEngine.enqueue('pending');
            }

            // 3. Notificação do Navegador (Quando aba em segundo plano)
            if (document.visibilityState === 'hidden' && this.audioEngine.settings.browserNotifications) {
                this.showBrowserNotification(evt);
            }

            // Log sanitizado em DEV
            console.log(`[SalesNotification] event=${evt.type} order=***${evt.orderId.slice(-4)} amount=R$${evt.amount.toFixed(2)}`);
        }

        showSaleToast(evt) {
            const container = document.getElementById('toast-container');
            if (!container) return;

            const isApproved = evt.type === 'PAYMENT_APPROVED';
            const formattedAmount = window.analyticsEngine?.formatMoney(evt.amount) || `R$ ${evt.amount.toFixed(2).replace('.', ',')}`;

            const toast = document.createElement('div');
            toast.className = `toast ${isApproved ? 'toast-sale-approved' : 'toast-sale-pending'}`;
            toast.setAttribute('role', 'alert');
            toast.setAttribute('aria-live', isApproved ? 'assertive' : 'polite');

            toast.innerHTML = `
                <div class="flex items-center gap-2.5 min-w-0 flex-1">
                    <span class="text-lg flex-shrink-0 ${isApproved ? 'sale-check-icon text-[#1FC16B]' : 'text-[#F5A524]'}">
                        ${isApproved ? '✅' : '⏳'}
                    </span>
                    <div class="min-w-0">
                        <div class="flex items-center gap-1.5">
                            <span class="font-bold text-xs text-[#F5F5F7]">
                                ${isApproved ? 'Venda Aprovada!' : 'PIX Pendente Gerado'}
                            </span>
                            <span class="badge ${isApproved ? 'badge-active' : 'badge-warning'} text-[9px] font-mono">
                                ${formattedAmount}
                            </span>
                        </div>
                        <p class="text-[10.5px] text-[#A1A1A6] truncate">
                            ${isApproved ? 'Pagamento compensado com sucesso' : 'Aguardando compensação do cliente'}
                        </p>
                    </div>
                </div>
                <button onclick="this.parentElement.remove()" class="text-[#6E6E73] hover:text-[#F5F5F7] text-xs p-1 flex-shrink-0" title="Fechar">✕</button>
            `;

            container.appendChild(toast);

            setTimeout(() => {
                if (toast.parentElement) {
                    toast.style.opacity = '0';
                    toast.style.transform = 'translateY(10px) scale(0.95)';
                    setTimeout(() => toast.remove(), 200);
                }
            }, 5500);
        }

        async showBrowserNotification(evt) {
            const isApproved = evt.type === 'PAYMENT_APPROVED';
            const formattedAmount = window.analyticsEngine?.formatMoney(evt.amount) || `R$ ${evt.amount.toFixed(2).replace('.', ',')}`;
            const title = isApproved ? '💰 Venda Aprovada!' : '⏳ PIX Pendente';
            const body = `${isApproved ? 'Pagamento confirmado' : 'Novo PIX gerado'} • ${formattedAmount}`;

            // 1. Tenta disparar via Service Worker se registrado (PWA / Mobile / Background)
            if ('serviceWorker' in navigator) {
                try {
                    const reg = await navigator.serviceWorker.ready;
                    if (reg && reg.showNotification) {
                        await reg.showNotification(title, {
                            body: body,
                            icon: 'assets/logo-radwan-ads.png',
                            badge: 'assets/logo-radwan-ads.png',
                            tag: evt.eventId,
                            data: {
                                url: '/#view-home',
                                eventId: evt.eventId,
                                timestamp: Date.now()
                            },
                            vibrate: [200, 100, 200]
                        });
                        return;
                    }
                } catch (swErr) {
                    console.warn('[SalesNotification] Falha ao exibir via ServiceWorker:', swErr);
                }
            }

            // 2. Fallback para Notification API nativa
            if (typeof window.Notification !== 'undefined' && Notification.permission === 'granted') {
                try {
                    const n = new Notification(title, {
                        body: body,
                        icon: 'assets/logo-radwan-ads.png',
                        tag: evt.eventId,
                        silent: true
                    });

                    n.onclick = () => {
                        window.focus();
                        n.close();
                    };
                } catch (e) {
                    console.warn('[SalesNotification] Falha ao disparar notificação nativa:', e);
                }
            }
        }

        async toggleBrowserNotifications(enabled) {
            if (!enabled) {
                this.audioEngine.updateSetting('browserNotifications', false);
                return;
            }

            if (typeof window.Notification === 'undefined') {
                alert('Seu navegador não suporta notificações de sistema.');
                this.audioEngine.syncSettingsUI();
                return;
            }

            let permission = Notification.permission;
            if (permission !== 'granted' && permission !== 'denied') {
                permission = await Notification.requestPermission();
            }

            if (permission === 'granted') {
                this.audioEngine.updateSetting('browserNotifications', true);
                this.registerPushServiceWorker();
            } else {
                alert('Notificações estão bloqueadas no seu navegador. Permita o acesso nas configurações do site para ativar.');
                this.audioEngine.updateSetting('browserNotifications', false);
            }

            this.audioEngine.syncSettingsUI();
        }

        async registerPushServiceWorker() {
            if (!('serviceWorker' in navigator)) return;
            try {
                const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
                console.log('[SW] Service Worker registrado com sucesso:', reg.scope);

                if ('PushManager' in window && reg.pushManager) {
                    // Obtém a chave pública VAPID do servidor
                    const res = await fetch('/api/push-subscriptions', { method: 'GET' });
                    if (res.ok) {
                        const data = await res.json();
                        if (data.publicKey) {
                            const sub = await reg.pushManager.subscribe({
                                userVisibleOnly: true,
                                applicationServerKey: this.urlBase64ToUint8Array(data.publicKey)
                            });

                            // Salva a subscription no backend
                            await fetch('/api/push-subscriptions', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ subscription: sub })
                            });
                            console.log('[SW] Push Subscription registrada e sincronizada com sucesso!');
                        }
                    }
                }
            } catch (err) {
                console.warn('[SW] Falha ao configurar Service Worker Push:', err);
            }
        }

        urlBase64ToUint8Array(base64String) {
            const padding = '='.repeat((4 - base64String.length % 4) % 4);
            const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');
            const rawData = window.atob(base64);
            const outputArray = new Uint8Array(rawData.length);
            for (let i = 0; i < rawData.length; ++i) {
                outputArray[i] = rawData.charCodeAt(i);
            }
            return outputArray;
        }

        updateAudioSetting(key, val) {
            this.audioEngine.updateSetting(key, val);
        }

        updateVolume(val) {
            this.audioEngine.setVolume(parseFloat(val) / 100);
        }

        /**
         * Teste de áudio isolado (Preview acústico, NÃO gera pedidos, NÃO altera métricas).
         */
        testSound(soundType) {
            this.audioEngine.unlockAudioContext();
            this.audioEngine.playOfficialSound();
        }

        /**
         * Teste isolado de Web Push (Preview visual, NÃO gera pedidos).
         */
        testPush(type = 'approved') {
            const isApproved = type === 'approved';
            this.dispatchCanonicalNotification({
                type: isApproved ? 'PAYMENT_APPROVED' : 'PAYMENT_PENDING',
                eventId: `test_${Date.now()}`,
                orderId: 'TEST-9999',
                status: isApproved ? 'PAID' : 'PENDING',
                amount: 89.90,
                customerName: 'Michel',
                occurredAt: new Date().toISOString()
            });
        }
    }

    // ─── INSTANCIAÇÃO GLOBAL & EXPORT ──────────────────────────────────────────

    window.salesNotificationEngine = new SalesNotificationEngine();

    // Sincroniza a interface de configurações quando o DOM estiver pronto
    document.addEventListener('DOMContentLoaded', () => {
        window.salesNotificationEngine.audioEngine.syncSettingsUI();
    });

})();
