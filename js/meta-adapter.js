// ==============================================================================
// META DATA PROVIDER (SECURE FRONTEND ADAPTER)
// Zero Privileged Tokens in Browser • Server-Side Proxy Only
// ==============================================================================

class MetaDataProvider {
    constructor() {
        this.cache = new Map();
        this.proxyEndpoint = (typeof window !== 'undefined' && window.location.protocol === 'file:') ? 'https://brasilvendas.vercel.app/api/meta-proxy' : '/api/meta-proxy';
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
            const headers = {
                'Content-Type': 'application/json',
                'X-Admin-Auth': this.adminPassword
            };

            const customToken = localStorage.getItem('meta_user_token');
            if (customToken) {
                headers['X-Meta-Token'] = customToken;
            }

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
                    params.after = res.data.paging.cursors.after;
                } else {
                    break;
                }
            } else {
                break;
            }
        } while (all.length < 5000);

        return { data: all };
    }

    // Buscar Conjuntos de Anúncios
    async getAdSets(campaignId) {
        return this.request(`${campaignId}/adsets`, 'GET', {
            fields: 'id,name,status,daily_budget,lifetime_budget,optimization_goal,bid_strategy'
        });
    }

    // Buscar Anúncios
    async getAds(adSetId) {
        return this.request(`${adSetId}/ads`, 'GET', {
            fields: 'id,name,status,creative{id,name,title,body,image_url,thumbnail_url}'
        });
    }

    // Buscar Insights
    async getInsights(objectId, datePreset = 'today') {
        return this.request(`${objectId}/insights`, 'GET', {
            fields: 'spend,impressions,clicks,cpc,cpm,ctr,frequency,actions,action_values',
            date_preset: datePreset
        });
    }

    // Mutação de Status
    async updateStatus(objectId, newStatus, actionId = null) {
        return this.request(objectId, 'POST', {}, { status: newStatus }, true, actionId);
    }

    // Mutação de Orçamento
    async updateBudget(objectId, budgetField, newAmountCents, actionId = null) {
        return this.request(objectId, 'POST', {}, { [budgetField]: newAmountCents }, true, actionId);
    }
}

// Instância Singleton
window.metaAdapter = new MetaDataProvider();
