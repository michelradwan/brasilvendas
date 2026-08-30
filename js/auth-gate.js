// ==============================================================================
// RADWAN ADS — SUPABASE AUTH GATE & SAAS INITIALIZATION (VANILLA JS)
// Zero External Framework • Scan Grid Micro-interaction • Session Context
// ==============================================================================

(function () {
    'use strict';

    class SupabaseAuthGate {
        constructor() {
            this.splashScreen = document.getElementById('splash-screen');
            this.authModal = document.getElementById('auth-modal-screen');
            this.onboardingModal = document.getElementById('onboarding-modal-screen');
            this.appLayout = document.getElementById('app-main-layout');

            this.currentUser = null;
            this.currentWorkspace = null;
            this.userWorkspaces = [];

            this.authMode = 'login'; // 'login' | 'signup' | 'reset'

            this.initEvents();
            this.checkExistingSession();
        }

        initEvents() {
            // Botão Iniciar RADWAN (Scan Grid)
            const scanBtn = document.getElementById('btn-start-radwan');
            if (scanBtn) {
                scanBtn.addEventListener('click', () => this.handleScanBtnClick(scanBtn));
            }

            // Alternadores de aba Login / Cadastro / Reset
            document.querySelectorAll('[data-auth-switch]').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.preventDefault();
                    this.switchAuthMode(btn.getAttribute('data-auth-switch'));
                });
            });
        }

        // ─── 1. RITUAL DE ENTRADA: SCAN GRID BUTTON (350ms MICROINTERAÇÃO) ───────
        handleScanBtnClick(btn) {
            btn.classList.add('is-activating');

            setTimeout(() => {
                if (this.currentUser && this.currentWorkspace) {
                    // Usuário já autenticado: abre direto o dashboard
                    this.revealDashboard();
                } else {
                    // Abre o card de autenticação
                    this.splashScreen?.classList.add('is-hidden');
                    this.authModal?.classList.remove('is-hidden');
                }
            }, 350);
        }

        switchAuthMode(mode) {
            this.authMode = mode;
            const titleEl = document.getElementById('auth-card-title');
            const submitBtn = document.getElementById('auth-submit-btn');
            const nameField = document.getElementById('auth-name-container');
            const passwordField = document.getElementById('auth-password-container');
            const loginOptions = document.getElementById('auth-login-options');
            const errorEl = document.getElementById('auth-error-msg');

            if (errorEl) errorEl.classList.add('hidden');

            if (mode === 'signup') {
                if (titleEl) titleEl.textContent = 'Criar sua conta';
                if (submitBtn) submitBtn.textContent = 'Criar conta no RADWAN ADS';
                if (nameField) nameField.classList.remove('hidden');
                if (passwordField) passwordField.classList.remove('hidden');
                if (loginOptions) loginOptions.classList.add('hidden');
            } else if (mode === 'reset') {
                if (titleEl) titleEl.textContent = 'Recuperar senha';
                if (submitBtn) submitBtn.textContent = 'Enviar link de recuperação';
                if (nameField) nameField.classList.add('hidden');
                if (passwordField) passwordField.classList.add('hidden');
                if (loginOptions) loginOptions.classList.add('hidden');
            } else {
                if (titleEl) titleEl.textContent = 'Acessar o RADWAN ADS';
                if (submitBtn) submitBtn.textContent = 'Entrar';
                if (nameField) nameField.classList.add('hidden');
                if (passwordField) passwordField.classList.remove('hidden');
                if (loginOptions) loginOptions.classList.remove('hidden');
            }
        }

        // ─── 2. AUTENTICAÇÃO COM GOOGLE (OAUTH PKCE) ─────────────────────────────
        async loginWithGoogle() {
            try {
                const supabaseUrl = 'https://jlgjbycncurgmsbqughp.supabase.co';
                const redirectUri = `${window.location.origin}/#auth-callback`;
                window.location.href = `${supabaseUrl}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(redirectUri)}`;
            } catch (err) {
                this.showError('Não foi possível iniciar o login com o Google.');
            }
        }

        // ─── 3. SUBMISSÃO DE EMAIL + SENHA ───────────────────────────────────────
        async handleAuthSubmit(event) {
            event.preventDefault();
            const email = document.getElementById('auth-email-input')?.value?.trim();
            const password = document.getElementById('auth-password-input')?.value;
            const name = document.getElementById('auth-name-input')?.value?.trim();
            const submitBtn = document.getElementById('auth-submit-btn');

            if (!email) return this.showError('Por favor, informe seu email.');
            if (this.authMode !== 'reset' && !password) return this.showError('Por favor, informe sua senha.');

            try {
                if (submitBtn) submitBtn.disabled = true;

                if (this.authMode === 'signup') {
                    const res = await fetch('/api/saas-auth', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ action: 'signup', email, password, name })
                    });
                    const data = await res.json();
                    if (!res.ok) throw new Error(data.error || 'Falha ao criar conta.');

                    this.currentUser = data.user;
                    this.authModal?.classList.add('is-hidden');
                    this.showOnboarding();
                } else if (this.authMode === 'login') {
                    const res = await fetch('/api/saas-auth', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ action: 'login', email, password })
                    });
                    const data = await res.json();
                    if (!res.ok) throw new Error(data.error || 'Email ou senha incorretos.');

                    this.currentUser = data.user;
                    this.userWorkspaces = data.workspaces || [];

                    if (this.userWorkspaces.length === 0) {
                        this.authModal?.classList.add('is-hidden');
                        this.showOnboarding();
                    } else {
                        this.currentWorkspace = this.userWorkspaces[0];
                        this.revealDashboard();
                    }
                } else if (this.authMode === 'reset') {
                    const res = await fetch('/api/saas-auth', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ action: 'reset_password', email })
                    });
                    const data = await res.json();
                    if (!res.ok) throw new Error(data.error || 'Falha ao solicitar reset.');
                    alert('Se o email estiver cadastrado, um link seguro de recuperação foi enviado.');
                    this.switchAuthMode('login');
                }
            } catch (err) {
                this.showError(err.message);
            } finally {
                if (submitBtn) submitBtn.disabled = false;
            }
        }

        // ─── 4. ONBOARDING GUIADO (MINHA OPERAÇÃO VS GESTOR) ─────────────────────
        showOnboarding() {
            if (this.onboardingModal) {
                this.onboardingModal.classList.remove('is-hidden');
            }
        }

        async completeOnboarding(type, workspaceName) {
            try {
                const res = await fetch('/api/saas-auth', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        action: 'create_workspace',
                        name: workspaceName || (type === 'agency' ? 'Primeiro Cliente' : 'Minha Operação')
                    })
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || 'Falha ao criar workspace.');

                this.currentWorkspace = data.workspace;
                this.userWorkspaces.push(data.workspace);
                this.onboardingModal?.classList.add('is-hidden');
                this.revealDashboard();
            } catch (err) {
                alert(`Erro no onboarding: ${err.message}`);
            }
        }

        // ─── 5. REVELAÇÃO DO DASHBOARD EXISTENTE ─────────────────────────────────
        revealDashboard() {
            this.splashScreen?.classList.add('is-hidden');
            this.authModal?.classList.add('is-hidden');
            this.onboardingModal?.classList.add('is-hidden');

            if (this.appLayout) {
                this.appLayout.classList.remove('opacity-0', 'pointer-events-none');
                this.appLayout.classList.add('opacity-100');
            }

            this.updateWorkspaceUI();

            // Dispara sincronização inicial de dados do Dashboard
            if (window.dashboard && typeof window.dashboard.init === 'function') {
                window.dashboard.init();
            }
        }

        updateWorkspaceUI() {
            const nameEl = document.getElementById('topbar-account-name');
            if (nameEl && this.currentWorkspace) {
                nameEl.textContent = this.currentWorkspace.name;
            }
        }

        async checkExistingSession() {
            try {
                const res = await fetch('/api/saas-auth?action=session');
                if (res.ok) {
                    const data = await res.json();
                    if (data.authenticated && data.user) {
                        this.currentUser = data.user;
                        this.userWorkspaces = data.workspaces || [];
                        this.currentWorkspace = this.userWorkspaces[0] || null;
                    }
                }
            } catch (e) {
                // Silencioso se não houver sessão ativa
            }
        }

        showError(msg) {
            const errorEl = document.getElementById('auth-error-msg');
            if (errorEl) {
                errorEl.textContent = msg;
                errorEl.classList.remove('hidden');
            }
        }

        async logout() {
            try {
                await fetch('/api/saas-auth?action=logout', { method: 'POST' });
            } catch (e) {}
            window.location.reload();
        }
    }

    // Instanciação Global
    window.authGate = new SupabaseAuthGate();

})();
