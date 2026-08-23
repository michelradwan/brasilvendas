// ==============================================================================
// META DATA PROVIDER & GRAPH API ADAPTER (v20.0)
// ==============================================================================

class MetaDataProvider {
    constructor() {
        this.cache = new Map();
        this.cacheTTL = 30000; // 30 segundos de cache para leituras
        this.proxyEndpoint = '/api/meta-proxy';
        this.isProxyAvailable = null;
        this.concurrencyQueue = [];
        this.isProcessingQueue = false;
        this.maxConcurrent = 4;
        this.rateLimitBackoffMs = 0;
    }

    getStoredCredentials() {
        const token = localStorage.getItem('meta_access_token') || '';
        let actId = localStorage.getItem('meta_ad_account_id') || 'act_846780837970771';
        if (actId && !actId.startsWith('act_')) {
            actId = 'act_' + actId;
        }
        return { token, adAccountId: actId };
    }

    setCredentials(token, actId) {
        if (actId && !actId.startsWith('act_')) {
            actId = 'act_' + actId;
        }
        localStorage.setItem('meta_access_token', token);
        localStorage.setItem('meta_ad_account_id', actId);
        this.cache.clear();
    }

    clearCredentials() {
        localStorage.removeItem('meta_access_token');
        localStorage.removeItem('meta_ad_account_id');
        this.cache.clear();
    }

