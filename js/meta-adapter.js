// ==============================================================================
// META DATA PROVIDER (SECURE FRONTEND ADAPTER)
// Zero Privileged Tokens in Browser • Server-Side Proxy Only
// ==============================================================================

class MetaDataProvider {
    constructor() {
        this.cache = new Map();
        this.proxyEndpoint = (typeof window !== 'undefined' && window.location?.protocol === 'file:') ? 'https://brasilvendas.vercel.app/api/meta-proxy' : '/api/meta-proxy';
        this.adminPassword = typeof sessionStorage !== 'undefined' ? (sessionStorage.getItem('meta_admin_token') || localStorage.getItem('meta_admin_token') || 'mraa2004') : 'mraa2004';
    }

    setAdminPassword(password) {
        this.adminPassword = password;
        sessionStorage.setItem('meta_admin_token', password);
        localStorage.setItem('meta_admin_token', password);
        this.cache.clear();
    }

    clearAdminSession() {
        this.adminPassword = '';
        sessionStorage.removeItem('meta_admin_token');
        localStorage.removeItem('meta_admin_token');
        this.cache.clear();
    }

    isAuthenticated() {
        return !!this.adminPassword;
    }

    async request(endpoint, method = 'GET', params = {}, payload = null, bypassCache = false, actionId = null) {
        endpoint = endpoint.replace(/^\/+/, '');
        const cacheKey = `${method}:${endpoint}:${JSON.stringify(params)}`;

        if (method === 'GET' && !bypassCache && this.cache.has(cacheKey)) {
            const cached = this.cache.get(cacheKey);
            if (Date.now() - cached.timestamp < this.cacheTTL) {
                return cached.data;
            }
        }

        let responseData = null;

        try {
            // Limpa tokens antigos legados do localStorage para usar sempre o backend seguro
            if (typeof localStorage !== 'undefined' && localStorage.getItem('meta_user_token')) {
                localStorage.removeItem('meta_user_token');
            }

            const headers = {
                'Content-Type': 'application/json',
                'X-Admin-Auth': this.adminPassword
            };

            if (method === 'GET') {
                const q = new URLSearchParams({ endpoint, ...params }).toString();
                const res = await fetch(`${this.proxyEndpoint}?${q}`, {
                    method: 'GET',
                    headers: headers
                });
                responseData = await res.json();
            } else {
                const res = await fetch(this.proxyEndpoint, {
                    method: 'POST',
                    headers: headers,
                    body: JSON.stringify({
                        endpoint,
                        method,
                        params,
                        payload,
                        action_id: actionId
                    })
                });
                responseData = await res.json();
            }

            if (responseData && responseData.error) {
                throw responseData.error;
            }

            if (method === 'GET') {
                this.cache.set(cacheKey, { timestamp: Date.now(), data: responseData });
            } else {
                this.cache.clear();
            }

            return responseData;

        } catch (err) {
            console.error('[MetaDataProvider Exception]', err);
            throw err;
        }
    }

    // Buscar Informações da Conta
    async getAccountInfo() {
        return this.request('act_846780837970771', 'GET', {
            fields: 'id,name,account_status,currency,timezone_name,amount_spent,balance,business_name'
        });
    }

    // Paginação Completa de Campanhas
    async getCampaigns(limit = 50) {
        let all = [];
        let params = {
            fields: 'id,name,status,objective,buying_type,daily_budget,lifetime_budget,created_time,updated_time',
            limit: limit
        };

        do {
            const res = await this.request('act_846780837970771/campaigns', 'GET', params);
            if (res && res.data) {
                all = all.concat(res.data);
                if (res.paging && res.paging.cursors && res.paging.cursors.after && res.data.length === limit) {
                    params.after = res.paging.cursors.after;
                } else {
                    break;
                }
            } else {
                break;
            }
        } while (all.length < 5000);

        return { data: all };
    }

    // Buscar Conjuntos de Anúncios (Nível de Campanha ou Toda a Conta)
    async getAdSets(campaignId = null, limit = 50) {
        const endpoint = campaignId ? `${campaignId}/adsets` : 'act_846780837970771/adsets';
        let all = [];
        let params = {
            fields: 'id,name,status,effective_status,campaign_id,daily_budget,lifetime_budget,optimization_goal,bid_strategy,created_time',
            limit: limit
        };

        do {
            const res = await this.request(endpoint, 'GET', params);
            if (res && res.data) {
                all = all.concat(res.data);
                if (res.paging && res.paging.cursors && res.paging.cursors.after && res.data.length === limit) {
                    params.after = res.paging.cursors.after;
                } else {
                    break;
                }
            } else {
                break;
            }
        } while (all.length < 5000);

        return { data: all };
    }

