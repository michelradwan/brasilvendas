// ==============================================================================
// SITE INTELLIGENCE — STORAGE ADAPTER ISOLADO
// Fail-Open, File / Memory Storage, Isolado da Aplicação Comercial
// ==============================================================================

const fs = require('fs');
const path = require('path');

const STORAGE_DIR = process.env.VERCEL ? '/tmp/si_storage' : path.join(__dirname, '../storage/si_storage');
const MAX_SESSIONS = 500;
const MAX_EVENTS = 5000;

class SIStorageAdapter {
    constructor() {
        this.memoryStore = new Map();
        this.ensureDirectory();
    }

    ensureDirectory() {
        try {
            if (!fs.existsSync(STORAGE_DIR)) {
                fs.mkdirSync(STORAGE_DIR, { recursive: true });
            }
        } catch (e) {
            // Em Vercel/Serverless sem escrita em disco, fallback automático para memoryStore
        }
    }

    getFilePath(collection) {
        return path.join(STORAGE_DIR, `${collection}.json`);
    }

    async readCollection(collection) {
        try {
            const filePath = this.getFilePath(collection);
            if (fs.existsSync(filePath)) {
                const data = fs.readFileSync(filePath, 'utf8');
                return JSON.parse(data);
            }
        } catch (e) {
            // Fail-open
        }
        return this.memoryStore.get(collection) || [];
    }

    async writeCollection(collection, data) {
        // Manter limite de tamanho
        const maxLimit = collection === 'sessions' ? MAX_SESSIONS : MAX_EVENTS;
        const cappedData = Array.isArray(data) ? data.slice(-maxLimit) : data;

        this.memoryStore.set(collection, cappedData);

        try {
            this.ensureDirectory();
            const filePath = this.getFilePath(collection);
            fs.writeFileSync(filePath, JSON.stringify(cappedData, null, 2), 'utf8');
        } catch (e) {
            // Memory fallback silencioso
        }
    }

    async appendEvents(events) {
        if (!Array.isArray(events) || events.length === 0) return;
        const current = await this.readCollection('events');
        const updated = current.concat(events);
        await this.writeCollection('events', updated);
    }

    async getEvents(limit = 1000) {
        const events = await this.readCollection('events');
        return events.slice(-limit);
    }

    async saveSession(session) {
        const sessions = await this.readCollection('sessions');
        const existingIdx = sessions.findIndex(s => s.session_id === session.session_id);
        if (existingIdx >= 0) {
            sessions[existingIdx] = Object.assign({}, sessions[existingIdx], session, { updated_at: new Date().toISOString() });
        } else {
            sessions.push(Object.assign({}, session, { created_at: new Date().toISOString(), updated_at: new Date().toISOString() }));
        }
        await this.writeCollection('sessions', sessions);
    }

    async getSessions(limit = 100) {
        const sessions = await this.readCollection('sessions');
        return sessions.slice(-limit);
    }
}

module.exports = new SIStorageAdapter();
