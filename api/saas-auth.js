// ==============================================================================
// RADWAN ADS — SAAS AUTHENTICATION & MULTI-TENANT ENDPOINT (/api/saas-auth)
// Supabase Auth, Google OAuth, Workspaces & RBAC Session Management
// ==============================================================================

const supabase = require('../lib/supabase-gateway.js');
const authGuard = require('../lib/auth-guard.js');

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') return res.status(200).end();

    const action = req.query.action || (req.body && req.body.action) || 'session';
    const isProduction = process.env.NODE_ENV === 'production' || req.headers['x-forwarded-proto'] === 'https';

    try {
        // ─── 1. VERIFICAÇÃO DE SESSÃO ATIVA (SESSION / CHECK) ────────────────────
        if (action === 'session' || req.method === 'GET') {
            const cookies = authGuard.parseCookies(req);
            const sessionToken = cookies['radwan_session'];

            if (!sessionToken || !authGuard.verifySessionToken(sessionToken)) {
                return res.status(401).json({ authenticated: false, error: 'Sessão expirada ou ausente.' });
            }

            // Decodifica payload da sessão
            const decoded = Buffer.from(sessionToken, 'base64').toString('utf8');
            const [userId] = decoded.split(':');

            // Busca workspaces autorizados no Supabase
            const workspaces = await supabase.listUserWorkspaces(userId);

            return res.status(200).json({
                authenticated: true,
                user: { id: userId },
                workspaces: workspaces
            });
        }

        // ─── 2. CADASTRO POR EMAIL / SENHA (SIGNUP) ──────────────────────────────
        if (action === 'signup' && req.method === 'POST') {
            const { email, password, name } = req.body || {};
            if (!email || !password) return res.status(400).json({ error: 'Email e senha são obrigatórios.' });

            const authRes = await supabase.authRequest('signup', 'POST', {
                email: email.trim(),
                password: password,
                data: { full_name: name ? name.trim() : '' }
            });

            if (!authRes.user?.id) {
                throw new Error('Falha ao registrar usuário no Supabase.');
            }

            // Emite cookie de sessão seguro
            const sessionToken = authGuard.createSessionToken(authRes.user.id);
            const cookieHeader = authGuard.buildSessionCookie(sessionToken, isProduction);
            res.setHeader('Set-Cookie', cookieHeader);

            return res.status(200).json({
                success: true,
                user: { id: authRes.user.id, email: authRes.user.email, name },
                message: 'Conta criada com sucesso.'
            });
        }

        // ─── 3. LOGIN POR EMAIL / SENHA (LOGIN) ──────────────────────────────────
        if (action === 'login' && req.method === 'POST') {
            const { email, password } = req.body || {};
            if (!email || !password) return res.status(400).json({ error: 'Email e senha são obrigatórios.' });

            // Fallback de compatibilidade: Login Legado Administrativo do Michel
            if (password === process.env.ADMIN_PASSWORD) {
                const sessionToken = authGuard.createSessionToken('legacy_admin_user');
                const cookieHeader = authGuard.buildSessionCookie(sessionToken, isProduction);
                res.setHeader('Set-Cookie', cookieHeader);

                return res.status(200).json({
                    success: true,
                    user: { id: 'legacy_admin_user', email: 'admin@radwanads.com', name: 'Administrador' },
                    workspaces: [{ id: 'default_ws', name: 'Brasil Vendas', role: 'OWNER' }]
                });
            }

            const authRes = await supabase.authRequest('token?grant_type=password', 'POST', {
                email: email.trim(),
                password: password
            });

            if (!authRes.user?.id) {
                throw new Error('Credenciais inválidas.');
            }

            const workspaces = await supabase.listUserWorkspaces(authRes.user.id);
            const sessionToken = authGuard.createSessionToken(authRes.user.id);
            const cookieHeader = authGuard.buildSessionCookie(sessionToken, isProduction);
            res.setHeader('Set-Cookie', cookieHeader);

            return res.status(200).json({
                success: true,
                user: { id: authRes.user.id, email: authRes.user.email },
                workspaces: workspaces
            });
        }

        // ─── 4. CRIAÇÃO DE NOVO WORKSPACE (ONBOARDING) ───────────────────────────
        if (action === 'create_workspace' && req.method === 'POST') {
            const cookies = authGuard.parseCookies(req);
            const sessionToken = cookies['radwan_session'];
            if (!sessionToken || !authGuard.verifySessionToken(sessionToken)) {
                return res.status(401).json({ error: 'Não autorizado.' });
            }

            const decoded = Buffer.from(sessionToken, 'base64').toString('utf8');
            const [userId] = decoded.split(':');
            const { name } = req.body || {};

            const workspace = await supabase.createWorkspace(userId, name || 'Nova Operação');
            return res.status(200).json({ success: true, workspace });
        }

        // ─── 5. RECUPERAÇÃO DE SENHA (RESET PASSWORD) ────────────────────────────
        if (action === 'reset_password' && req.method === 'POST') {
            const { email } = req.body || {};
            if (!email) return res.status(400).json({ error: 'Email é obrigatório.' });

            await supabase.authRequest('recover', 'POST', { email: email.trim() });
            return res.status(200).json({ success: true, message: 'Link de recuperação enviado com sucesso.' });
        }

        // ─── 6. LOGOUT ───────────────────────────────────────────────────────────
        if (action === 'logout') {
            const logoutCookie = authGuard.buildLogoutCookie(isProduction);
            res.setHeader('Set-Cookie', logoutCookie);
            return res.status(200).json({ success: true, message: 'Sessão encerrada.' });
        }

        return res.status(400).json({ error: `Ação "${action}" desconhecida.` });

    } catch (err) {
        console.error('[SaaS Auth API Error]', err.message);
        return res.status(err.statusCode || 500).json({
            error: err.message || 'Erro interno no servidor de autenticação.'
        });
    }
};
