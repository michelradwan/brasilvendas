// ==============================================================================
// RADWAN ADS — SITE INTELLIGENCE END-TO-END TEST SUITE
// Rigorous verification of Ingestion, Session Engine, Funnel, Friction,
// Bottlenecks, Radwan Diagnosis, Zero-PII and Date Filtering.
// ==============================================================================

const assert = require('assert');
const schema = require('../site-intelligence/client/si-schema');
const sessionEngine = require('../site-intelligence/server/session-engine');
const funnelEngine = require('../site-intelligence/server/funnel-engine');
const frictionEngine = require('../site-intelligence/server/friction-engine');
const bottleneckEngine = require('../site-intelligence/server/bottleneck-engine');
const aiDiagnosisEngine = require('../site-intelligence/server/ai-diagnosis');
const storage = require('../lib/si-storage');
const collectHandler = require('../api/si-collect');
const queryHandler = require('../api/si-query');

console.log('🧪 [SITE INTELLIGENCE] Executando Auditoria e Testes End-to-End...\n');

async function runSiteIntelligenceTests() {
    let passed = 0;

    // 1. TESTE: Zero PII Sanitization
    console.log('1. Testando sanitização estrita de PII (Zero PII Enforcement)...');
    const dirtyPayload = {
        session_id: 'test_sess_001',
        visitor_id: 'test_vis_001',
        cpf: '123.456.789-00',
        email: 'cliente@teste.com',
        phone: '11999998888',
        password: 'supersecretpassword',
        data: {
            nome: 'Fulano de Tal',
            address: 'Rua das Flores 123',
            cartao: '4111222233334444',
            safe_metric: 'button_click_cta'
        }
    };
    const cleanPayload = schema.sanitizePII(dirtyPayload);
    assert.strictEqual(cleanPayload.cpf, '[REDACTED_PII]', 'CPF deve ser redigido');
    assert.strictEqual(cleanPayload.email, '[REDACTED_PII]', 'Email deve ser redigido');
    assert.strictEqual(cleanPayload.phone, '[REDACTED_PII]', 'Telefone deve ser redigido');
    assert.strictEqual(cleanPayload.password, '[REDACTED_PII]', 'Senha deve ser redigida');
    assert.strictEqual(cleanPayload.data.cartao, '[REDACTED_PII]', 'Cartão deve ser redigido');
    assert.strictEqual(cleanPayload.data.safe_metric, 'button_click_cta', 'Métricas anônimas devem ser preservadas');
    console.log('   ✅ PASS: Zero PII estritamente garantido.');
    passed++;

    // 2. TESTE: Event Envelope Builder
    console.log('2. Testando criação de Envelope Canônico de Evento...');
    const envelope = schema.createSIEnvelope('checkout_step', {
        session_id: 'sess_abc',
        visitor_id: 'vis_123',
        scroll_pct: 85,
        dwell_sec: 42,
        utm_source: 'facebook',
        utm_campaign: 'cbo_escala_v1'
    });
    assert.strictEqual(envelope.event_type, 'checkout_step');
    assert.strictEqual(envelope.session_id, 'sess_abc');
    assert.strictEqual(envelope.metrics.scroll_pct, 85);
    assert.strictEqual(envelope.metrics.dwell_sec, 42);
    assert.strictEqual(envelope.context.utm_source, 'facebook');
    console.log('   ✅ PASS: Envelope canônico gerado com precisão.');
    passed++;

    // 3. TESTE: Ingestão de Eventos via /api/si-collect
    console.log('3. Testando Endpoint Coletor (/api/si-collect)...');
    const mockEvents = [
        {
            event_id: 'evt_test_1',
            event_type: 'pageview',
            timestamp: new Date().toISOString(),
            session_id: 'sess_live_1',
            visitor_id: 'vis_live_1',
            device: { type: 'mobile' },
            context: { utm_source: 'instagram', utm_campaign: 'black_friday' },
            metrics: { scroll_pct: 45, dwell_sec: 12, rage_click_count: 0, dead_click_count: 0 }
        },
        {
            event_id: 'evt_test_2',
            event_type: 'checkout_step',
            timestamp: new Date().toISOString(),
            session_id: 'sess_live_1',
            visitor_id: 'vis_live_1',
            device: { type: 'mobile' },
            context: { utm_source: 'instagram', utm_campaign: 'black_friday' },
            metrics: { scroll_pct: 90, dwell_sec: 45, rage_click_count: 0, dead_click_count: 0 },
            data: { step: 'checkout_open' }
        }
    ];

    let collectResData = null;
    const mockReqCollect = {
        method: 'POST',
        headers: {},
        body: { events: mockEvents }
    };
    const mockResCollect = {
        statusCode: 200,
        setHeader() {},
        status(c) { this.statusCode = c; return this; },
        json(d) { collectResData = d; }
    };

    await collectHandler(mockReqCollect, mockResCollect);
    assert.strictEqual(collectResData.success, true);
    assert.strictEqual(collectResData.processed, 2);
    console.log('   ✅ PASS: Ingestão processada com sucesso no storage.');
    passed++;

    // 4. TESTE: Reconstituição e Agregação de Sessões (Session Engine)
    console.log('4. Testando Session Engine e flags comportamentais...');
    const simulatedEvents = [
        // Sessão A: Comprou com sucesso
        { event_type: 'pageview', session_id: 's_a', timestamp: '2026-08-30T01:00:00Z', metrics: { scroll_pct: 50, dwell_sec: 10 } },
        { event_type: 'checkout_step', session_id: 's_a', timestamp: '2026-08-30T01:01:00Z', metrics: { scroll_pct: 80, dwell_sec: 30 } },
        { event_type: 'pix_generated', session_id: 's_a', timestamp: '2026-08-30T01:02:00Z', metrics: { scroll_pct: 95, dwell_sec: 60 } },
        { event_type: 'purchase_success', session_id: 's_a', timestamp: '2026-08-30T01:03:00Z', metrics: { scroll_pct: 100, dwell_sec: 120 } },
        
        // Sessão B: Chegou ao checkout e gerou PIX, mas não pagou
        { event_type: 'pageview', session_id: 's_b', timestamp: '2026-08-30T01:05:00Z', metrics: { scroll_pct: 60, dwell_sec: 15 } },
        { event_type: 'checkout_step', session_id: 's_b', timestamp: '2026-08-30T01:06:00Z', metrics: { scroll_pct: 85, dwell_sec: 40 } },
        { event_type: 'pix_generated', session_id: 's_b', timestamp: '2026-08-30T01:07:00Z', metrics: { scroll_pct: 90, dwell_sec: 70 } },

        // Sessão C: Abandono na Landing Page
        { event_type: 'pageview', session_id: 's_c', timestamp: '2026-08-30T01:10:00Z', metrics: { scroll_pct: 30, dwell_sec: 8 } },

        // Sessão D: Rage clicks na landing page
        { event_type: 'pageview', session_id: 's_d', timestamp: '2026-08-30T01:15:00Z', metrics: { scroll_pct: 40, dwell_sec: 25 } },
        { event_type: 'rage_click', session_id: 's_d', timestamp: '2026-08-30T01:16:00Z', metrics: { scroll_pct: 40, dwell_sec: 26 }, data: { target_tag: 'button', target_id: 'btn-fake' } }
    ];

    const processedSessions = sessionEngine.processEvents(simulatedEvents, []);
    assert.strictEqual(processedSessions.length, 4, 'Devem existir 4 sessões distintas');

    const sessA = processedSessions.find(s => s.session_id === 's_a');
    assert.strictEqual(sessA.purchased, true);
    assert.strictEqual(sessA.generated_pix, true);
    assert.strictEqual(sessA.reached_checkout, true);

    const sessB = processedSessions.find(s => s.session_id === 's_b');
    assert.strictEqual(sessB.purchased, false);
    assert.strictEqual(sessB.generated_pix, true);
    assert.strictEqual(sessB.reached_checkout, true);

    const sessD = processedSessions.find(s => s.session_id === 's_d');
    assert.strictEqual(sessD.rage_clicks, 1);

    const aggregated = sessionEngine.aggregateMetrics(processedSessions);
    assert.strictEqual(aggregated.total_sessions, 4);
    assert.strictEqual(aggregated.checkout_count, 2);
    assert.strictEqual(aggregated.pix_count, 2);
    assert.strictEqual(aggregated.purchase_count, 1);
    assert.strictEqual(aggregated.rage_click_sessions, 1);
    assert.strictEqual(aggregated.conversion_rate, 25.0);
    console.log('   ✅ PASS: Agregação comportamental validada.');
    passed++;

    // 5. TESTE: Cálculo do Funil Comportamental (Funnel Engine)
    console.log('5. Testando Funnel Engine com contagens reais e taxas de queda...');
    const funnelResult = funnelEngine.calculateFunnel(processedSessions);
    assert.strictEqual(funnelResult.steps.length, 4);
    assert.strictEqual(funnelResult.steps[0].count, 4); // Sessões
    assert.strictEqual(funnelResult.steps[1].count, 2); // Checkout
    assert.strictEqual(funnelResult.steps[2].count, 2); // PIX
    assert.strictEqual(funnelResult.steps[3].count, 1); // Compra

    assert.strictEqual(funnelResult.steps[0].drop_off_pct, 50.0); // 4 -> 2 (50% queda)
    assert.strictEqual(funnelResult.steps[1].drop_off_pct, 0.0);  // 2 -> 2 (0% queda)
    assert.strictEqual(funnelResult.steps[2].drop_off_pct, 50.0); // 2 -> 1 (50% queda)
    console.log('   ✅ PASS: Funil comportamental calculado sem desvios.');
    passed++;

    // 6. TESTE: Detecção de Fricção e Rage Click (Friction Engine)
    console.log('6. Testando detecção de pontos de atrito e índice de fricção...');
    const frictionResult = frictionEngine.analyzeFriction(simulatedEvents, processedSessions);
    assert.strictEqual(frictionResult.summary.total_rage_clicks, 1);
    assert.strictEqual(frictionResult.top_rage_elements.length, 1);
    assert.strictEqual(frictionResult.top_rage_elements[0].element, 'button#btn-fake');
    console.log('   ✅ PASS: Elementos de frustração mapeados com sucesso.');
    passed++;

    // 7. TESTE: Identificação de Gargalo Principal com Regra de Amostra Mínima
    console.log('7. Testando Bottleneck Engine com regra de volume estatístico...');
    // Com 4 sessões (menos de 10) deve retornar INSUFFICIENT_SAMPLE
    const smallSampleBottleneck = bottleneckEngine.identifyBottleneck(funnelResult, frictionResult, processedSessions);
    assert.strictEqual(smallSampleBottleneck.id, 'INSUFFICIENT_SAMPLE', 'Amostra < 10 deve acusar insuficiência');

    // Simulando 20 sessões onde 18 abandonam o PIX gerado
    const largeSessions = [];
    for (let i = 0; i < 20; i++) {
        largeSessions.push({
            session_id: `large_sess_${i}`,
            reached_checkout: true,
            generated_pix: true,
            purchased: i < 2 // apenas 2 de 20 pagaram (90% drop no PIX)
        });
    }
    const largeFunnel = funnelEngine.calculateFunnel(largeSessions);
    const largeBottleneck = bottleneckEngine.identifyBottleneck(largeFunnel, { summary: {} }, largeSessions);
    assert.strictEqual(largeBottleneck.id, 'PIX_NON_PAYMENT', 'Deve identificar queda no pagamento de PIX');
    assert.strictEqual(largeBottleneck.drop_rate, 90.0);
    console.log('   ✅ PASS: Gargalo identificado matematicamente com rigor estatístico.');
    passed++;

    // 8. TESTE: Diagnóstico Determinístico do RADWAN
    console.log('8. Testando Diagnóstico do RADWAN com confiança estatística...');
    const diagnosis = aiDiagnosisEngine.generateDiagnosis(largeFunnel, { summary: {} }, largeBottleneck, largeSessions);
    assert(diagnosis.headline.includes('PIX') || diagnosis.headline.includes('Gargalo'));
    assert(diagnosis.bullets.length >= 2);
    assert(diagnosis.confidence_score > 0);
    assert.strictEqual(typeof diagnosis.recommended_action, 'string');
    console.log('   ✅ PASS: Diagnóstico do RADWAN estruturado em português natural.');
    passed++;

    // 9. TESTE: Cálculo Auditável de Saúde da Conversão (Conversion Health)
    console.log('9. Testando fórmula da Saúde da Conversão (0-100)...');
    // Sessões com 0 visitantes
    const emptyHealth = sessionEngine.calculateConversionHealth(0, 0, 0, 0, 0, 0);
    assert.strictEqual(emptyHealth.score, null);
    assert.strictEqual(emptyHealth.label, '—');

    // Sessões excelentes (5% conversão, 15% checkout, 0 rage, 80% scroll)
    const excellentHealth = sessionEngine.calculateConversionHealth(100, 15, 10, 5, 0, 80);
    assert(excellentHealth.score >= 80, 'Score excelente deve ser >= 80');
    assert.strictEqual(excellentHealth.label, 'Excelente');
    console.log('   ✅ PASS: Saúde da conversão auditável e transparente.');
    passed++;

    // 10. TESTE: Endpoint de Consulta (/api/si-query) com Filtro de Data
    console.log('10. Testando Endpoint Leitor (/api/si-query)...');
    let queryResData = null;
    const mockReqQuery = {
        method: 'GET',
        headers: { 'x-admin-auth': process.env.ADMIN_PASSWORD || 'test-suite-admin-secret-2026' },
        query: { since: '2026-08-01', until: '2026-08-30' }
    };
    const mockResQuery = {
        statusCode: 200,
        setHeader() {},
        status(c) { this.statusCode = c; return this; },
        json(d) { queryResData = d; }
    };

    await queryHandler(mockReqQuery, mockResQuery);
    assert.strictEqual(queryResData.success, true);
    assert(queryResData.data.overview !== undefined);
    assert(queryResData.data.funnel !== undefined);
    assert(queryResData.data.bottleneck !== undefined);
    assert(queryResData.data.diagnosis !== undefined);
    assert(queryResData.tracking_health !== undefined);
    console.log('   ✅ PASS: Query API retornou payload completo.');
    passed++;

    console.log(`\n🎉 [SUCESSO TOTAL] Todos os ${passed}/${passed} testes de Site Intelligence foram APROVADOS com 100% de conformidade!`);
}

runSiteIntelligenceTests().catch(err => {
    console.error('❌ [TEST FAILED]', err);
    process.exit(1);
});
