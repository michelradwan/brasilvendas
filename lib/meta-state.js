// ==============================================================================
// RADWAN ADS — SERVER-SIDE PERSISTENT STATE & DISTRIBUTED GOVERNANCE (v7.5)
// Persistent Cloud Storage (KV/Upstash) ⟷ Local File • Fail-Closed Mutation Safety
// ==============================================================================

const fs = require('fs');
const path = require('path');
const { storage, lock, envAdapter } = require('./storage-adapter.js');

const STORAGE_DIR = path.join(__dirname, '..', 'storage');
const STATE_FILE = path.join(STORAGE_DIR, 'meta-state.json');

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
        this._initLocalSync();
    }

    _initLocalSync() {
        try {
            if (fs.existsSync(STATE_FILE)) {
                const data = fs.readFileSync(STATE_FILE, 'utf8');
                this.memoryFallback = { ...DEFAULT_STATE, ...JSON.parse(data) };
            }
        } catch (e) {}
    }

    readState() {
        try {
            if (fs.existsSync(STATE_FILE)) {
                const data = fs.readFileSync(STATE_FILE, 'utf8');
                return { ...DEFAULT_STATE, ...JSON.parse(data) };
            }
        } catch (e) {}
        return this.memoryFallback;
    }

    writeState(newState) {
        this.memoryFallback = newState;
        try {
            fs.writeFileSync(STATE_FILE, JSON.stringify(newState, null, 2), 'utf8');
        } catch (e) {}
    }

    // ─── 1. FAIL-CLOSED MUTATION GOVERNANCE ─────────────────────────────────────

    /**
     * Valida se o ambiente e o storage estão seguros para permitir mutações reais na Meta.
     * Retorna { allowed: false } se o Kill Switch estiver ativo ou se o storage persistente falhar.
     */
    async isMutationAllowed() {
        // 1. Emergency Stop Check
        const stopped = await this.isEmergencyStoppedAsync();
        if (stopped) {
            return { allowed: false, reason: 'EMERGENCY_STOP_ACTIVE', code: 403 };
        }

        // 2. Storage Health Fail-Closed Check
        if (!envAdapter.isAvailableForMutations()) {
            return { allowed: false, reason: 'STORAGE_UNAVAILABLE_FAIL_CLOSED', code: 503 };
        }

        return { allowed: true };
    }

    // ─── 2. DISTRIBUTED LOCK COM TTL ───────────────────────────────────────────

    async acquireLock(adAccountId, ttlSeconds = 300) {
        return lock.acquire(`lock:ad_account:${adAccountId}`, 'autopilot_worker', ttlSeconds);
    }

    async releaseLock(adAccountId) {
        return lock.release(`lock:ad_account:${adAccountId}`, 'autopilot_worker');
    }

    // ─── 3. IDEMPOTÊNCIA PERSISTENTE ───────────────────────────────────────────

    async checkIdempotency(actionId) {
        if (!actionId) return { isDuplicate: false };
        
        // 1. Tenta ler do storage persistente
        const remote = await storage.get('idempotency', actionId);
        if (remote) {
            return { isDuplicate: true, cachedResult: remote.result, executedAt: remote.executedAt };
        }

        // 2. Fallback local em memória
        const state = this.readState();
        const local = state.idempotency_keys[actionId];
        if (local) {
            return { isDuplicate: true, cachedResult: local.result, executedAt: local.executedAt };
        }

        return { isDuplicate: false };
    }

    async recordIdempotency(actionId, result) {
        if (!actionId) return;
        const payload = {
            executedAt: new Date().toISOString(),
            result: result
        };

        // Salva no storage persistente com TTL de 7 dias
        await storage.set('idempotency', actionId, payload, 7 * 86400);

        // Salva cópia no buffer local
        const state = this.readState();
        state.idempotency_keys[actionId] = payload;
        const keys = Object.keys(state.idempotency_keys);
        if (keys.length > 500) delete state.idempotency_keys[keys[0]];
        this.writeState(state);
    }

    // ─── 4. COOLDOWN PERSISTENTE DE ESCALA (12H) ──────────────────────────────

    async isUnderCooldown(campaignId, cooldownHours = 12) {
        const requiredMs = cooldownHours * 3600 * 1000;
        let lastChange = await storage.get('cooldowns', campaignId);

        if (!lastChange) {
            const state = this.readState();
            lastChange = state.cooldowns[campaignId];
        }

        if (!lastChange) return { underCooldown: false };

        const elapsedMs = Date.now() - Number(lastChange);
        if (elapsedMs < requiredMs) {
            const remainingHours = ((requiredMs - elapsedMs) / (3600 * 1000)).toFixed(1);
            return {
                underCooldown: true,
                remainingHours: remainingHours,
                lastChange: new Date(Number(lastChange)).toISOString()
            };
        }
        return { underCooldown: false };
    }

    async setCooldown(campaignId) {
        const now = Date.now();
        await storage.set('cooldowns', campaignId, now, 24 * 3600);
        const state = this.readState();
        state.cooldowns[campaignId] = now;
        this.writeState(state);
    }

    // ─── 5. EMERGENCY STOP (KILL SWITCH) PERSISTENTE ────────────────────────────

    async isEmergencyStoppedAsync() {
        const remote = await storage.get('meta_state', 'emergency_stop');
        if (remote !== null && remote !== undefined) {
            return remote === true || remote === 'true';
        }
        return this.isEmergencyStopped();
    }

    isEmergencyStopped() {
        const state = this.readState();
        return state.emergency_stop === true;
    }

    async setEmergencyStop(enabled) {
        const boolVal = !!enabled;
        await storage.set('meta_state', 'emergency_stop', boolVal);
        const state = this.readState();
        state.emergency_stop = boolVal;
        this.writeState(state);
    }

    // ─── 6. UNIT ECONOMICS VERIFICATION FLAG ────────────────────────────────────

    async isUnitEconomicsVerified() {
        const remote = await storage.get('meta_state', 'unit_economics_verified');
        if (remote !== null && remote !== undefined) {
            return remote === true || remote === 'true';
        }
        const state = this.readState();
        return state.unit_economics_verified === true;
    }

    async setUnitEconomicsVerified(verified) {
        const boolVal = !!verified;
        await storage.set('meta_state', 'unit_economics_verified', boolVal);
        const state = this.readState();
        state.unit_economics_verified = boolVal;
        this.writeState(state);
    }

    // ─── 7. SNAPSHOTS PERSISTENTES PARA ROLLBACK DE MUTAÇÃO ─────────────────────

    async saveSnapshot(campaignId, snapshotData) {
        const payload = {
            timestamp: Date.now(),
            data: snapshotData
        };
        await storage.set('snapshots', campaignId, payload, 30 * 86400); // 30 dias de retenção
        const state = this.readState();
        state.snapshots[campaignId] = payload;
        this.writeState(state);
    }

    async getSnapshot(campaignId) {
        const remote = await storage.get('snapshots', campaignId);
        if (remote) return remote;
        const state = this.readState();
        return state.snapshots[campaignId] || null;
    }

    async clearSnapshot(campaignId) {
        await storage.delete('snapshots', campaignId);
        const state = this.readState();
        delete state.snapshots[campaignId];
        this.writeState(state);
    }
}

module.exports = new ServerStateManager();
