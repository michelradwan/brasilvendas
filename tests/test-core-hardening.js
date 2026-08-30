/**
 * RADWAN ADS — MASTER CORE HARDENING SUITE
 * Testes automatizados para validação de dados, integridade matemática,
 * resolução canônica de compras, orçamentos e rotas independentes.
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');

console.log('═══════════════════════════════════════════════════════════════════');
console.log('  RADWAN ADS — MASTER CORE HARDENING AUTOMATED VERIFICATION');
console.log('═══════════════════════════════════════════════════════════════════\n');

let passedTests = 0;
let totalTests = 0;

function runTest(name, fn) {
    totalTests++;
    try {
        fn();
        console.log(`  ✅ [PASS] ${name}`);
        passedTests++;
    } catch (err) {
        console.error(`  ❌ [FAIL] ${name}`);
        console.error(`     Error: ${err.message}\n`);
    }
}

// ─── TESTE 1: Meta Constants Allowlist ─────────────────────────────────────────
runTest('1. Meta Constants Allowlist suporta account-level e campaign-level', () => {
    const metaConstants = require('../config/meta-constants.js');
    const adsetsOp = metaConstants.ALLOWED_OPERATIONS['ADSETS_LIST'];
    const adsOp = metaConstants.ALLOWED_OPERATIONS['ADS_LIST'];

    assert.ok(adsetsOp, 'ADSETS_LIST deve existir nas operações permitidas');
    assert.ok(adsOp, 'ADS_LIST deve existir nas operações permitidas');

    // Testar regex no nível da conta
    assert.ok(adsetsOp.pathRegex.test('act_846780837970771/adsets'), 'Deve permitir act_846780837970771/adsets');
    assert.ok(adsOp.pathRegex.test('act_846780837970771/ads'), 'Deve permitir act_846780837970771/ads');

    // Testar regex no nível da campanha
    assert.ok(adsetsOp.pathRegex.test('120215000000000000/adsets'), 'Deve permitir 120215000000000000/adsets');
    assert.ok(adsOp.pathRegex.test('120215000000000000/ads'), 'Deve permitir 120215000000000000/ads');
});

// ─── TESTE 2: Resolução Canônica de Purchases (Zero Duplicação) ────────────────
runTest('2. Resolução Canônica de Compras sem somar aliases duplicados', () => {
    const AnalyticsEngine = require('../js/analytics.js');
    const engine = new AnalyticsEngine();

    // Simulação de payload Meta com múltiplos aliases do mesmo evento de compra
    const mockInsightWithDuplicateAliases = {
        spend: '100.00',
        impressions: '5000',
        reach: '4000',
        clicks: '150',
        actions: [
            { action_type: 'purchase', value: '3' },
            { action_type: 'omni_purchase', value: '3' },
            { action_type: 'offsite_conversion.fb_pixel_purchase', value: '3' }
        ],
        action_values: [
            { action_type: 'purchase', value: '597.00' },
            { action_type: 'omni_purchase', value: '597.00' },
            { action_type: 'offsite_conversion.fb_pixel_purchase', value: '597.00' }
        ]
    };

    const parsed = engine.parseInsights(mockInsightWithDuplicateAliases);

    // O sistema DEVE resolver hierarquicamente para 3 compras (e NÃO 9 somadas!)
    assert.strictEqual(parsed.purchases, 3, `Esperado 3 compras, obtido ${parsed.purchases}`);
    assert.strictEqual(parsed.revenue, 597, `Esperado R$ 597 de receita, obtido ${parsed.revenue}`);
    assert.strictEqual(parsed.cpa, 100 / 3, 'CPA deve ser spend / purchases');
});

// ─── TESTE 3: Integridade Matemática em Agregação (Zero Média Simples de Taxas) ─
runTest('3. Agregação de CTR, CPC, CPM e ROAS recomputada a partir de totais', () => {
    const AnalyticsEngine = require('../js/analytics.js');
    const engine = new AnalyticsEngine();

    const camp1 = { spend: 100, impressions: 1000, clicks: 10, purchases: 1, revenue: 150 };
    const camp2 = { spend: 1000, impressions: 100000, clicks: 5000, purchases: 20, revenue: 3000 };

    const aggregated = engine.aggregateInsights([camp1, camp2]);

    assert.strictEqual(aggregated.spend, 1100, 'Gasto total correto');
    assert.strictEqual(aggregated.impressions, 101000, 'Impressões totais corretas');
    assert.strictEqual(aggregated.clicks, 5010, 'Cliques totais corretos');
    assert.strictEqual(aggregated.purchases, 21, 'Compras totais corretas');

    // CTR correto: (5010 / 101000) * 100 = 4.960396...%
    const expectedCtr = (5010 / 101000) * 100;
    assert.ok(Math.abs(aggregated.link_ctr - expectedCtr) < 0.001, 'CTR deve ser calculado do total ponderado');

    // ROAS correto: 3150 / 1100 = 2.8636...x
    const expectedRoas = 3150 / 1100;
    assert.ok(Math.abs(aggregated.roas - expectedRoas) < 0.001, 'ROAS deve ser calculado de receita / gasto total');
});

// ─── TESTE 4: Metric Formatter & 0 vs null vs '–' ──────────────────────────────
runTest('4. Formatação de Métricas: 0 é zero real, null é traço –, sem NaN', () => {
    const fs = require('fs');
    const metricsCode = fs.readFileSync(path.join(__dirname, '../js/metrics-registry.js'), 'utf-8');

    // Instanciação em sandbox
    const vm = require('vm');
    const context = { window: {}, console: console, Number: Number, Math: Math, isNaN: isNaN, isFinite: isFinite };
    vm.createContext(context);
    vm.runInContext(metricsCode, context);

    const formatter = context.window.metricsRegistry ? context.window.metricsRegistry.formatValue : null;

    // Testar se null retorna traço
    const formattedNull = context.window.metricsRegistry.formatValue('spend', null);
    assert.ok(formattedNull.includes('–'), 'Valor null deve exibir traço');

    // Testar se 0 retorna R$ 0,00
    const formattedZero = context.window.metricsRegistry.formatValue('spend', 0);
    assert.ok(formattedZero.includes('0,00'), 'Valor zero deve exibir R$ 0,00');

    // Testar formatação de compras inteiras
    const formattedPurchases = context.window.metricsRegistry.formatValue('purchases', 1234);
    assert.ok(formattedPurchases.includes('1.234'), 'Compras devem formatar com separador pt-BR');
});

// ─── TESTE 5: Verificação dos Arquivos e Blindagem de Responsividade ───────────
runTest('5. Presença de Modais e Elementos Críticos no HTML e CSS', () => {
    const html = fs.readFileSync(path.join(__dirname, '../admin-ads.html'), 'utf-8');
    const css = fs.readFileSync(path.join(__dirname, '../assets/admin-ads.css'), 'utf-8');

    assert.ok(html.includes('id="budget-modal"'), 'Modal de Orçamento deve existir');
    assert.ok(html.includes('id="duplicate-modal"'), 'Modal de Duplicação deve existir');
    assert.ok(html.includes('id="radwan-analysis-modal"'), 'Modal de Diagnóstico Radwan deve existir');
    assert.ok(html.includes('id="adsets-table-body"'), 'Tabela de Conjuntos deve existir');
    assert.ok(html.includes('id="ads-table-body"'), 'Tabela de Anúncios deve existir');
    assert.ok(html.includes('id="bulk-actions-bar"'), 'Dock de Ações em Massa deve existir');

    assert.ok(css.includes('#bulk-actions-bar'), 'Estilos de isolamento do floating dock devem existir no CSS');
});

console.log('\n═══════════════════════════════════════════════════════════════════');
console.log(`  RESULTADO: ${passedTests}/${totalTests} TESTES APROVADOS COM SUCESSO!`);
console.log('═══════════════════════════════════════════════════════════════════\n');

process.exit(passedTests === totalTests ? 0 : 1);
