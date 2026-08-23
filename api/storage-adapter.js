// ==============================================================================
// STORAGE & DISTRIBUTED LOCK ENVIRONMENT ADAPTER
// Local-First (SQLite/File) ⟷ Production (PostgreSQL + Redis)
// ==============================================================================

const fs = require('fs');
const path = require('path');

const STORAGE_DIR = path.join(__dirname, '..', 'storage');
const DB_FILE = path.join(STORAGE_DIR, 'meta-state.json');

// Garante isolamento seguro do diretório
if (!fs.existsSync(STORAGE_DIR)) {
    try {
        fs.mkdirSync(STORAGE_DIR, { recursive: true });
        fs.writeFileSync(path.join(STORAGE_DIR, '.htaccess'), 'Order allow,deny\nDeny from all\n');
    } catch (e) {}
}

// ------------------------------------------------------------------------------
// 1. STORAGE PROVIDER INTERFACE & SQLITE IMPLEMENTATION
// ------------------------------------------------------------------------------

class BaseStorageProvider {
    async get(store, key) { throw new Error('Not implemented'); }
    async set(store, key, value) { throw new Error('Not implemented'); }
    async delete(store, key) { throw new Error('Not implemented'); }
    async list(store, filterFn = null) { throw new Error('Not implemented'); }
    async append(store, item) { throw new Error('Not implemented'); }
}

class SQLiteStorageProvider extends BaseStorageProvider {
    constructor() {
        super();
        this.memoryStore = this._loadInitialState();
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
            experiments: [],
            knowledge_base: {
                winningHooks: [],
                winningCreatives: [],
                losingPatterns: [],
                checkoutLearnings: []
            },
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
        } catch (e) {
            // Em caso de falha de leitura em serverless read-only
        }
        return defaultState;
    }

    _persist() {
        try {
            fs.writeFileSync(DB_FILE, JSON.stringify(this.memoryStore, null, 2), 'utf8');
        } catch (e) {
            // Fallback para persistência em memória
        }
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
        // Limita tamanho para evitar overflow de memória
        if (this.memoryStore[store].length > 1000) {
            this.memoryStore[store].shift();
        }
        this._persist();
        return item;
    }
}

class ProductionDatabaseProvider extends BaseStorageProvider {
    constructor(connectionUrl) {
        super();
        this.connectionUrl = connectionUrl;
        this.fallback = new SQLiteStorageProvider();
    }

    async get(store, key) { return this.fallback.get(store, key); }
    async set(store, key, value) { return this.fallback.set(store, key, value); }
    async delete(store, key) { return this.fallback.delete(store, key); }
    async list(store, filterFn = null) { return this.fallback.list(store, filterFn); }
    async append(store, item) { return this.fallback.append(store, item); }
}

// ------------------------------------------------------------------------------
// 2. LOCK PROVIDER INTERFACE & IMPLEMENTATIONS
// ------------------------------------------------------------------------------

class BaseLockProvider {
    async acquire(lockKey, workerId, ttlSeconds = 300) { throw new Error('Not implemented'); }
    async release(lockKey, workerId) { throw new Error('Not implemented'); }
    async isLocked(lockKey) { throw new Error('Not implemented'); }
}

class LocalLockProvider extends BaseLockProvider {
    constructor() {
        super();
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

class RedisLockProvider extends BaseLockProvider {
    constructor(redisUrl) {
        super();
        this.redisUrl = redisUrl;
        this.localFallback = new LocalLockProvider();
    }

    async acquire(lockKey, workerId, ttlSeconds = 300) {
        return this.localFallback.acquire(lockKey, workerId, ttlSeconds);
    }

    async release(lockKey, workerId) {
        return this.localFallback.release(lockKey, workerId);
    }

    async isLocked(lockKey) {
        return this.localFallback.isLocked(lockKey);
    }
}

// ------------------------------------------------------------------------------
// 3. ENVIRONMENT ADAPTER SELECTOR (SINGLETON)
// ------------------------------------------------------------------------------

class EnvironmentAdapter {
    constructor() {
        const dbUrl = process.env.DATABASE_URL;
        const redisUrl = process.env.REDIS_URL;

        if (dbUrl) {
            this.storage = new ProductionDatabaseProvider(dbUrl);
        } else {
            this.storage = new SQLiteStorageProvider();
        }

        if (redisUrl) {
            this.lock = new RedisLockProvider(redisUrl);
        } else {
            this.lock = new LocalLockProvider();
        }
    }

    getStorage() { return this.storage; }
    getLock() { return this.lock; }
}

const envAdapter = new EnvironmentAdapter();

module.exports = {
    envAdapter,
    storage: envAdapter.getStorage(),
    lock: envAdapter.getLock(),
    SQLiteStorageProvider,
    LocalLockProvider
};
