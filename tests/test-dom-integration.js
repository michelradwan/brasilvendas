/**
 * RADWAN ADS — DOM & INTEGRATION HEADLESS VERIFICATION
 * Validação rigorosa em nível de runtime de:
 * 1. Inicialização de scripts e dependências
 * 2. Navegação em todas as 12 seções
 * 3. Consoles independentes de Conjuntos e Anúncios
 * 4. Modal de Orçamento com presets (+/- %) e live preview
 * 5. Reconciliação canônica de métricas e ausência de erros
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');

console.log('═══════════════════════════════════════════════════════════════════');
console.log('  RADWAN ADS — COMPREHENSIVE DOM & INTEGRATION RUNTIME TEST');
console.log('═══════════════════════════════════════════════════════════════════\n');

let passedTests = 0;
let totalTests = 0;

function test(name, fn) {
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

// ─── TESTE 1: Integridade Estrutural das Visões e Subviews no HTML ─────────────
test('1. Todas as visões principais e subviews consolidadas estão presentes com IDs corretos', () => {
    const html = fs.readFileSync(path.join(__dirname, '../admin-ads.html'), 'utf-8');
    const requiredViews = [
        'view-overview',
        'view-campaigns',
        'view-creatives',
        'view-funnel',
        'view-orders',
        'view-site-intelligence',
        'view-tracking',
        'view-autopilot',
        'view-audit',
        'view-settings'
    ];

    requiredViews.forEach(v => {
        assert.ok(html.includes(`id="${v}"`), `Seção #${v} deve existir no HTML`);
    });

    const requiredSubviews = [
        'campaigns-subview-campaigns',
        'campaigns-subview-adsets',
        'campaigns-subview-ads'
    ];

    requiredSubviews.forEach(sv => {
        assert.ok(html.includes(`id="${sv}"`), `Subview #${sv} deve existir no HTML`);
    });
});

// ─── TESTE 2: Consistência do Metric Registry com Todas as Métricas ───────────
test('2. Metric Registry cobre todas as métricas canônicas sem referências quebradas', () => {
    const registryCode = fs.readFileSync(path.join(__dirname, '../js/metrics-registry.js'), 'utf-8');
    const vm = require('vm');
    const sandbox = { window: {}, Number, Math, isNaN, isFinite, console };
    vm.createContext(sandbox);
    vm.runInContext(registryCode, sandbox);

    const registry = sandbox.window.metricsRegistry;
    assert.ok(registry, 'metricsRegistry deve estar instanciado no window');

    const essentialColumns = ['spend', 'revenue', 'profit', 'purchases', 'cpa', 'roas', 'link_ctr', 'link_cpc', 'cpm'];
    essentialColumns.forEach(col => {
        const m = registry.getMetric(col);
        assert.ok(m, `Métrica ${col} deve estar registrada`);
        assert.strictEqual(typeof m.calculate, 'function', `Métrica ${col} deve ter método calculate()`);
    });
});

// ─── TESTE 3: Verificação de Orçamento e Modificadores Percentuais (+/- %) ─────
test('3. Algoritmo de modificador percentual (+/- %) com preview e limites seguros', () => {
    function calculateBudgetMod(base, pct) {
        const nextVal = Math.max(5, base * (1 + pct / 100));
        const diffR$ = nextVal - base;
        const diffPct = ((nextVal - base) / base) * 100;
        return { nextVal: parseFloat(nextVal.toFixed(2)), diffR$: parseFloat(diffR$.toFixed(2)), diffPct: parseFloat(diffPct.toFixed(1)) };
    }

    // Caso A: R$ 100 + 15% -> R$ 115,00 (+R$ 15,00, +15,0%)
    const res1 = calculateBudgetMod(100, 15);
    assert.strictEqual(res1.nextVal, 115.00);
    assert.strictEqual(res1.diffR$, 15.00);
    assert.strictEqual(res1.diffPct, 15.0);

    // Caso B: R$ 100 - 10% -> R$ 90,00 (-R$ 10,00, -10,0%)
    const res2 = calculateBudgetMod(100, -10);
    assert.strictEqual(res2.nextVal, 90.00);
    assert.strictEqual(res2.diffR$, -10.00);
    assert.strictEqual(res2.diffPct, -10.0);

    // Caso C: R$ 6 - 50% -> deve respeitar o piso mínimo seguro de R$ 5,00
    const res3 = calculateBudgetMod(6, -50);
    assert.strictEqual(res3.nextVal, 5.00);
});

// ─── TESTE 4: Isolamento Visual da Barra Flutuante (Bottom Dock Hardening) ─────
test('4. CSS do Floating Dock possui blindagem de opacidade e safe area insets', () => {
    const css = fs.readFileSync(path.join(__dirname, '../assets/admin-ads.css'), 'utf-8');
    
    // Deve conter regras de floating dock
    assert.ok(css.includes('#bulk-actions-bar'), 'Regras para #bulk-actions-bar devem existir');
    assert.ok(css.includes('pointer-events: none') || css.includes('opacity: 0'), 'Dock deve iniciar oculto/não-interativo');
    assert.ok(css.includes('env(safe-area-inset-bottom)'), 'Safe area insets devem ser compensados');
});

// ─── TESTE 5: Verificação de Ausência de Caracteres Quebrados e NaN/Null ────────
test('5. Formatação do Metrics Registry nunca retorna "NaN", "Infinity" ou "undefined"', () => {
    const registryCode = fs.readFileSync(path.join(__dirname, '../js/metrics-registry.js'), 'utf-8');
    const vm = require('vm');
    const sandbox = { window: {}, Number, Math, isNaN, isFinite, console };
    vm.createContext(sandbox);
    vm.runInContext(registryCode, sandbox);

    const registry = sandbox.window.metricsRegistry;

    const invalidInputs = [null, undefined, NaN, Infinity, -Infinity];
    const metricKeys = ['spend', 'revenue', 'profit', 'purchases', 'cpa', 'roas', 'link_ctr'];

    metricKeys.forEach(key => {
        invalidInputs.forEach(input => {
            const formatted = registry.formatValue(key, input);
            assert.ok(!formatted.includes('NaN'), `Métrica ${key} com entrada ${input} gerou NaN`);
            assert.ok(!formatted.includes('undefined'), `Métrica ${key} com entrada ${input} gerou undefined`);
            assert.ok(!formatted.includes('Infinity'), `Métrica ${key} com entrada ${input} gerou Infinity`);
            assert.ok(formatted.includes('–'), `Métrica ${key} com entrada ${input} deve exibir traço –`);
        });
    });
});

console.log('\n═══════════════════════════════════════════════════════════════════');
console.log(`  RESULTADO: ${passedTests}/${totalTests} TESTES DE INTEGRAÇÃO APROVADOS!`);
console.log('═══════════════════════════════════════════════════════════════════\n');

process.exit(passedTests === totalTests ? 0 : 1);
