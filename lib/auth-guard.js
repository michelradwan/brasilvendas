// ==============================================================================
// RADWAN ADS — ZERO-TRUST AUTHENTICATION & SECURITY GUARD (SERVER-SIDE)
// ==============================================================================

const crypto = require('crypto');

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const SESSION_SECRET = process.env.SESSION_SECRET || process.env.JWT_SECRET;
const SESSION_MAX_AGE_SEC = 86400; // 24 Horas

// Rate Limiting em Memória para Login (Anti Brute-Force)
const loginAttempts = new Map();

function getClientIp(req) {
    return req.headers['x-forwarded-for']?.split(',')[0].trim() ||
           req.headers['x-real-ip'] ||
           req.connection?.remoteAddress ||
           req.socket?.remoteAddress ||
           '127.0.0.1';
}

function checkRateLimit(ip) {
    const now = Date.now();
    const windowMs = 15 * 60 * 1000; // 15 Minutos
    const maxAttempts = 5;

    const record = loginAttempts.get(ip);
    if (!record) {
        return { allowed: true, remaining: maxAttempts };
    }

    if (now - record.firstAttempt > windowMs) {
        loginAttempts.delete(ip);
        return { allowed: true, remaining: maxAttempts };
    }

    if (record.count >= maxAttempts) {
        const resetSeconds = Math.ceil((record.firstAttempt + windowMs - now) / 1000);
        return { allowed: false, resetSeconds, count: record.count };
    }

    return { allowed: true, remaining: maxAttempts - record.count };
}

function recordFailedAttempt(ip) {
    const now = Date.now();
    const record = loginAttempts.get(ip);
    if (!record) {
        loginAttempts.set(ip, { count: 1, firstAttempt: now });
    } else {
        record.count += 1;
    }
}

function clearRateLimit(ip) {
    loginAttempts.delete(ip);
}

// Comparação de Senha com Timing-Safe Equal e tolerância a auto-capitalização mobile
function verifyPassword(providedPassword) {
    if (!providedPassword || typeof providedPassword !== 'string') return false;

    const trimmedInput = providedPassword.trim();
    const validPasswords = Array.from(new Set([
        ADMIN_PASSWORD,
        process.env.ADMIN_PASSWORD,
        process.env.ADMIN_PASSWORD_BACKUP
    ].filter(Boolean)));

    if (validPasswords.length === 0) {
        console.error('[Security Error] ADMIN_PASSWORD não configurado no servidor (Fail-Closed).');
        return false;
    }

    for (const validPass of validPasswords) {
        const target = validPass.trim();

        // 1. Verificação Estrita (Timing-Safe)
        const bufA = Buffer.from(trimmedInput);
        const bufB = Buffer.from(target);
        if (bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB)) {
            return true;
        }

        // 2. Verificação com Normalização Lowercase (para celulares com teclado auto-capitalizado)
        const bufALower = Buffer.from(trimmedInput.toLowerCase());
        const bufBLower = Buffer.from(target.toLowerCase());
        if (bufALower.length === bufBLower.length && crypto.timingSafeEqual(bufALower, bufBLower)) {
            return true;
        }
    }
    return false;
}

// Criação de Token de Sessão HMAC Assinado
function createSessionToken() {
    const timestamp = Date.now();
    const randomBytes = crypto.randomBytes(16).toString('hex');
    const payload = `admin:${timestamp}:${randomBytes}`;
    const signature = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('hex');
    return Buffer.from(`${payload}:${signature}`).toString('base64');
}

// Validação de Token de Sessão
function verifySessionToken(token) {
    if (!token || typeof token !== 'string') return false;

    try {
        const decoded = Buffer.from(token, 'base64').toString('utf8');
        const parts = decoded.split(':');
        if (parts.length !== 4) return false;

        const [user, timestampStr, randomBytes, signature] = parts;
        const timestamp = parseInt(timestampStr, 10);
        const now = Date.now();

        // Expiração (24h) ou timestamp futuro além de 60s
        if (isNaN(timestamp) || (now - timestamp > SESSION_MAX_AGE_SEC * 1000) || (timestamp - now > 60000)) {
            return false;
        }

        const payload = `${user}:${timestampStr}:${randomBytes}`;
        const expectedSignature = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('hex');

        const bufA = Buffer.from(signature);
        const bufB = Buffer.from(expectedSignature);

        if (bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB)) {
            return true;
        }
    } catch (e) {
        return false;
    }
    return false;
}

// Extrai Cookies da Request
function parseCookies(req) {
    const list = {};
    const cookieHeader = req.headers?.cookie;
    if (!cookieHeader) return list;

    cookieHeader.split(';').forEach(cookie => {
        let [name, ...rest] = cookie.split('=');
        name = name?.trim();
        if (!name) return;
        const value = rest.join('=').trim();
        if (!value) return;
        list[name] = decodeURIComponent(value);
    });

    return list;
}

// Middleware / Função de Validação Unificada para Endpoints do Servidor
function validateAdminSession(req) {
    // 1. Checa Cookie HttpOnly Seguro
    const cookies = parseCookies(req);
    const sessionCookie = cookies['radwan_session'] || cookies['meta_admin_session'];

    if (sessionCookie && verifySessionToken(sessionCookie)) {
        return { authenticated: true, method: 'COOKIE_SESSION' };
    }

    // 2. Checa Header de Autenticação (Para Testes Automatizados, CLI, MCP Server e Workers)
    const authHeader = req.headers?.['x-admin-auth'] || req.headers?.['authorization'];
    if (authHeader) {
        const providedSecret = authHeader.replace(/^Bearer\s+/i, '').trim();
        if (verifyPassword(providedSecret) || verifySessionToken(providedSecret)) {
            return { authenticated: true, method: 'HEADER_AUTH' };
        }
    }

    return {
        authenticated: false,
        error: 'Sessão administrativa ausente, inválida ou expirada.'
    };
}

// Constrói Cabeçalho Set-Cookie para Login
function buildSessionCookie(token, isProduction = true) {
    const secureFlag = isProduction ? '; Secure' : '';
    return `radwan_session=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_MAX_AGE_SEC}${secureFlag}`;
}

// Constrói Cabeçalho Set-Cookie para Logout
function buildLogoutCookie(isProduction = true) {
    const secureFlag = isProduction ? '; Secure' : '';
    return `radwan_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT${secureFlag}`;
}

module.exports = {
    verifyPassword,
    createSessionToken,
    verifySessionToken,
    validateAdminSession,
    buildSessionCookie,
    buildLogoutCookie,
    checkRateLimit,
    recordFailedAttempt,
    clearRateLimit,
    getClientIp
};
