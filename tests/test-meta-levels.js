const http = require('http');

async function testFetch(endpoint, params = {}) {
    const q = new URLSearchParams({ endpoint, ...params }).toString();
    return new Promise((resolve, reject) => {
        http.get(`http://localhost:3333/api/meta-proxy?${q}`, {
            headers: { 'X-Admin-Auth': process.env.ADMIN_PASSWORD || 'test-suite-admin-secret-2026' }
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve({ status: res.statusCode, data: JSON.parse(data) });
                } catch(e) {
                    resolve({ status: res.statusCode, raw: data });
                }
            });
        }).on('error', err => reject(err));
    });
}

async function run() {
    console.log('Testing Meta Proxy with date_preset: maximum / last_90d...');

    // 1. Account-level insights with level=campaign
    const campInsightsMax = await testFetch('act_846780837970771/insights', {
        level: 'campaign',
        date_preset: 'maximum',
        fields: 'campaign_id,campaign_name,spend,impressions,clicks,actions,action_values'
    });
    console.log(`\n[CAMPAIGN INSIGHTS (MAXIMUM)] Count: ${campInsightsMax.data?.data?.length || 0}`);
    if (campInsightsMax.data?.data) console.log(campInsightsMax.data.data);

    // 2. Account-level insights with level=adset
    const adsetInsightsMax = await testFetch('act_846780837970771/insights', {
        level: 'adset',
        date_preset: 'maximum',
        fields: 'adset_id,adset_name,campaign_id,spend,impressions,clicks,actions,action_values'
    });
    console.log(`\n[ADSET INSIGHTS (MAXIMUM)] Count: ${adsetInsightsMax.data?.data?.length || 0}`);
    if (adsetInsightsMax.data?.data) console.log(adsetInsightsMax.data.data);

    // 3. Account-level insights with level=ad
    const adInsightsMax = await testFetch('act_846780837970771/insights', {
        level: 'ad',
        date_preset: 'maximum',
        fields: 'ad_id,ad_name,adset_id,campaign_id,spend,impressions,clicks,actions,action_values'
    });
    console.log(`\n[AD INSIGHTS (MAXIMUM)] Count: ${adInsightsMax.data?.data?.length || 0}`);
    if (adInsightsMax.data?.data) console.log(adInsightsMax.data.data);

    // 4. Test individual adset insight: 120250857847080751/insights
    const singleAdSetInsight = await testFetch('120250857847080751/insights', {
        date_preset: 'maximum',
        fields: 'spend,impressions,clicks,actions,action_values'
    });
    console.log(`\n[SINGLE ADSET INSIGHT 120250857847080751] Count: ${singleAdSetInsight.data?.data?.length || 0}`);
    if (singleAdSetInsight.data?.data) console.log(singleAdSetInsight.data.data);

    // 5. Test individual ad insight: 120250828972250751/insights
    const singleAdInsight = await testFetch('120250828972250751/insights', {
        date_preset: 'maximum',
        fields: 'spend,impressions,clicks,actions,action_values'
    });
    console.log(`\n[SINGLE AD INSIGHT 120250828972250751] Count: ${singleAdInsight.data?.data?.length || 0}`);
    if (singleAdInsight.data?.data) console.log(singleAdInsight.data.data);
}

run().catch(console.error);
