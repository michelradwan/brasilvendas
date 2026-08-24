// ==============================================================================
// SITE INTELLIGENCE — TEST SUITE ISOLADA
// Validação de Schema, PII Scrubbing, Session Engine e Resiliência
// ==============================================================================

const assert = require('assert');
const schema = require('../client/si-schema');
const sessionEngine = require('../server/session-engine');
const funnelEngine = require('../server/funnel-engine');
const frictionEngine = require('../server/friction-engine');
const bottleneckEngine = require('../server/bottleneck-engine');
const aiDiagnosisEngine = require('../server/ai-diagnosis');

console.log('🧪 [SITE INTELLIGENCE TEST SUITE] Iniciando Bateria de Testes...\n');

let passed = 0;

try {
    // 1. TESTE: Sanitização e Proteção de PII
    console.log('1. Testando sanitização estrita de PII em eventos...');
    const rawPayload = {
        cpf: '123.456.789-00',
        email: 'usuario@teste.com',
        phone: '11999998888',
        nome: 'João da Silva',
        safe_metric: 100,
        context: {
            page: '/checkout',
            user_note: 'Meu CPF é 12345678900'
        }
    };
    const clean = schema.sanitizePII(rawPayload);
    assert.strictEqual(clean.cpf, '[REDACTED_PII]', 'CPF deve ser redigido');
    assert.strictEqual(clean.email, '[REDACTED_PII]', 'Email deve ser redigido');
    assert.strictEqual(clean.nome, '[REDACTED_PII]', 'Nome deve ser redigido');
    assert(clean.context.user_note.includes('[REDACTED_CPF]'), 'CPF dentro de texto deve ser redigido');
    assert.strictEqual(clean.safe_metric, 100, 'Campos seguros devem permanecer intactos');
    console.log('   ✅ PASS: Proteção e redação de PII validadas com sucesso.');
    passed++;

    // 2. TESTE: Envelopamento Canônico
    console.log('2. Testando criação de Envelope SI...');
    const env = schema.createSIEnvelope('click', { session_id: 'SESS_123', scroll_pct: 45 });
    assert.strictEqual(env.event_type, 'click', 'Tipo de evento deve ser preservado');
    assert.strictEqual(env.session_id, 'SESS_123', 'Session ID deve ser atribuído');
    assert.strictEqual(env.metrics.scroll_pct, 45, 'Métrica de scroll deve ser atribuída');
    console.log('   ✅ PASS: Envelope de evento estruturado e validado.');
    passed++;

    // 3. TESTE: Processamento de Sessão & Agregação
    console.log('3. Testando Session Engine e consolidação de funil...');
    const sampleEvents = [
        schema.createSIEnvelope('pageview', { session_id: 'S1', scroll_pct: 30 }),
        schema.createSIEnvelope('checkout_step', { session_id: 'S1', scroll_pct: 80 }),
        schema.createSIEnvelope('rage_click', { session_id: 'S1', target_tag: 'button' }),
        schema.createSIEnvelope('pageview', { session_id: 'S2', scroll_pct: 10 })
    ];

    const processedSessions = sessionEngine.processEvents(sampleEvents, []);
    assert.strictEqual(processedSessions.length, 2, 'Deve identificar exatamente 2 sessões');
    
    const s1 = processedSessions.find(s => s.session_id === 'S1');
    assert.strictEqual(s1.reached_checkout, true, 'S1 deve ter alcançado o checkout');
    assert.strictEqual(s1.rage_clicks, 1, 'S1 deve ter registrado 1 rage click');
    assert.strictEqual(s1.max_scroll, 80, 'Max scroll de S1 deve ser 80%');
    console.log('   ✅ PASS: Session Engine consolidou eventos com precisão.');
    passed++;

    // 4. TESTE: Diagnóstico de Gargalo (Bottleneck Engine)
    console.log('4. Testando identificação autônoma de Gargalo de Conversão...');
    const mockFunnel = {
        steps: [
            { name: 'Pageview', count: 100, pct: 100, drop_off_pct: 80 },
            { name: 'Initiated Checkout', count: 20, pct: 20, drop_off_pct: 10 },
            { name: 'PIX Generated', count: 18, pct: 18, drop_off_pct: 5 },
            { name: 'Purchase Success', count: 17, pct: 17, drop_off_pct: 0 }
        ]
    };
    const mockFriction = { summary: { total_rage_clicks: 0 } };
    const b = bottleneckEngine.identifyBottleneck(mockFunnel, mockFriction, [{ session_id: '1' }]);
    assert.strictEqual(b.id, 'LANDING_PAGE_DROP', 'Queda de 80% na página inicial deve ser o gargalo');
    console.log('   ✅ PASS: Gargalo de conversão identificado corretamente.');
    passed++;

    // 5. TESTE: Resiliência em Amostra Nula (Zero Crash)
    console.log('5. Testando resiliência com amostragem zero...');
    const nullDiag = aiDiagnosisEngine.generateDiagnosis({ steps: [] }, { summary: {} }, { id: 'NO_DATA' }, []);
    assert.strictEqual(nullDiag.confidence_score, 0, 'Score de confiança deve ser 0 sem dados');
    console.log('   ✅ PASS: Resiliência com amostragem zero confirmada (Zero Crash).');
    passed++;

    console.log(`\n================================================================`);
    console.log(`🎉 SUITE SITE INTELLIGENCE COMPLETA: ${passed}/5 TESTES APROVADOS!`);
    console.log(`================================================================\n`);

} catch (err) {
    console.error('\n❌ ERRO NO TESTE:', err);
    process.exit(1);
}
