// ==============================================================================
// RADWAN ADS — LIVE PIPELINE & RECONCILIATION SIMULATION TEST
// Simulates real HTTP traffic from the store to the server and dashboard
// ==============================================================================

const assert = require('assert');
const http = require('http');

function httpRequest(options, data = null) {
    return new Promise((resolve, reject) => {
        const req = http.request(options, res => {
            let body = '';
            res.on('data', chunk => { body += chunk; });
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(body);
                    resolve({ statusCode: res.statusCode, headers: res.headers, body: parsed });
                } catch(e) {
                    resolve({ statusCode: res.statusCode, headers: res.headers, body: body });
                }
            });
        });
        req.on('error', reject);
        if (data) {
            req.write(typeof data === 'string' ? data : JSON.stringify(data));
        }
        req.end();
    });
}

async function runLiveSimulation() {
    console.log('🚀 [LIVE PIPELINE SIMULATION] Testando Ingestão HTTP, Funil e Painel...\n');

    const sessionId = 'test_sim_sess_' + Date.now();
    const visitorId = 'test_sim_vis_' + Date.now();

    // 1. Visitante entra no site (pageview)
    console.log('1. Simulando entrada de visitante no site (Pageview)...');
    const res1 = await httpRequest({
        hostname: 'localhost',
        port: 3333,
        path: '/api/si-collect',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
    }, {
        events: [{
            event_id: 'evt_sim_1',
            event_type: 'pageview',
            timestamp: new Date().toISOString(),
            session_id: sessionId,
            visitor_id: visitorId,
            device: { type: 'mobile', viewport_w: 390, viewport_h: 844 },
            context: { page_path: '/', utm_source: 'instagram', utm_campaign: 'patriota_escala' },
            metrics: { scroll_pct: 35, dwell_sec: 10, rage_click_count: 0, dead_click_count: 0 },
            data: {}
        }]
    });
    assert.strictEqual(res1.statusCode, 200);
    assert.strictEqual(res1.body.success, true);
    console.log('   ✅ PASS: Pageview recebido e registrado.');

    // 2. Visitante rola a página e clica em Comprar (checkout_step)
    console.log('2. Simulando abertura de checkout (Initiate Checkout)...');
    const res2 = await httpRequest({
        hostname: 'localhost',
        port: 3333,
        path: '/api/si-collect',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
    }, {
        events: [{
            event_id: 'evt_sim_2',
            event_type: 'checkout_step',
            timestamp: new Date().toISOString(),
            session_id: sessionId,
            visitor_id: visitorId,
            device: { type: 'mobile', viewport_w: 390, viewport_h: 844 },
            context: { page_path: '/', utm_source: 'instagram', utm_campaign: 'patriota_escala' },
            metrics: { scroll_pct: 85, dwell_sec: 45, rage_click_count: 0, dead_click_count: 0 },
            data: { step: 'checkout_open', size: 'G', quantity: 1 }
        }]
    });
    assert.strictEqual(res2.statusCode, 200);
    console.log('   ✅ PASS: Checkout registrado.');

    // 3. Visitante gera PIX (pix_generated)
    console.log('3. Simulando geração de código PIX (PIX Generated)...');
    const res3 = await httpRequest({
        hostname: 'localhost',
        port: 3333,
        path: '/api/si-collect',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
    }, {
        events: [{
            event_id: 'evt_sim_3',
            event_type: 'pix_generated',
            timestamp: new Date().toISOString(),
            session_id: sessionId,
            visitor_id: visitorId,
            device: { type: 'mobile', viewport_w: 390, viewport_h: 844 },
            context: { page_path: '/', utm_source: 'instagram', utm_campaign: 'patriota_escala' },
            metrics: { scroll_pct: 95, dwell_sec: 75, rage_click_count: 0, dead_click_count: 0 },
            data: { transaction_id: 'tx_sim_999', amount: 89.90, quantity: 1 }
        }]
    });
    assert.strictEqual(res3.statusCode, 200);
    console.log('   ✅ PASS: PIX registrado.');

    // 4. Pagamento aprovado (purchase_success)
    console.log('4. Simulando confirmação de compra (Purchase Success)...');
    const res4 = await httpRequest({
        hostname: 'localhost',
        port: 3333,
        path: '/api/si-collect',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
    }, {
        events: [{
            event_id: 'evt_sim_4',
            event_type: 'purchase_success',
            timestamp: new Date().toISOString(),
            session_id: sessionId,
            visitor_id: visitorId,
            device: { type: 'mobile', viewport_w: 390, viewport_h: 844 },
            context: { page_path: '/', utm_source: 'instagram', utm_campaign: 'patriota_escala' },
            metrics: { scroll_pct: 100, dwell_sec: 120, rage_click_count: 0, dead_click_count: 0 },
            data: { transaction_id: 'tx_sim_999', amount: 89.90 }
        }]
    });
    assert.strictEqual(res4.statusCode, 200);
    console.log('   ✅ PASS: Compra confirmada e registrada.');

    // 5. Consulta pelo painel do Site Intelligence (/api/si-query)
    console.log('5. Consultando métricas consolidadas via /api/si-query...');
    const resQuery = await httpRequest({
        hostname: 'localhost',
        port: 3333,
        path: '/api/si-query',
        method: 'GET'
    });
    assert.strictEqual(resQuery.statusCode, 200);
    assert.strictEqual(resQuery.body.success, true);
    
    const d = resQuery.body.data;
    assert(d.overview.total_sessions >= 1, 'Deve registrar ao menos 1 sessão');
    assert(d.overview.checkout_count >= 1, 'Deve registrar ao menos 1 checkout');
    assert(d.overview.pix_count >= 1, 'Deve registrar ao menos 1 pix');
    assert(d.overview.purchase_count >= 1, 'Deve registrar ao menos 1 compra');

    console.log('   Métricas Agregadas Recebidas:');
    console.log(`   - Sessões Totais: ${d.overview.total_sessions}`);
    console.log(`   - Checkouts: ${d.overview.checkout_count}`);
    console.log(`   - PIX Gerados: ${d.overview.pix_count}`);
    console.log(`   - Compras: ${d.overview.purchase_count}`);
    console.log(`   - Saúde da Conversão: ${d.overview.conversion_health.score}/100 (${d.overview.conversion_health.label})`);
    console.log(`   - Status do Rastreamento: ${resQuery.body.tracking_health.status}`);
    console.log(`   - Último Evento: há ${resQuery.body.tracking_health.seconds_ago}s`);

    console.log('\n🎉 [LIVE PIPELINE COMPLETO] Ingestão, agregação, funil e leitura operando em 100% de harmonia!');
}

runLiveSimulation().catch(err => {
    console.error('❌ [LIVE TEST FAILED]', err);
    process.exit(1);
});
