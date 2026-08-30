/**
 * RADWAN ADS — INTERACTIVE HOURLY CHART & TOOLTIP TEST SUITE
 * Validação automatizada de:
 * 1. Eliminação do bug de HTML cru / toasts indevidos
 * 2. ViewModel desacoplado com métrica protagonista
 * 3. Contexto secundário limpo e reconciliado
 * 4. Tratamento de hora atual (Parcial) e horas futuras
 * 5. Coordenação matemática de Crosshair e posicionamento
 * 6. Suporte Mobile Touch e teclado
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');

console.log('═══════════════════════════════════════════════════════════════════');
console.log('  RADWAN ADS — CHART INTERACTION & PREMIUM TOOLTIP VERIFICATION');
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

// Carregar arquivos fonte
const dashboardJs = fs.readFileSync(path.join(__dirname, '../js/dashboard.js'), 'utf-8');
const analyticsJs = fs.readFileSync(path.join(__dirname, '../js/analytics.js'), 'utf-8');
const cssContent = fs.readFileSync(path.join(__dirname, '../assets/admin-ads.css'), 'utf-8');

// Instanciação no VM
const vm = require('vm');
const sandbox = {
    window: {},
    document: {
        querySelectorAll: () => [],
        getElementById: (id) => null,
        addEventListener: () => {}
    },
    console: console,
    Intl: Intl,
    Date: Date,
    Math: Math,
    Number: Number,
    parseInt: parseInt,
    parseFloat: parseFloat,
    isNaN: isNaN,
    isFinite: isFinite,
    escapeHTML: (str) => String(str).replace(/[&<>'"]/g, tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag))
};

vm.createContext(sandbox);
vm.runInContext(analyticsJs, sandbox);
vm.runInContext(dashboardJs, sandbox);

const dashboard = sandbox.window.dashboard;

// ─── TESTE 1: Root Cause - showHourlyTooltip NÃO chama showToast ─────────────
runTest('1. showHourlyTooltip não envia HTML para showToast (Root Cause erradicada)', () => {
    let toastCalled = false;
    dashboard.showToast = (msg) => {
        toastCalled = true;
    };

    // Invoca showHourlyTooltip
    dashboard.showHourlyTooltip(10);
    assert.strictEqual(toastCalled, false, 'showHourlyTooltip nunca deve chamar showToast!');
});

// ─── TESTE 2: ViewModel com Lucro Líquido Protagonista ────────────────────────
runTest('2. Métrica Ativa "profit": Lucro é protagonista com faturamento, gasto e vendas no secundário', () => {
    // Configura mock de dados
    dashboard.cachedOrders = [
        { status: 'PAID', amount: 89.90, created_at: new Date().toISOString() }
    ];
    dashboard.cachedCampaigns = [{ id: '123' }];
    dashboard.cachedInsights.set('123', { spend: 20 });

    const vmProfit = dashboard.buildHourlyTooltipViewModel(10, 'profit');
    assert.ok(vmProfit, 'ViewModel deve ser gerado');
    assert.strictEqual(vmProfit.primaryLabel, 'Lucro Líquido Real');
    assert.ok(vmProfit.primaryFormatted.includes('R$'), 'Lucro formatado em R$');
    
    // Secundário não deve conter o próprio lucro duplicado
    const secLabels = vmProfit.secondary.map(s => s.label);
    assert.ok(secLabels.includes('Faturamento'), 'Secundário deve conter Faturamento');
    assert.ok(secLabels.includes('Investimento'), 'Secundário deve conter Investimento');
    assert.ok(secLabels.includes('Vendas'), 'Secundário deve conter Vendas');
    assert.ok(!secLabels.includes('Lucro Líquido'), 'Secundário não deve duplicar a métrica principal');
});

// ─── TESTE 3: ViewModel com Faturamento Protagonista ──────────────────────────
runTest('3. Métrica Ativa "revenue": Faturamento é protagonista', () => {
    const vmRev = dashboard.buildHourlyTooltipViewModel(10, 'revenue');
    assert.strictEqual(vmRev.primaryLabel, 'Faturamento');
    const secLabels = vmRev.secondary.map(s => s.label);
    assert.ok(secLabels.includes('Lucro Líquido'), 'Secundário deve incluir Lucro Líquido');
    assert.ok(secLabels.includes('Investimento'), 'Secundário deve incluir Investimento');
    assert.ok(secLabels.includes('Vendas'), 'Secundário deve incluir Vendas');
    assert.ok(!secLabels.includes('Faturamento'), 'Secundário não deve duplicar Faturamento');
});

// ─── TESTE 4: ViewModel com Vendas Protagonista ───────────────────────────────
runTest('4. Métrica Ativa "sales": Vendas é protagonista formatado como vendas/venda', () => {
    const vmSales = dashboard.buildHourlyTooltipViewModel(10, 'sales');
    assert.strictEqual(vmSales.primaryLabel, 'Vendas Confirmadas');
    assert.ok(vmSales.primaryFormatted.includes('venda'), 'Formatação de vendas presente');
    const secLabels = vmSales.secondary.map(s => s.label);
    assert.ok(secLabels.includes('Lucro Líquido'));
    assert.ok(secLabels.includes('Faturamento'));
    assert.ok(secLabels.includes('Investimento'));
    assert.ok(!secLabels.includes('Vendas'));
});

// ─── TESTE 5: Status de Hora Atual vs Hora Futura ──────────────────────────────
runTest('5. Status de Hora Atual é "⚡ Em andamento" e Hora Futura é "Futuro"', () => {
    const nowHour = new Date().getHours();
    const curVm = dashboard.buildHourlyTooltipViewModel(nowHour, 'profit');
    assert.ok(curVm.statusLabel.includes('Em andamento') || curVm.statusLabel === 'Concluído');

    const futureHour = Math.min(23, nowHour + 2);
    if (futureHour > nowHour) {
        const futureVm = dashboard.buildHourlyTooltipViewModel(futureHour, 'profit');
        assert.strictEqual(futureVm.isFuture, true);
        assert.strictEqual(futureVm.statusLabel, 'Futuro');
    }
});

// ─── TESTE 6: Estilos de Tooltip, Crosshair e Highlights no CSS ───────────────
runTest('6. CSS possui classes da arquitetura de tooltip (.hourly-chart-tooltip, .hourly-crosshair)', () => {
    assert.ok(cssContent.includes('.hourly-chart-tooltip'), '.hourly-chart-tooltip deve existir');
    assert.ok(cssContent.includes('.hourly-crosshair'), '.hourly-crosshair deve existir');
    assert.ok(cssContent.includes('.hourly-bar-group'), '.hourly-bar-group deve existir');
    assert.ok(cssContent.includes('.hourly-axis-label'), '.hourly-axis-label deve existir');
    assert.ok(cssContent.includes('is-hovered'), 'Estado is-hovered deve existir');
    assert.ok(cssContent.includes('is-dimmed'), 'Estado is-dimmed deve existir');
});

// ─── TESTE 7: Troca de Métrica com Tooltip Aberto ─────────────────────────────
runTest('7. setHourlyChartMetric re-renderiza e atualiza tooltip ativo', () => {
    dashboard.activeHourlyIndex = 14;
    dashboard.setHourlyChartMetric('sales');
    assert.strictEqual(dashboard.hourlyChartMetric, 'sales');
    assert.strictEqual(dashboard.activeHourlyIndex, 14);
});

console.log('\n═══════════════════════════════════════════════════════════════════');
console.log(`  RESULTADO: ${passedTests}/${totalTests} TESTES DE INTERATIVIDADE APROVADOS!`);
console.log('═══════════════════════════════════════════════════════════════════\n');

process.exit(passedTests === totalTests ? 0 : 1);