    // Buscar Anúncios (Nível de Conjunto/Campanha ou Toda a Conta)
    async getAds(adSetId = null, limit = 50) {
        const endpoint = adSetId ? `${adSetId}/ads` : 'act_846780837970771/ads';
        let all = [];
        let params = {
            fields: 'id,name,status,effective_status,campaign_id,adset_id,creative{id,name,title,body,image_url,thumbnail_url},created_time',
            limit: limit
        };

        do {
            const res = await this.request(endpoint, 'GET', params);
            if (res && res.data) {
                all = all.concat(res.data);
                if (res.paging && res.paging.cursors && res.paging.cursors.after && res.data.length === limit) {
                    params.after = res.paging.cursors.after;
                } else {
                    break;
                }
            } else {
                break;
            }
        } while (all.length < 5000);

        return { data: all };
    }

    // Buscar Insights por Objeto Individual (Campanha, Conjunto ou Anúncio)
    async getInsights(objectId, periodParam = 'today', customFields = null) {
        const defaultFields = [
            'spend',
            'impressions',
            'reach',
            'clicks',
            'cpc',
            'cpm',
            'ctr',
            'frequency',
            'inline_link_clicks',
            'inline_link_click_ctr',
            'cost_per_inline_link_click',
            'actions',
            'action_values',
            'video_30_sec_watched_actions',
            'video_thruplay_watched_actions',
            'video_p25_watched_actions',
            'video_p50_watched_actions',
            'video_p75_watched_actions',
            'video_p100_watched_actions'
        ].join(',');

        const params = {
            fields: customFields || defaultFields
        };

        if (typeof periodParam === 'object' && periodParam !== null && periodParam.since && periodParam.until) {
            params.time_range = JSON.stringify({
                since: periodParam.since,
                until: periodParam.until
            });
        } else if (typeof periodParam === 'string' && periodParam.startsWith('{')) {
            params.time_range = periodParam;
        } else {
            params.date_preset = periodParam || 'today';
        }

        return this.request(`${objectId}/insights`, 'GET', params);
    }

    // Buscar Insights da Conta Inteira Agrupados por Nível (level: 'campaign' | 'adset' | 'ad')
    async getAccountLevelInsights(level = 'campaign', periodParam = 'today', limit = 100) {
        let levelFields = 'spend,impressions,reach,clicks,cpc,cpm,ctr,frequency,inline_link_clicks,inline_link_click_ctr,cost_per_inline_link_click,actions,action_values';
        if (level === 'campaign') {
            levelFields = `campaign_id,campaign_name,${levelFields}`;
        } else if (level === 'adset') {
            levelFields = `adset_id,adset_name,campaign_id,${levelFields}`;
        } else if (level === 'ad') {
            levelFields = `ad_id,ad_name,adset_id,campaign_id,${levelFields}`;
        }

        const params = {
            level: level,
            fields: levelFields,
            limit: limit
        };

        if (typeof periodParam === 'object' && periodParam !== null && periodParam.since && periodParam.until) {
            params.time_range = JSON.stringify({
                since: periodParam.since,
                until: periodParam.until
            });
        } else if (typeof periodParam === 'string' && periodParam.startsWith('{')) {
            params.time_range = periodParam;
        } else {
            params.date_preset = periodParam || 'today';
        }

        let all = [];
        do {
            const res = await this.request('act_846780837970771/insights', 'GET', params);
            if (res && res.data) {
                all = all.concat(res.data);
                if (res.paging && res.paging.cursors && res.paging.cursors.after && res.data.length === limit) {
                    params.after = res.paging.cursors.after;
                } else {
                    break;
                }
            } else {
                break;
            }
        } while (all.length < 5000);

        return { data: all };
    }

    // Mutação de Status
    async updateStatus(objectId, newStatus, actionId = null) {
        return this.request(objectId, 'POST', {}, { status: newStatus }, true, actionId);
    }

    // Mutação de Orçamento
    async updateBudget(objectId, budgetField, newAmountCents, actionId = null) {
        return this.request(objectId, 'POST', {}, { [budgetField]: newAmountCents }, true, actionId);
    }

    // Mutação de Nome da Campanha (Renomeação Oficial na Meta)
    async updateName(objectId, newName, actionId = null) {
        return this.request(objectId, 'POST', {}, { name: newName }, true, actionId);
    }
}

// Instância Singleton
window.metaAdapter = new MetaDataProvider();
