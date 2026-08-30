// ==============================================================================
// SITE INTELLIGENCE — STORAGE ADAPTER ISOLADO
// Fail-Open, File / Memory Storage, Isolado da Aplicação Comercial
// ==============================================================================

const fs = require('fs');
const path = require('path');

const LOCAL_STORAGE_DIR = path.join(__dirname, '../storage/si_storage');
const VERCEL_TMP_DIR = '/tmp/si_storage';
const MAX_SESSIONS = 1000;
const MAX_EVENTS = 10000;

class SIStorageAdapter {
    constructor() {
        this.memoryStore = new Map();
        this.storageDir = this.resolveStorageDir();
        this.ensureDirectory();
    }

    resolveStorageDir() {
        if (process.env.VERCEL) {
            return VERCEL_TMP_DIR;
        }
        return LOCAL_STORAGE_DIR;
    }

    ensureDirectory() {
        try {
            if (!fs.existsSync(this.storageDir)) {
                fs.mkdirSync(this.storageDir, { recursive: true });
            }
        } catch (e) {
            // Em Vercel/Serverless sem escrita em disco, fallback para /tmp
            if (this.storageDir !== VERCEL_TMP_DIR) {
                this.storageDir = VERCEL_TMP_DIR;
                try {
                    if (!fs.existsSync(this.storageDir)) {
                        fs.mkdirSync(this.storageDir, { recursive: true });
                    }
                } catch(err){}
            }
        }
    }

    getFilePath(collection) {
        return path.join(this.storageDir, `${collection}.json`);
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

    async getFilteredEvents(startDate = null, endDate = null, limit = 1000) {
        let events = await this.readCollection('events');
        
        if (startDate || endDate) {
            const start = startDate ? new Date(startDate + 'T00:00:00.000Z').getTime() : 0;
            const end = endDate ? new Date(endDate + 'T23:59:59.999Z').getTime() : Infinity;

            events = events.filter(e => {
                const t = new Date(e.timestamp || e.created_at).getTime();
                return t >= start && t <= end;
            });
        }

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

    async getSessions(limit = 200) {
        const sessions = await this.readCollection('sessions');
        return sessions.slice(-limit);
    }

    async getFilteredSessions(startDate = null, endDate = null, limit = 200) {
        let sessions = await this.readCollection('sessions');

        if (startDate || endDate) {
            const start = startDate ? new Date(startDate + 'T00:00:00.000Z').getTime() : 0;
            const end = endDate ? new Date(endDate + 'T23:59:59.999Z').getTime() : Infinity;

            sessions = sessions.filter(s => {
                const t = new Date(s.start_time || s.created_at || s.last_seen).getTime();
                return t >= start && t <= end;
            });
        }

        return sessions.slice(-limit);
    }

    async getLastEventInfo() {
        const events = await this.readCollection('events');
        if (events.length === 0) {
            return {
                has_events: false,
                last_event_timestamp: null,
                seconds_ago: null,
                status: 'AGUARDANDO_VISITANTES'
            };
        }

        const lastEvt = events[events.length - 1];
        const lastTime = new Date(lastEvt.timestamp || lastEvt.created_at).getTime();
        const now = Date.now();
        const diffSeconds = Math.max(0, Math.round((now - lastTime) / 1000));

        let status = 'RASTREAMENTO_ATIVO';
        if (diffSeconds > 3600) {
            status = 'DADOS_PARCIAIS';
        }

        return {
            has_events: true,
            last_event_timestamp: lastEvt.timestamp,
            last_event_type: lastEvt.event_type,
            seconds_ago: diffSeconds,
            status: status
        };
    }
}

module.exports = new SIStorageAdapter();