    async testProxyConnectivity() {
        if (this.isProxyAvailable !== null) return this.isProxyAvailable;
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 3000);
            const res = await fetch(`${this.proxyEndpoint}?endpoint=me&fields=id`, {
                method: 'GET',
                signal: controller.signal
            });
            clearTimeout(timeoutId);
            this.isProxyAvailable = res.status !== 404 && res.status !== 502;
        } catch (e) {
            this.isProxyAvailable = false;
        }
        return this.isProxyAvailable;
    }

    classifyError(err) {
        if (!err) return 'UNKNOWN';
        const code = err.code || err.status;
        const msg = (err.message || '').toLowerCase();

        if (code === 190 || msg.includes('token') || msg.includes('session expired') || code === 401) {
            return 'AUTH_EXPIRED';
        }
        if (code === 200 || msg.includes('permission') || msg.includes('access_denied') || code === 403) {
            return 'PERMISSION_DENIED';
        }
        if (code === 17 || code === 4 || code === 613 || code === 429 || msg.includes('rate limit')) {
            return 'RATE_LIMIT';
        }
        if (msg.includes('network') || msg.includes('failed to fetch') || msg.includes('timeout')) {
            return 'NETWORK_ERROR';
        }
        if (msg.includes('policy') || msg.includes('disapproved') || msg.includes('restricted')) {
            return 'META_POLICY';
        }
        return 'VALIDATION_ERROR';
    }

    async request(endpoint, method = 'GET', params = {}, payload = null, bypassCache = false) {
        endpoint = endpoint.replace(/^\/+/, '');
        const cacheKey = `${method}:${endpoint}:${JSON.stringify(params)}`;

        if (method === 'GET' && !bypassCache && this.cache.has(cacheKey)) {
            const cached = this.cache.get(cacheKey);
            if (Date.now() - cached.timestamp < this.cacheTTL) {
                return cached.data;
            }
        }

        const { token } = this.getStoredCredentials();
        const useProxy = await this.testProxyConnectivity();

        let responseData = null;

        try {
            if (useProxy) {
                if (method === 'GET') {
                    const q = new URLSearchParams({ endpoint, ...params, token }).toString();
                    const res = await fetch(`${this.proxyEndpoint}?${q}`, { method: 'GET' });
                    responseData = await res.json();
                } else {
                    const res = await fetch(this.proxyEndpoint, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ endpoint, method, params, payload, token })
                    });
                    responseData = await res.json();
                }
            } else {
                // Fallback direto via cliente para a Graph API com CORS nativo
                const q = new URLSearchParams({ ...params, access_token: token }).toString();
                const url = `https://graph.facebook.com/v20.0/${endpoint}?${q}`;

                const options = {
                    method: method,
                    headers: { 'Accept': 'application/json' }
                };

                if (payload && (method === 'POST' || method === 'PUT')) {
                    options.headers['Content-Type'] = 'application/json';
                    options.body = JSON.stringify(payload);
                }

                const res = await fetch(url, options);
                responseData = await res.json();
            }

            if (responseData && responseData.error) {
                const errorType = this.classifyError(responseData.error);
                throw {
                    ...responseData.error,
                    classifiedType: errorType
                };
            }

            if (method === 'GET') {
                this.cache.set(cacheKey, { timestamp: Date.now(), data: responseData });
            } else {
                // Ações de escrita invalidam o cache relacionado
                this.cache.clear();
            }

            return responseData;

        } catch (err) {
            console.error('[MetaDataProvider Error]', err);
            throw err;
        }
    }

    // Buscar Informações da Conta
    async getAccountInfo(adAccountId) {
        return this.request(adAccountId, 'GET', {
            fields: 'id,name,account_status,currency,timezone_name,amount_spent,balance,business_name'
        });
    }

    // Buscar Campanhas com paginação segura
    async getCampaigns(adAccountId, limit = 50) {
        return this.request(`${adAccountId}/campaigns`, 'GET', {
            fields: 'id,name,status,objective,buying_type,daily_budget,lifetime_budget,created_time,updated_time,special_ad_categories',
            limit: limit
        });
    }

    // Buscar Conjuntos de Anúncios (AdSets) de uma Campanha
    async getAdSets(campaignId) {
        return this.request(`${campaignId}/adsets`, 'GET', {
            fields: 'id,name,status,daily_budget,lifetime_budget,optimization_goal,billing_event,bid_strategy,targeting,learning_stage_info'
        });
    }

    // Buscar Anúncios (Ads) de um Conjunto
    async getAds(adSetId) {
        return this.request(`${adSetId}/ads`, 'GET', {
            fields: 'id,name,status,creative{id,name,title,body,image_url,thumbnail_url},created_time'
        });
    }

    // Buscar Insights (com suporte a date_preset: today, yesterday, last_7d, last_30d)
    async getInsights(objectId, datePreset = 'today') {
        return this.request(`${objectId}/insights`, 'GET', {
            fields: 'spend,impressions,clicks,cpc,cpm,ctr,frequency,actions,action_values,cost_per_action_type',
            date_preset: datePreset
        });
    }

    // Buscar Insights por Posicionamento (Placements)
    async getPlacementInsights(objectId, datePreset = 'last_7d') {
        return this.request(`${objectId}/insights`, 'GET', {
            fields: 'spend,clicks,cpc,ctr,actions',
            breakdowns: 'publisher_platform,platform_position',
            date_preset: datePreset
        });
    }

    // Buscar Insights por Dispositivo
    async getDeviceInsights(objectId, datePreset = 'last_7d') {
        return this.request(`${objectId}/insights`, 'GET', {
            fields: 'spend,clicks,cpc,ctr,actions',
            breakdowns: 'impression_device',
            date_preset: datePreset
        });
    }

    // Operação de Escrita: Atualizar Status
    async updateStatus(objectId, newStatus) {
        return this.request(objectId, 'POST', {}, { status: newStatus });
    }

    // Operação de Escrita: Atualizar Orçamento Diário (em centavos)
    async updateBudget(objectId, budgetField, newAmountCents) {
        return this.request(objectId, 'POST', {}, { [budgetField]: newAmountCents });
    }

    // Operação de Escrita: Renomear Objeto
    async renameObject(objectId, newName) {
        return this.request(objectId, 'POST', {}, { name: newName });
    }

    // Operação de Escrita: Duplicar Campanha
    async duplicateCampaign(adAccountId, campaignData, newName) {
        const payload = {
            name: newName,
            buying_type: campaignData.buying_type || 'AUCTION',
            objective: campaignData.objective || 'OUTCOME_SALES',
            status: 'PAUSED'
        };
        if (campaignData.special_ad_categories) {
            payload.special_ad_categories = campaignData.special_ad_categories;
        }
        return this.request(`${adAccountId}/campaigns`, 'POST', {}, payload);
    }
}

// Instância Singleton
window.metaAdapter = new MetaDataProvider();
