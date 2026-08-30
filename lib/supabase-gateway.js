// ==============================================================================
// RADWAN ADS — SUPABASE CLIENT & MULTI-TENANT GATEWAY (SERVER-SIDE)
// Zero External NPM • Native HTTPS REST • Row-Level Security • Fail-Closed
// ==============================================================================

const https = require('https');
const crypto = require('crypto');

class SupabaseGateway {
    constructor() {
        this.url = (process.env.SUPABASE_URL || 'https://jlgjbycncurgmsbqughp.supabase.co').replace(/\/+$/, '');
        this.anonKey = process.env.SUPABASE_ANON_KEY || '';
        this.serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
        this.encryptionKey = process.env.TOKEN_ENCRYPTION_KEY || 'e8f52b7d91a4c3e6f0b8d2a1c4e7f9a3b6c8d1e2f4a7b9c1d3e5f7a9b2c4e6f8';
    }

    // ─── 1. CLIENTE REST NATIVO SUPABASE (POSTGRES / REST v1) ─────────────────

    async restRequest(endpoint, method = 'GET', body = null, useServiceRole = true, extraHeaders = {}) {
        const fullUrl = `${this.url}/rest/v1/${endpoint.replace(/^\/+/, '')}`;
        const parsed = new URL(fullUrl);
        const apiKey = useServiceRole ? this.serviceRoleKey : this.anonKey;

        const payloadStr = body ? JSON.stringify(body) : null;

        const options = {
            hostname: parsed.hostname,
            port: parsed.port || 443,
            path: parsed.pathname + parsed.search,
            method: method,
            headers: {
                'apikey': apiKey,
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
                'Prefer': 'return=representation',
                ...extraHeaders
            }
        };

        if (payloadStr) {
            options.headers['Content-Length'] = Buffer.byteLength(payloadStr);
        }

        return new Promise((resolve, reject) => {
            const req = https.request(options, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    let parsedData = null;
                    try {
                        parsedData = data ? JSON.parse(data) : null;
                    } catch (e) {
                        parsedData = data;
                    }

                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        resolve(parsedData);
                    } else {
                        const errMsg = (parsedData && parsedData.message) || (parsedData && parsedData.error) || `Supabase REST HTTP ${res.statusCode}`;
                        const error = new Error(errMsg);
                        error.statusCode = res.statusCode;
                        error.details = parsedData;
                        reject(error);
                    }
                });
            });

            req.on('error', (err) => reject(err));
            req.setTimeout(10000, () => {
                req.destroy();
                reject(new Error('Timeout de 10s na requisição Supabase'));
            });

            if (payloadStr) req.write(payloadStr);
            req.end();
        });
    }

    // ─── 2. AUTENTICAÇÃO VIA SUPABASE AUTH (REST /auth/v1) ────────────────────

    async authRequest(endpoint, method = 'POST', body = null, token = null) {
        const fullUrl = `${this.url}/auth/v1/${endpoint.replace(/^\/+/, '')}`;
        const parsed = new URL(fullUrl);
        const apiKey = token || this.anonKey;
        const payloadStr = body ? JSON.stringify(body) : null;

        const options = {
            hostname: parsed.hostname,
            port: 443,
            path: parsed.pathname + parsed.search,
            method: method,
            headers: {
                'apikey': this.anonKey,
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            }
        };

        if (payloadStr) {
            options.headers['Content-Length'] = Buffer.byteLength(payloadStr);
        }

        return new Promise((resolve, reject) => {
            const req = https.request(options, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    let parsedData = null;
                    try {
                        parsedData = data ? JSON.parse(data) : null;
                    } catch (e) {
                        parsedData = data;
                    }

                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        resolve(parsedData);
                    } else {
                        const errMsg = (parsedData && (parsedData.msg || parsedData.message || parsedData.error_description || parsedData.error)) || `Auth HTTP ${res.statusCode}`;
                        const err = new Error(errMsg);
                        err.statusCode = res.statusCode;
                        err.details = parsedData;
                        reject(err);
                    }
                });
            });

            req.on('error', err => reject(err));
            req.setTimeout(10000, () => {
                req.destroy();
                reject(new Error('Timeout de 10s no Supabase Auth'));
            });

            if (payloadStr) req.write(payloadStr);
            req.end();
        });
    }

    // ─── 3. CRIPTOGRAFIA DE TOKENS META (AES-256-GCM) ─────────────────────────

    encryptToken(token) {
        if (!token) return null;
        const iv = crypto.randomBytes(12);
        const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(this.encryptionKey, 'hex'), iv);
        let encrypted = cipher.update(token, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        const authTag = cipher.getAuthTag().toString('hex');
        return `${iv.toString('hex')}:${authTag}:${encrypted}`;
    }

    decryptToken(encryptedPayload) {
        if (!encryptedPayload) return null;
        const parts = encryptedPayload.split(':');
        if (parts.length !== 3) return null;

        const [ivHex, authTagHex, encrypted] = parts;
        const decipher = crypto.createDecipheriv('aes-256-gcm', Buffer.from(this.encryptionKey, 'hex'), Buffer.from(ivHex, 'hex'));
        decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
        let decrypted = decipher.update(encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    }

    // ─── 4. GESTÃO MULTI-TENANT & AUTORIZAÇÃO (RBAC) ──────────────────────────

    /**
     * Valida se um usuário possui acesso a um determinado Workspace.
     * Retorna a role do usuário ou null se não autorizado (Fail-Closed).
     */
    async getUserWorkspaceMembership(userId, workspaceId) {
        if (!userId || !workspaceId) return null;
        try {
            const rows = await this.restRequest(`workspace_members?user_id=eq.${encodeURIComponent(userId)}&workspace_id=eq.${encodeURIComponent(workspaceId)}&select=id,role,workspace_id,workspaces(id,name,slug,owner_id)`);
            if (Array.isArray(rows) && rows.length > 0) {
                return rows[0];
            }
            return null;
        } catch (e) {
            console.error('[SupabaseGateway] Erro ao validar membership:', e.message);
            return null;
        }
    }

    /**
     * Retorna todos os workspaces aos quais o usuário pertence.
     */
    async listUserWorkspaces(userId) {
        if (!userId) return [];
        try {
            const rows = await this.restRequest(`workspace_members?user_id=eq.${encodeURIComponent(userId)}&select=role,workspaces(id,name,slug,owner_id,created_at)&order=created_at.desc`);
            if (!Array.isArray(rows)) return [];
            return rows.map(r => ({
                id: r.workspaces?.id,
                name: r.workspaces?.name,
                slug: r.workspaces?.slug,
                owner_id: r.workspaces?.owner_id,
                role: r.role
            })).filter(w => Boolean(w.id));
        } catch (e) {
            console.error('[SupabaseGateway] Erro ao listar workspaces:', e.message);
            return [];
        }
    }

    /**
     * Cria um novo Workspace para um usuário e atribui a role OWNER.
     */
    async createWorkspace(userId, name, slug = null) {
        if (!userId || !name) throw new Error('userId e name são obrigatórios.');

        const workspaceSlug = slug || name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').slice(0, 32);

        // 1. Cria workspace
        const wsRows = await this.restRequest('workspaces', 'POST', {
            name: name.trim(),
            slug: workspaceSlug,
            owner_id: userId
        });

        const workspace = Array.isArray(wsRows) ? wsRows[0] : wsRows;
        if (!workspace?.id) throw new Error('Falha ao instanciar workspace no banco.');

        // 2. Cria membership OWNER
        await this.restRequest('workspace_members', 'POST', {
            workspace_id: workspace.id,
            user_id: userId,
            role: 'OWNER'
        });

        return workspace;
    }

    /**
     * Registra log de auditoria no workspace.
     */
    async logAudit(workspaceId, userId, action, targetId = null, metadata = {}) {
        try {
            await this.restRequest('audit_logs', 'POST', {
                workspace_id: workspaceId,
                user_id: userId,
                action: action,
                target_id: targetId,
                metadata: metadata
            });
        } catch (e) {
            console.warn('[SupabaseGateway] Falha ao gravar audit log:', e.message);
        }
    }
}

module.exports = new SupabaseGateway();
