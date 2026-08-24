// ==============================================================================
// ENTERPRISE META MARKETING API CLIENT (v20.0)
// Exponential Backoff + Jitter • Full Pagination • Zero Token Leaks
// ==============================================================================

const https = require('https');
const { META_GRAPH_VERSION, META_GRAPH_BASE_URL, RATE_LIMIT_ERROR_CODES, ALLOWED_AD_ACCOUNT_ID } = require('../config/meta-constants.js');

class MetaApiClient {
    constructor() {
        this.baseUrl = META_GRAPH_BASE_URL;
        this.version = META_GRAPH_VERSION;
    }

    getToken() {
        const token = process.env.META_ACCESS_TOKEN;
        if (!token) {
            throw new Error('CONFIGURATION_ERROR: META_ACCESS_TOKEN não está definido no ambiente do servidor.');
        }
        return token;
    }

    async request(endpoint, method = 'GET', params = {}, payload = null, maxRetries = 3) {
        const token = this.getToken();
        const cleanEndpoint = endpoint.replace(/^\/+/, '');
        const queryParams = new URLSearchParams({ ...params, access_token: token }).toString();
        const urlStr = `${this.baseUrl}/${cleanEndpoint}?${queryParams}`;
        const parsedUrl = new URL(urlStr);

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            const requestId = `REQ_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
            
            try {
                const options = {
                    hostname: parsedUrl.hostname,
                    path: parsedUrl.pathname + parsedUrl.search,
                    method: method,
                    headers: {
                        'Accept': 'application/json',
                        'User-Agent': 'MetaAdsEnterpriseClient/2.0'
                    }
                };

                let bodyData = null;
                if (payload && (method === 'POST' || method === 'PUT')) {
                    bodyData = JSON.stringify(payload);
                    options.headers['Content-Type'] = 'application/json';
                    options.headers['Content-Length'] = Buffer.byteLength(bodyData);
                }

                const response = await new Promise((resolve, reject) => {
                    const req = https.request(options, (res) => {
                        let data = '';
                        res.on('data', chunk => data += chunk);
                        res.on('end', () => {
                            try {
                                resolve({ statusCode: res.statusCode, data: JSON.parse(data), requestId });
                            } catch (e) {
                                resolve({ statusCode: res.statusCode, data: { raw: data }, requestId });
                            }
                        });
                    });

                    req.on('error', err => reject(err));
                    req.setTimeout(25000, () => {
                        req.destroy();
                        reject(new Error(`[${requestId}] Timeout de 25s na comunicação com Graph API`));
                    });

                    if (bodyData) req.write(bodyData);
                    req.end();
                });

                // Se houver erro de Rate Limit ou 5xx
                if (response.data && response.data.error) {
                    const errCode = response.data.error.code;
                    if (RATE_LIMIT_ERROR_CODES.includes(errCode) || response.statusCode >= 500) {
                        if (attempt < maxRetries) {
                            const jitter = Math.floor(Math.random() * 500);
                            const backoffMs = Math.pow(2, attempt) * 1000 + jitter;
                            await new Promise(r => setTimeout(r, backoffMs));
                            continue;
                        }
                    }
                    throw response.data.error;
                }

                return response.data;

            } catch (err) {
                if (attempt === maxRetries) {
                    throw err;
                }
                const backoffMs = Math.pow(2, attempt) * 1000;
                await new Promise(r => setTimeout(r, backoffMs));
            }
        }
    }

    // Leitura Paginada Completa (Sem limite artificial de 250 objetos)
    async fetchAllPages(endpoint, params = {}, maxLimit = 5000) {
        let results = [];
        let currentParams = { ...params, limit: params.limit || 50 };

        do {
            const res = await this.request(endpoint, 'GET', currentParams);
            if (res && res.data && Array.isArray(res.data)) {
                results = results.concat(res.data);
                if (res.paging && res.paging.cursors && res.paging.cursors.after && res.data.length === currentParams.limit) {
                    currentParams.after = res.data.paging.cursors.after;
                } else {
                    break;
                }
            } else {
                break;
            }
        } while (results.length < maxLimit);

        return results;
    }

    // Atalhos Tipados de Leitura
    async getAccount(adAccountId = ALLOWED_AD_ACCOUNT_ID) {
        return this.request(adAccountId, 'GET', {
            fields: 'id,name,account_status,currency,timezone_name,amount_spent,balance,business_name'
        });
    }

    async getCampaigns(adAccountId = ALLOWED_AD_ACCOUNT_ID) {
        return this.fetchAllPages(`${adAccountId}/campaigns`, {
            fields: 'id,name,status,objective,buying_type,daily_budget,lifetime_budget,created_time,updated_time,special_ad_categories'
        });
    }

    async getAdSets(campaignId) {
        return this.fetchAllPages(`${campaignId}/adsets`, {
            fields: 'id,name,status,daily_budget,lifetime_budget,optimization_goal,bid_strategy'
        });
    }

    async getAds(adSetId) {
        return this.fetchAllPages(`${adSetId}/ads`, {
            fields: 'id,name,status,creative{id,name,title,body,image_url,thumbnail_url}'
        });
    }

    async getInsights(objectId, datePreset = 'today') {
        const res = await this.request(`${objectId}/insights`, 'GET', {
            fields: 'spend,impressions,clicks,cpc,cpm,ctr,frequency,actions,action_values',
            date_preset: datePreset
        });
        return (res && res.data && res.data[0]) ? res.data[0] : null;
    }
}

module.exports = new MetaApiClient();
