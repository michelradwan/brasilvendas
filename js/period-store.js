// ==============================================================================
// RADWAN ADS — PERIOD STORE & DATE INTELLIGENCE ENGINE
// Timezone-Aware • Comparison Mode • Local Overrides • URL Sync
// ==============================================================================

class PeriodStore {
    constructor() {
        this.timezone = 'America/Sao_Paulo';
        this.globalPreset = 'today';
        this.globalRange = this.calculatePresetDates('today');
        this.comparisonMode = false;
        this.sectionOverrides = new Map(); // sectionId -> { preset, range }
        this.listeners = [];

        this.initFromUrl();
    }

    // Obter data formatada 'YYYY-MM-DD' na timezone correta (America/Sao_Paulo)
    getTodayDateString(offsetDays = 0) {
        const now = new Date();
        if (offsetDays !== 0) {
            now.setDate(now.getDate() + offsetDays);
        }
        // Usar Intl para extrair ano, mês e dia no fuso de São Paulo
        const formatter = new Intl.DateTimeFormat('en-CA', {
            timeZone: this.timezone,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        });
        return formatter.format(now);
    }

    // Calcula as datas inicial e final para cada preset
    calculatePresetDates(preset) {
        const todayStr = this.getTodayDateString(0);
        const [y, m, d] = todayStr.split('-').map(Number);
        const todayDate = new Date(Date.UTC(y, m - 1, d));

        const formatDateObj = (dt) => {
            const yyyy = dt.getUTCFullYear();
            const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
            const dd = String(dt.getUTCDate()).padStart(2, '0');
            return `${yyyy}-${mm}-${dd}`;
        };

        const subtractDays = (numDays) => {
            const target = new Date(todayDate);
            target.setUTCDate(target.getUTCDate() - numDays);
            return formatDateObj(target);
        };

        switch (preset) {
            case 'today':
                return { since: todayStr, until: todayStr, preset: 'today', label: 'Hoje' };
            case 'yesterday': {
                const yest = subtractDays(1);
                return { since: yest, until: yest, preset: 'yesterday', label: 'Ontem' };
            }
            case 'last_3d':
                return { since: subtractDays(2), until: todayStr, preset: 'last_3d', label: 'Últimos 3 dias' };
            case 'last_7d':
                return { since: subtractDays(6), until: todayStr, preset: 'last_7d', label: 'Últimos 7 dias' };
            case 'last_14d':
                return { since: subtractDays(13), until: todayStr, preset: 'last_14d', label: 'Últimos 14 dias' };
            case 'last_30d':
                return { since: subtractDays(29), until: todayStr, preset: 'last_30d', label: 'Últimos 30 dias' };
            case 'last_90d':
                return { since: subtractDays(89), until: todayStr, preset: 'last_90d', label: 'Últimos 90 dias' };
            case 'this_month': {
                const firstDayStr = `${y}-${String(m).padStart(2, '0')}-01`;
                return { since: firstDayStr, until: todayStr, preset: 'this_month', label: 'Este mês' };
            }
            case 'last_month': {
                const prevMonthDate = new Date(Date.UTC(y, m - 2, 1));
                const py = prevMonthDate.getUTCFullYear();
                const pm = prevMonthDate.getUTCMonth() + 1;
                const lastDayOfPrevMonth = new Date(Date.UTC(py, pm, 0)).getUTCDate();
                const since = `${py}-${String(pm).padStart(2, '0')}-01`;
                const until = `${py}-${String(pm).padStart(2, '0')}-${String(lastDayOfPrevMonth).padStart(2, '0')}`;
                return { since, until, preset: 'last_month', label: 'Mês passado' };
            }
            default:
                return { since: todayStr, until: todayStr, preset: 'today', label: 'Hoje' };
        }
    }

    // Calcula o período anterior equivalente para cálculo de variação (+12%, -8%)
    calculatePreviousPeriod(sinceStr, untilStr) {
        const sinceDate = new Date(`${sinceStr}T00:00:00.000Z`);
        const untilDate = new Date(`${untilStr}T00:00:00.000Z`);
        
        const diffMs = untilDate.getTime() - sinceDate.getTime();
        const durationDays = Math.round(diffMs / (1000 * 60 * 60 * 24)) + 1;

        const prevUntilDate = new Date(sinceDate);
        prevUntilDate.setUTCDate(prevUntilDate.getUTCDate() - 1);

        const prevSinceDate = new Date(prevUntilDate);
        prevSinceDate.setUTCDate(prevSinceDate.getUTCDate() - (durationDays - 1));

        const fmt = (d) => {
            const y = d.getUTCFullYear();
            const m = String(d.getUTCMonth() + 1).padStart(2, '0');
            const day = String(d.getUTCDate()).padStart(2, '0');
            return `${y}-${m}-${day}`;
        };

        return {
            since: fmt(prevSinceDate),
            until: fmt(prevUntilDate),
            durationDays
        };
    }

