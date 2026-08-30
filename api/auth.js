// ==============================================================================
// RADWAN ADS — AUTHENTICATION ENDPOINT (/api/auth)
// Gestão de Sessão, Login Seguro com Rate Limit, Logout e Verificação
// ==============================================================================

const authGuard = require('../lib/auth-guard.js');

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Admin-Auth');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    const action = req.query.action || (req.body && req.body.action) || 'check';
    const isProduction = process.env.NODE_ENV === 'production' || req.headers['x-forwarded-proto'] === 'https';
    const clientIp = authGuard.getClientIp(req);

    // 1. AÇÃO: VERIFICAÇÃO DE SESSÃO ATIVA (CHECK)
    if (action === 'check' || req.method === 'GET') {
        const sessionCheck = authGuard.validateAdminSession(req);
        if (sessionCheck.authenticated) {
            return res.status(200).json({
                authenticated: true,
                method: sessionCheck.method,
                message: 'Sessão administrativa válida e ativa.'
            });
        }
        return res.status(401).json({
            authenticated: false,
            error: sessionCheck.error || 'Acesso negado: Sessão não encontrada ou expirada.'
        });
    }

    // 2. AÇÃO: LOGIN COM RATE LIMITING
    if (action === 'login' && req.method === 'POST') {
        // Checa Rate Limit do IP
        const rateCheck = authGuard.checkRateLimit(clientIp);
        if (!rateCheck.allowed) {
            res.setHeader('Retry-After', String(rateCheck.resetSeconds || 900));
            return res.status(429).json({
                error: `Muitas tentativas incorretas. Acesso bloqueado temporariamente. Tente novamente em ${rateCheck.resetSeconds} segundos.`,
                code: 429
            });
        }

        const { password } = req.body || {};
        if (!password || typeof password !== 'string') {
            return res.status(400).json({ error: 'Campo "password" é obrigatório.' });
        }

        const isValid = authGuard.verifyPassword(password.trim());
        if (!isValid) {
            authGuard.recordFailedAttempt(clientIp);
            return res.status(401).json({
                error: 'Senha administrativa incorreta.',
                code: 401
            });
        }

        // Login Bem-Sucedido: Limpa tentativas e emite Cookie HttpOnly assinado
        authGuard.clearRateLimit(clientIp);
        const sessionToken = authGuard.createSessionToken();
        const cookieHeader = authGuard.buildSessionCookie(sessionToken, isProduction);

        res.setHeader('Set-Cookie', cookieHeader);
        return res.status(200).json({
            success: true,
            authenticated: true,
            message: 'Autenticado com sucesso. Sessão criada.'
        });
    }

    // 3. AÇÃO: LOGOUT / ENCERRAMENTO DE SESSÃO
    if (action === 'logout') {
        const logoutCookie = authGuard.buildLogoutCookie(isProduction);
        res.setHeader('Set-Cookie', logoutCookie);
        return res.status(200).json({
            success: true,
            authenticated: false,
            message: 'Sessão encerrada com sucesso.'
        });
    }

    return res.status(400).json({ error: `Ação "${action}" inválida.` });
};
