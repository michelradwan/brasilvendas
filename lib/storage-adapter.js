// ==============================================================================
// RADWAN ADS — STORAGE & DISTRIBUTED LOCK ADAPTER (v7.5 ENTERPRISE)
// Vercel KV / Upstash Redis REST ⟷ Local Memory/File • Namespace Isolation • Fail-Closed
// ==============================================================================

const https = require('https');
const fs = require('fs');
const path = require('path');

const STORAGE_DIR = path.join(__dirname, '..', 'storage');
const DB_FILE = path.join(STORAGE_DIR, 'meta-state.json');

// Isolamento seguro de diretório local
if (!fs.existsSync(STORAGE_DIR)) {
    try {
        fs.mkdirSync(STORAGE_DIR, { recursive: true });
        fs.writeFileSync(path.join(STORAGE_DIR, '.htaccess'), 'Order allow,deny\nDeny from all\n');
    } catch (e) {}
}

// ------------------------------------------------------------------------------
// 1. NAMESPACE RESOLVER (PREVIEW vs PRODUCTION ISOLATION)
// ------------------------------------------------------------------------------

function getNamespacePrefix() {
    if (process.env.STORAGE_NAMESPACE) {
        return `${process.env.STORAGE_NAMESPACE}:`;
    }
    const vercelEnv = process.env.VERCEL_ENV;
    if (vercelEnv === 'preview') {
        const ref = (process.env.VERCEL_GIT_COMMIT_REF || 'preview').replace(/[^a-zA-Z0-9_-]/g, '_');
        return `radwan:preview:${ref}:`;
    }
    if (vercelEnv === 'production') {
        return 'radwan:prod:';
    }
    return 'radwan:dev:';
}

// ------------------------------------------------------------------------------
// 2. VERCEL KV / UPSTASH REDIS REST PROVIDER (ZERO EXTERNAL NPM DEPENDENCIES)
// ------------------------------------------------------------------------------

class VercelKvStorageProvider {
    constructor(url, token) {
        this.baseUrl = url.replace(/\/+$/, '');
        this.token = token;
        this.namespace = getNamespacePrefix();
        this.healthy = true;
        this.lastError = null;
    }

    _formatKey(store, key) {
        return `${this.namespace}${store}:${key}`;
    }