    // Retorna o período efetivo para uma seção (respeitando override local ou período global)
    getEffectivePeriod(sectionId = null) {
        if (sectionId && this.sectionOverrides.has(sectionId)) {
            const override = this.sectionOverrides.get(sectionId);
            return {
                ...override.range,
                isOverride: true,
                sectionId
            };
        }

        return {
            ...this.globalRange,
            isOverride: false,
            sectionId: null
        };
    }

    // Altera o preset global
    setGlobalPreset(preset) {
        this.globalPreset = preset;
        this.globalRange = this.calculatePresetDates(preset);
        this.syncToUrl();
        this.notify();
    }

    // Define intervalo customizado global
    setGlobalCustomRange(sinceStr, untilStr) {
        if (!sinceStr || !untilStr) return;
        if (sinceStr > untilStr) {
            const temp = sinceStr;
            sinceStr = untilStr;
            untilStr = temp;
        }

        this.globalPreset = 'custom';
        this.globalRange = {
            since: sinceStr,
            until: untilStr,
            preset: 'custom',
            label: `${this.formatDisplayDate(sinceStr)} – ${this.formatDisplayDate(untilStr)}`
        };
        this.syncToUrl();
        this.notify();
    }

    // Ativa ou desativa o modo de comparação
    toggleComparisonMode(enabled = null) {
        this.comparisonMode = (enabled !== null) ? enabled : !this.comparisonMode;
        this.notify();
    }

    // Define override para uma seção específica (ex.: criativos 30d)
    setSectionOverride(sectionId, preset, customSince = null, customUntil = null) {
        let range;
        if (preset === 'custom' && customSince && customUntil) {
            range = {
                since: customSince,
                until: customUntil,
                preset: 'custom',
                label: `${this.formatDisplayDate(customSince)} – ${this.formatDisplayDate(customUntil)}`
            };
        } else {
            range = this.calculatePresetDates(preset);
        }

        this.sectionOverrides.set(sectionId, { preset, range });
        this.notify();
    }

    // Remove override e volta ao período global
    clearSectionOverride(sectionId) {
        this.sectionOverrides.delete(sectionId);
        this.notify();
    }

    // Formata 'YYYY-MM-DD' para 'DD/MM/YYYY'
    formatDisplayDate(dateStr) {
        if (!dateStr) return '';
        const [y, m, d] = dateStr.split('-');
        return `${d}/${m}/${y}`;
    }

    // Sincroniza estado de data na URL
    syncToUrl() {
        try {
            const url = new URL(window.location.href);
            if (this.globalPreset === 'custom') {
                url.searchParams.set('from', this.globalRange.since);
                url.searchParams.set('to', this.globalRange.until);
                url.searchParams.delete('preset');
            } else {
                url.searchParams.set('preset', this.globalPreset);
                url.searchParams.delete('from');
                url.searchParams.delete('to');
            }
            window.history.replaceState({}, '', url.toString());
        } catch(e) {}
    }

    // Inicializa a partir dos parâmetros de URL
    initFromUrl() {
        try {
            const params = new URLSearchParams(window.location.search);
            const presetParam = params.get('preset');
            const fromParam = params.get('from');
            const toParam = params.get('to');

            if (fromParam && toParam) {
                this.setGlobalCustomRange(fromParam, toParam);
            } else if (presetParam) {
                this.setGlobalPreset(presetParam);
            }
        } catch(e) {}
    }

    subscribe(fn) {
        this.listeners.push(fn);
        return () => {
            this.listeners = this.listeners.filter(l => l !== fn);
        };
    }

    notify() {
        this.listeners.forEach(fn => {
            try { fn(this); } catch(e) { console.error('[PeriodStore Error]', e); }
        });
    }
}

// Instância Singleton
window.periodStore = new PeriodStore();
