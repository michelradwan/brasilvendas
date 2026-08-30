// ==============================================================================
// RADWAN ADS — CLIENT-SIDE AUTH GATE & ZERO-TRUST SECURITY BOUNDARY
// ==============================================================================

class AuthGateClient {
    constructor() {
        this.isAuthenticated = false;
        this.gateOverlay = null;
        this.errorEl = null;
        this.passwordInput = null;
        this.submitBtn = null;
    }

    init() {
        this.gateOverlay = document.getElementById('auth-gate-screen');
        this.errorEl = document.getElementById('auth-gate-error');
        this.passwordInput = document.getElementById('auth-gate-password');
        this.submitBtn = document.getElementById('auth-gate-submit-btn');

        return this.checkSession();
    }

    async checkSession() {
        try {
            const res = await fetch('/api/auth?action=check', {
                method: 'GET',
                credentials: 'include',
                headers: { 'Accept': 'application/json' }
            });

            if (res.ok) {
                const data = await res.json();
                if (data.authenticated) {
                    this.isAuthenticated = true;
                    this.hide();
                    return true;
                }
            }
        } catch (e) {
            console.warn('[AuthGate] Check session failed:', e.message);
        }

        this.isAuthenticated = false;
        this.show();
        return false;
    }

    show(errorMessage = null) {
        this.isAuthenticated = false;
        if (this.gateOverlay) {
            this.gateOverlay.classList.remove('hidden');
        }
        
        const appContainer = document.getElementById('app-main-layout');
        if (appContainer) {
            appContainer.classList.add('opacity-0', 'pointer-events-none');
        }

        if (errorMessage && this.errorEl) {
            this.errorEl.textContent = errorMessage;
            this.errorEl.classList.remove('hidden');
        } else if (this.errorEl) {
            this.errorEl.classList.add('hidden');
        }

        if (this.passwordInput) {
            this.passwordInput.value = '';
            setTimeout(() => this.passwordInput.focus(), 150);
        }
    }

    hide() {
        if (this.gateOverlay) {
            this.gateOverlay.classList.add('hidden');
        }
        const appContainer = document.getElementById('app-main-layout');
        if (appContainer) {
            appContainer.classList.remove('opacity-0', 'pointer-events-none');
        }
    }

    async handleLogin(event) {
        if (event) event.preventDefault();

        const password = this.passwordInput?.value || '';
        if (!password.trim()) {
            if (this.errorEl) {
                this.errorEl.textContent = 'Por favor, digite a senha administrativa.';
                this.errorEl.classList.remove('hidden');
            }
            return;
        }

        if (this.submitBtn) {
            this.submitBtn.disabled = true;
            this.submitBtn.innerHTML = '<span>Verificando credenciais...</span>';
        }
        if (this.errorEl) this.errorEl.classList.add('hidden');

        try {
            const res = await fetch('/api/auth?action=login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ password: password.trim() })
            });

            const data = await res.json();

            if (res.ok && data.success) {
                this.isAuthenticated = true;
                this.hide();
                if (window.dashboard && typeof window.dashboard.init === 'function') {
                    await window.dashboard.init();
                }
            } else {
                const msg = data.error || 'Senha administrativa incorreta.';
                if (this.errorEl) {
                    this.errorEl.textContent = msg;
                    this.errorEl.classList.remove('hidden');
                }
            }
        } catch (err) {
            if (this.errorEl) {
                this.errorEl.textContent = 'Erro de comunicação ao conectar ao servidor.';
                this.errorEl.classList.remove('hidden');
            }
        } finally {
            if (this.submitBtn) {
                this.submitBtn.disabled = false;
                this.submitBtn.innerHTML = '<span>Entrar no Console</span>';
            }
        }
    }

    async handleLogout() {
        try {
            await fetch('/api/auth?action=logout', {
                method: 'POST',
                credentials: 'include'
            });
        } catch (e) {}

        this.show('Sessão encerrada com sucesso.');
    }
}

window.authGate = new AuthGateClient();
