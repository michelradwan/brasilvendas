const http = require('http');
const fs = require('fs');
const path = require('path');
const assert = require('assert');

// 1. Helper HTTP
async function proxyRequest(endpoint, params = {}) {
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

async function runTests() {
    console.log('═══════════════════════════════════════════════════════════════════════');
    console.log('🧪 TEST SUITE: RADWAN ADS — CAMPAIGNS / ADSETS / ADS FULL STACK');
    console.log('═══════════════════════════════════════════════════════════════════════\n');

    let passed = 0;
    let failed = 0;

    function test(desc, fn) {
        try {
            fn();
            console.log(`  ✅ [PASS] ${desc}`);
            passed++;
        } catch (err) {
            console.error(`  ❌ [FAIL] ${desc}`);
            console.error(`     Error: ${err.message}`);
            failed++;
        }
    }

    async function testAsync(desc, fn) {
        try {
            await fn();
            console.log(`  ✅ [PASS] ${desc}`);
            passed++;
        } catch (err) {
            console.error(`  ❌ [FAIL] ${desc}`);
            console.error(`     Error: ${err.message}`);
            failed++;
        }
    }

    // --- TEST 1: BACKEND ENDPOINTS ALLOWLIST & PROXY ---
    await testAsync('Meta Proxy: Busca entidades de Campanhas', async () => {
        const res = await proxyRequest('act_846780837970771/campaigns', { fields: 'id,name,status,daily_budget' });
        assert.strictEqual(res.status, 200);
        assert.ok(Array.isArray(res.data?.data), 'Deveria retornar array data');
        assert.ok(res.data.data.length > 0, 'Deveria conter campanhas reais');
    });

    await testAsync('Meta Proxy: Busca entidades de Conjuntos (AdSets)', async () => {
        const res = await proxyRequest('act_846780837970771/adsets', { fields: 'id,name,status,campaign_id,daily_budget' });
        assert.strictEqual(res.status, 200);
        assert.ok(Array.isArray(res.data?.data), 'Deveria retornar array data');
        assert.ok(res.data.data.length > 0, 'Deveria conter conjuntos reais');
        assert.ok(res.data.data[0].campaign_id, 'Conjunto deve conter campaign_id para o join');
    });

    await testAsync('Meta Proxy: Busca entidades de Anúncios (Ads)', async () => {
        const res = await proxyRequest('act_846780837970771/ads', { fields: 'id,name,status,campaign_id,adset_id,creative' });
        assert.strictEqual(res.status, 200);
        assert.ok(Array.isArray(res.data?.data), 'Deveria retornar array data');
        assert.ok(res.data.data.length > 0, 'Deveria conter anúncios reais');
        assert.ok(res.data.data[0].campaign_id, 'Anúncio deve conter campaign_id');
        assert.ok(res.data.data[0].adset_id, 'Anúncio deve conter adset_id para o join');
    });

    // --- TEST 2: LEVEL-AWARE INSIGHTS ---
    await testAsync('Meta Proxy: Insights agrupados por level=campaign', async () => {
        const res = await proxyRequest('act_846780837970771/insights', {
            level: 'campaign',
            date_preset: 'maximum',
            fields: 'campaign_id,campaign_name,spend,impressions,clicks,actions,action_values'
        });
        assert.strictEqual(res.status, 200);
        assert.ok(Array.isArray(res.data?.data), 'Deveria retornar array');
        if (res.data.data.length > 0) {
            assert.ok(res.data.data[0].campaign_id, 'Insight de campanha deve ter campaign_id');
            assert.ok(res.data.data[0].spend !== undefined, 'Deve conter spend');
        }
    });

    await testAsync('Meta Proxy: Insights agrupados por level=adset', async () => {
        const res = await proxyRequest('act_846780837970771/insights', {
            level: 'adset',
            date_preset: 'maximum',
            fields: 'adset_id,adset_name,campaign_id,spend,impressions,clicks,actions,action_values'
        });
        assert.strictEqual(res.status, 200);
        assert.ok(Array.isArray(res.data?.data), 'Deveria retornar array');
        if (res.data.data.length > 0) {
            assert.ok(res.data.data[0].adset_id, 'Insight de conjunto deve ter adset_id');
            assert.ok(res.data.data[0].campaign_id, 'Insight de conjunto deve ter campaign_id');
            assert.ok(res.data.data[0].spend !== undefined, 'Deve conter spend real');
        }
    });

    await testAsync('Meta Proxy: Insights agrupados por level=ad', async () => {
        const res = await proxyRequest('act_846780837970771/insights', {
            level: 'ad',
            date_preset: 'maximum',
            fields: 'ad_id,ad_name,adset_id,campaign_id,spend,impressions,clicks,actions,action_values'
        });
        assert.strictEqual(res.status, 200);
        assert.ok(Array.isArray(res.data?.data), 'Deveria retornar array');
        if (res.data.data.length > 0) {
            assert.ok(res.data.data[0].ad_id, 'Insight de anúncio deve ter ad_id');
            assert.ok(res.data.data[0].adset_id, 'Insight de anúncio deve ter adset_id');
            assert.ok(res.data.data[0].spend !== undefined, 'Deve conter spend real');
        }
    });

    // --- TEST 3: STATIC HTML & DOM STRUCTURE ---
    test('DOM: admin-ads.html possui a barra de abas unificada de Campanhas', () => {
        const html = fs.readFileSync(path.join(__dirname, '../admin-ads.html'), 'utf8');
        assert.ok(html.includes('id="tab-nav-campaigns"'), 'Deve conter tab Campanhas');
        assert.ok(html.includes('id="tab-nav-adsets"'), 'Deve conter tab Conjuntos');
        assert.ok(html.includes('id="tab-nav-ads"'), 'Deve conter tab Anúncios');
        assert.ok(html.includes('id="tab-count-campaigns"'), 'Deve conter badge de count de campanhas');
        assert.ok(html.includes('id="tab-count-adsets"'), 'Deve conter badge de count de adsets');
        assert.ok(html.includes('id="tab-count-ads"'), 'Deve conter badge de count de ads');
    });

    test('DOM: admin-ads.html possui as 3 subviews integradas dentro de view-campaigns', () => {
        const html = fs.readFileSync(path.join(__dirname, '../admin-ads.html'), 'utf8');
        assert.ok(html.includes('id="campaigns-subview-campaigns"'), 'Deve conter subview campanhas');
        assert.ok(html.includes('id="campaigns-subview-adsets"'), 'Deve conter subview adsets');
        assert.ok(html.includes('id="campaigns-subview-ads"'), 'Deve conter subview ads');
    });

    test('DOM: Sidebar não contém itens redundantes e mantém Criativos independente', () => {
        const html = fs.readFileSync(path.join(__dirname, '../admin-ads.html'), 'utf8');
        assert.ok(html.includes('data-nav-target="campaigns"'), 'Sidebar deve ter Campanhas');
        assert.ok(html.includes('data-nav-target="creatives"'), 'Sidebar deve ter Criativos independente');
        assert.ok(!html.includes('data-nav-target="adsets"'), 'Sidebar não deve ter AdSets redundante');
        assert.ok(!html.includes('data-nav-target="ads"'), 'Sidebar não deve ter Ads redundante');
    });

    // --- TEST 4: JAVASCRIPT ENGINE & ADAPTER INTEGRITY ---
    test('JS: meta-adapter.js possui getAccountLevelInsights para os 3 níveis', () => {
        const js = fs.readFileSync(path.join(__dirname, '../js/meta-adapter.js'), 'utf8');
        assert.ok(js.includes('getAccountLevelInsights'), 'Deve exportar getAccountLevelInsights');
        assert.ok(js.includes("level === 'adset'"), 'Deve tratar adset');
        assert.ok(js.includes("level === 'ad'"), 'Deve tratar ad');
    });

    test('JS: dashboard.js sincroniza insights por nível sem divisão artificial de dados', () => {
        const js = fs.readFileSync(path.join(__dirname, '../js/dashboard.js'), 'utf8');
        assert.ok(js.includes("getAccountLevelInsights('campaign'"), 'Sync deve buscar campanhas por nível');
        assert.ok(js.includes("getAccountLevelInsights('adset'"), 'Sync deve buscar adsets por nível');
        assert.ok(js.includes("getAccountLevelInsights('ad'"), 'Sync deve buscar ads por nível');
        assert.ok(js.includes('this.cachedAdSetInsights.set('), 'Deve mapear adsets por ID');
        assert.ok(js.includes('this.cachedAdInsights.set('), 'Deve mapear ads por ID');
        assert.ok(!js.includes('parentIns.spend || 0) / numSiblings'), 'Divisão artificial por numSiblings erradicada!');
    });

    test('JS: dashboard.js suporta navegação por switchCampaignTab', () => {
        const js = fs.readFileSync(path.join(__dirname, '../js/dashboard.js'), 'utf8');
        assert.ok(js.includes('switchCampaignTab('), 'Deve definir switchCampaignTab');
        assert.ok(js.includes('tab-nav-${t}'), 'Deve alternar botões');
        assert.ok(js.includes('campaigns-subview-${t}'), 'Deve alternar subviews');
    });

    console.log(`\n═══════════════════════════════════════════════════════════════════════`);
    console.log(`🏁 RESUMO: ${passed} passaram, ${failed} falharam.`);
    console.log(`═══════════════════════════════════════════════════════════════════════\n`);

    if (failed > 0) process.exit(1);
}

runTests().catch(err => {
    console.error('Fatal Test Runner Error:', err);
    process.exit(1);
});
