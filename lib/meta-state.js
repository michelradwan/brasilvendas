// ==============================================================================
// SERVER-SIDE PERSISTENT STATE & DISTRIBUTED LOCK MANAGER
// ==============================================================================

const fs = require('fs');
const path = require('path');

const STORAGE_DIR = path.join(__dirname, '..', 'storage');
const STATE_FILE = path.join(STORAGE_DIR, 'meta-state.json');

// Inicialização segura do diretório de armazenamento
if (!fs.existsSync(STORAGE_DIR)) {
    try {
        fs.mkdirSync(STORAGE_DIR, { recursive: true });
        fs.writeFileSync(path.join(STORAGE_DIR, '.htaccess'), 'Order allow,deny\nDeny from all\n');
    } catch(e){}
}

const DEFAULT_STATE = {
    locks: {},
    cooldowns: {},
    emergency_stop: false,
    unit_economics_verified: false,
    idempotency_keys: {},
    snapshots: {},
    approvals: [],
    audit_logs: [],
    shadow_decisions: []
};

class ServerStateManager {
    constructor() {
        this.memoryFallback = { ...DEFAULT_STATE };
    }

    readState() {
        try {
            if (fs.existsSync(STATE_FILE)) {
                const data = fs.readFileSync(STATE_FILE, 'utf8');
                return { ...DEFAULT_STATE, ...JSON.parse(data) };
            }
        } catch (e) {
            // Em ambientes serverless read-only, usa memoryFallback
        }
        return this.memoryFallback;
    }

    writeState(newState) {
        this.memoryFallback = newState;
        try {
            fs.writeFileSync(STATE_FILE, JSON.stringify(newState, null, 2), 'utf8');
        } catch (e) {
            // Fallback para memória em runtime serverless sem fs write
        }
    }

    // 1. Distributed Lock por Conta de Anúncios com TTL
    acquireLock(adAccountId, ttlSeconds = 300) {
        const state = this.readState();
        const now = Date.now();
        const existingLock = state.locks[adAccountId];

        if (existingLock && existingLock.expiresAt > now) {
            return {
                acquired: false,
                reason: `Lock ativo adquirido em ${new Date(existingLock.acquiredAt).toLocaleTimeString('pt-BR')}. Expira em ${Math.round((existingLock.expiresAt - now) / 1000)}s.`
            };
        }

        state.locks[adAccountId] = {
            acquiredAt: now,
            expiresAt: now + (ttlSeconds * 1000)
        };
        this.writeState(state);
        return { acquired: true };
    }

    releaseLock(adAccountId) {
        const state = this.readState();
        delete state.locks[adAccountId];
        this.writeState(state);
    }

    // 2. Idempotência Server-Side
    checkIdempotency(actionId) {
        if (!actionId) return { isDuplicate: false };
        const state = this.readState();
        const record = state.idempotency_keys[actionId];
        if (record) {
            return { isDuplicate: true, cachedResult: record.result, executedAt: record.executedAt };
        }
        return { isDuplicate: false };
    }

    recordIdempotency(actionId, result) {
        if (!actionId) return;
        const state = this.readState();
        state.idempotency_keys[actionId] = {
            executedAt: new Date().toISOString(),
            result: result
        };
        // Mantém as últimas 500 chaves de idempotência
        const keys = Object.keys(state.idempotency_keys);
        if (keys.length > 500) {
            delete state.idempotency_keys[keys[0]];
        }
        this.writeState(state);
    }

    // 3. Cooldown Server-Side
    isUnderCooldown(campaignId, cooldownHours = 12) {
        const state = this.readState();
        const lastChange = state.cooldowns[campaignId];
        if (!lastChange) return { underCooldown: false };

        const elapsedMs = Date.now() - lastChange;
        const requiredMs = cooldownHours * 3600 * 1000;

        if (elapsedMs < requiredMs) {
            const remainingHours = ((requiredMs - elapsedMs) / (3600 * 1000)).toFixed(1);
            return {
                underCooldown: true,
                remainingHours: remainingHours,
                lastChange: new Date(lastChange).toISOString()
            };
        }
        return { underCooldown: false };
    }

    setCooldown(campaignId) {
        const state = this.readState();
        state.cooldowns[campaignId] = Date.now();
        this.writeState(state);
    }

    // 4. Emergency Stop Server-Side
    isEmergencyStopped() {
        const state = this.readState();
        return state.emergency_stop === true;
    }

    setEmergencyStop(enabled) {
        const state = this.readState();
        state.emergency_stop = !!enabled;
        this.writeState(state);
    }

    // 5. Unit Economics Verification Flag
    isUnitEconomicsVerified() {
        const state = this.readState();
        return state.unit_economics_verified === true;
    }

    setUnitEconomicsVerified(verified) {
        const state = this.readState();
        state.unit_economics_verified = !!verified;
        this.writeState(state);
    }

    // 6. Snapshots Persistentes para Rollback
    saveSnapshot(campaignId, snapshotData) {
        const state = this.readState();
        state.snapshots[campaignId] = {
            timestamp: Date.now(),
            data: snapshotData
        };
        this.writeState(state);
    }

    getSnapshot(campaignId) {
        const state = this.readState();
        return state.snapshots[campaignId] || null;
    }

    clearSnapshot(campaignId) {
        const state = this.readState();
        delete state.snapshots[campaignId];
        this.writeState(state);
    }
}

module.exports = new ServerStateManager();