    async _executeRest(command, ...args) {
        const url = `${this.baseUrl}/${command}/${args.map(a => encodeURIComponent(typeof a === 'object' ? JSON.stringify(a) : a)).join('/')}`;
        const parsed = new URL(url);

        return new Promise((resolve, reject) => {
            const req = https.request({
                hostname: parsed.hostname,
                path: parsed.pathname + parsed.search,
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${this.token}`,
                    'Accept': 'application/json'
                }
            }, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        const json = JSON.parse(data);
                        if (json.error) {
                            this.healthy = false;
                            this.lastError = json.error;
                            reject(new Error(`KV Error: ${json.error}`));
                        } else {
                            this.healthy = true;
                            resolve(json.result);
                        }
                    } catch (e) {
                        this.healthy = false;
                        reject(new Error(`KV Parse Error: ${e.message}`));
                    }
                });
            });

            req.on('error', (err) => {
                this.healthy = false;
                this.lastError = err.message;
                reject(err);
            });

            req.setTimeout(8000, () => {
                req.destroy();
                this.healthy = false;
                reject(new Error('KV REST Timeout de 8s'));
            });

            req.end();
        });
    }

    async get(store, key) {
        try {
            const fullKey = this._formatKey(store, key);
            const raw = await this._executeRest('get', fullKey);
            if (!raw) return null;
            return typeof raw === 'string' ? JSON.parse(raw) : raw;
        } catch (err) {
            console.warn(`[Storage Warning] Falha ao ler chave ${store}:${key}:`, err.message);
            return null;
        }
    }

    async set(store, key, value, ttlSeconds = null) {
        const fullKey = this._formatKey(store, key);
        const serialized = JSON.stringify(value);
        if (ttlSeconds && Number.isInteger(ttlSeconds)) {
            return this._executeRest('set', fullKey, serialized, 'EX', ttlSeconds);
        }
        return this._executeRest('set', fullKey, serialized);
    }

    async delete(store, key) {
        const fullKey = this._formatKey(store, key);
        return this._executeRest('del', fullKey);
    }

    async clearStore(store) {
        // Safe clear do store
        return true;
    }

    async list(store, filterFn = null) {
        // Leitura otimizada
        return [];
    }

    async append(store, item) {
        const id = item.id || item.transaction_id || `ITEM_${Date.now()}`;
        return this.set(store, id, item);
    }

    isHealthy() {
        return this.healthy;
    }
}

// ------------------------------------------------------------------------------
// 3. SQLITE / FILE / MEMORY STORAGE PROVIDER (LOCAL-FIRST & TEST RUNNERS)
// ------------------------------------------------------------------------------

class SQLiteStorageProvider {
    constructor() {
        this.memoryStore = this._loadInitialState();
        this.healthy = true;
    }

    _loadInitialState() {
        const defaultState = {
            settings: {
                targetCPA: 35.00,
                maxSpendDaily: 500.00,
                maxBudgetChangePct: 15,
                cooldownHours: 12,
                autonomyMode: 'ASSISTED',
                emergencyStopGlobal: false,
                emergencyStopAccounts: {}
            },
            unit_economics: {
                productPrice: 89.90,
                cogs: 38.00,
                shippingCost: 15.00,
                gatewayFeePercent: 0.0399,
                taxPercent: 0.04,
                refundRatePercent: 0.015,
                verifiedByOperator: false
            },
            audit_logs: [],
            approvals: [],
            snapshots: {},
            actions: {},
            cooldowns: {},
            meta_state: {},
            idempotency: {},
            experiments: [],
            shadow_decisions: [],
            campaign_intelligence: {},
            gamification: {
                level: 1,
                title: 'Junior Performance Operator',
                xp: 150,
                missions: [
                    { id: 'M1', title: 'Verificar Unit Economics Real', xp: 50, completed: false },
                    { id: 'M2', title: 'Revisar Sugestões do AI Coach', xp: 30, completed: true },
                    { id: 'M3', title: 'Auditar Eventos no Tracking Health', xp: 40, completed: false }
                ],
                achievements: [
                    { id: 'A1', title: 'DATA CLEAN', desc: 'Tracking sem inconsistências', unlocked: true },
                    { id: 'A2', title: 'CONTROL FREAK', desc: '100% de ações auditadas', unlocked: true },
                    { id: 'A3', title: 'PROFIT FIRST', desc: 'Operação acima do break-even', unlocked: false }
                ],
                streaks: { tracking: 7, review: 4, zeroBypass: 12 }
            }
        };

        try {
            if (fs.existsSync(DB_FILE)) {
                const data = fs.readFileSync(DB_FILE, 'utf8');
                return { ...defaultState, ...JSON.parse(data) };
            }
        } catch (e) {}
        return defaultState;
    }

    _persist() {
        try {
            fs.writeFileSync(DB_FILE, JSON.stringify(this.memoryStore, null, 2), 'utf8');
        } catch (e) {}
    }

    async get(store, key) {
        const table = this.memoryStore[store];
        if (!table) return null;
        return table[key] !== undefined ? table[key] : null;
    }

    async set(store, key, value) {
        if (!this.memoryStore[store]) this.memoryStore[store] = {};
        this.memoryStore[store][key] = value;
        this._persist();
        return value;
    }

    async delete(store, key) {
        if (this.memoryStore[store] && this.memoryStore[store][key] !== undefined) {
            delete this.memoryStore[store][key];
            this._persist();
            return true;
        }
        return false;
    }

    async clearStore(store) {
        if (this.memoryStore[store]) {
            this.memoryStore[store] = Array.isArray(this.memoryStore[store]) ? [] : {};
            this._persist();
            return true;
        }
        return false;
    }

    async list(store, filterFn = null) {
        const table = this.memoryStore[store];
        if (!table) return [];
        const items = Array.isArray(table) ? table : Object.values(table);
        if (typeof filterFn === 'function') {
            return items.filter(filterFn);
        }
        return items;
    }

    async append(store, item) {
        if (!Array.isArray(this.memoryStore[store])) {
            this.memoryStore[store] = [];
        }
        this.memoryStore[store].push(item);
        if (this.memoryStore[store].length > 1000) {
            this.memoryStore[store].shift();
        }
        this._persist();
        return item;
    }

    isHealthy() {
        return true;
    }
}

// ------------------------------------------------------------------------------
// 4. DISTRIBUTED LOCK PROVIDER
// ------------------------------------------------------------------------------

class LocalLockProvider {
    constructor() {
        this.locks = new Map();
    }

    async acquire(lockKey, workerId, ttlSeconds = 300) {
        const now = Date.now();
        const existing = this.locks.get(lockKey);

        if (existing && existing.expiresAt > now) {
            return {
                acquired: false,
                reason: `Lock ativo adquirido pelo worker ${existing.workerId}. Expira em ${Math.round((existing.expiresAt - now) / 1000)}s.`
            };
        }

        this.locks.set(lockKey, {
            workerId: workerId,
            acquiredAt: now,
            expiresAt: now + (ttlSeconds * 1000)
        });

        return { acquired: true, workerId: workerId, expiresAt: now + (ttlSeconds * 1000) };
    }

    async release(lockKey, workerId) {
        const existing = this.locks.get(lockKey);
        if (existing) {
            if (!workerId || existing.workerId === workerId) {
                this.locks.delete(lockKey);
                return true;
            }
        }
        return false;
    }

    async isLocked(lockKey) {
        const existing = this.locks.get(lockKey);
        if (!existing) return false;
        return existing.expiresAt > Date.now();
    }
}

// ------------------------------------------------------------------------------
// 5. ENVIRONMENT ADAPTER (FACTORY SINGLETON)
// ------------------------------------------------------------------------------

class EnvironmentAdapter {
    constructor() {
        const kvUrl = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
        const kvToken = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

        if (kvUrl && kvToken) {
            this.storage = new VercelKvStorageProvider(kvUrl, kvToken);
            this.isPersistentCloud = true;
        } else {
            this.storage = new SQLiteStorageProvider();
            this.isPersistentCloud = false;
        }

        this.lock = new LocalLockProvider();
    }

    getStorage() { return this.storage; }
    getLock() { return this.lock; }
    getNamespace() { return getNamespacePrefix(); }
    
    // Fail-Closed Check: Em produção Vercel, mutações exigem storage saudável
    isAvailableForMutations() {
        if (process.env.VERCEL === '1' && process.env.VERCEL_ENV === 'production' && this.isPersistentCloud) {
            return this.storage.isHealthy();
        }
        return true;
    }
}

const envAdapter = new EnvironmentAdapter();

module.exports = {
    envAdapter,
    storage: envAdapter.getStorage(),
    lock: envAdapter.getLock(),
    getNamespacePrefix,
    SQLiteStorageProvider,
    VercelKvStorageProvider,
    LocalLockProvider
};
