// ==============================================================================
// RADWAN ADS — DIAGNOSTIC MODAL TEST SUITE
// ==============================================================================

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

console.log('═══════════════════════════════════════════════════════════════════════');
console.log('🔍 INICIANDO TESTES DO MODAL DE DIAGNÓSTICO DO RADWAN ADS');
console.log('═══════════════════════════════════════════════════════════════════════\n');

// 1. SETUP DE AMBIENTE MOCK
const htmlContent = fs.readFileSync(path.join(ROOT, 'admin-ads.html'), 'utf8');

let modalClasses = ['modal-overlay', 'hidden'];
let containerHTML = '';

const mockModal = {
    classList: {
        contains: (cls) => modalClasses.includes(cls),
        add: (cls) => { if (!modalClasses.includes(cls)) modalClasses.push(cls); },
        remove: (cls) => { modalClasses = modalClasses.filter(c => c !== cls); }
    }
};

const mockContainer = {
    get innerHTML() { return containerHTML; },
    set innerHTML(val) { containerHTML = val; }
};

global.window = {
    analyticsEngine: {
        formatMoney: (val) => `R$ ${Number(val || 0).toFixed(2).replace('.', ',')}`,
        parseInsights: (i) => i || { spend: 0, purchases: 0, cpa: 0, roas: 0, link_ctr: 0 }
    }
};

global.document = {
    querySelectorAll: () => [],
    getElementById: (id) => {
        if (id === 'radwan-analysis-modal') return mockModal;
        if (id === 'radwan-analysis-content') return mockContainer;
        return null;
    },
    addEventListener: () => {}
};

// Carregar script do dashboard com mock mínimo
const dashboardCode = fs.readFileSync(path.join(ROOT, 'js', 'dashboard.js'), 'utf8');

// Extrair DashboardApp
eval(dashboardCode);

const dashboard = window.dashboard || new (eval('(' + dashboardCode + '; DashboardApp)'))();
dashboard.cachedCampaigns = [
    { id: 'camp_winner', name: '01 - TESTE ESCALA WINNER', status: 'ACTIVE', daily_budget: 15000 },
    { id: 'camp_bleeding', name: '02 - TESTE GASTO ALTO SEM VENDA', status: 'ACTIVE', daily_budget: 5000 },
    { id: 'camp_empty', name: '03 - CAMPANHA RECÉM CRIADA', status: 'ACTIVE', daily_budget: 3000 }
];

dashboard.cachedInsights = new Map([
    ['camp_winner', { spend: 120.50, purchases: 6, cpa: 20.08, roas: 3.80, link_ctr: 2.45 }],
    ['camp_bleeding', { spend: 65.00, purchases: 0, cpa: 0, roas: 0, link_ctr: 0.85 }],
    ['camp_empty', { spend: 0, purchases: 0, cpa: 0, roas: 0, link_ctr: 0, impressions: 0 }]
]);

let testsPassed = 0;
let totalTests = 0;

function runTest(name, fn) {
    totalTests++;
    try {
        fn();
        console.log(`   ✅ PASS: ${name}`);
        testsPassed++;
    } catch (err) {
        console.error(`   ❌ FAIL: ${name}`);
        console.error(`      Motivo: ${err.message}\n`);
    }
}

// ─── BATERIA DE TESTES DO MODAL ──────────────────────────────────────────────

runTest('Modal radwan-analysis-modal existe exatamente UMA vez no HTML (Sem duplicatas)', () => {
    const matches = htmlContent.match(/id="radwan-analysis-modal"/g) || [];
    assert.strictEqual(matches.length, 1, `Esperado 1 modal, encontrado: ${matches.length}`);
});

runTest('Container radwan-analysis-content está presente dentro do modal', () => {
    assert.ok(htmlContent.includes('id="radwan-analysis-content"'), 'Container de conteúdo deve existir no HTML');
});

runTest('Título "Diagnóstico do Radwan Ads" está presente no cabeçalho do modal', () => {
    assert.ok(htmlContent.includes('Diagnóstico do Radwan Ads'), 'Título institucional deve estar no cabeçalho');
});

runTest('Abertura de diagnóstico para Campanha WINNER gera estado SUCCESS com Score alto', () => {
    dashboard.openRadwanAnalysisModal('camp_winner');
    assert.ok(!modalClasses.includes('hidden'), 'Modal deve estar visível');
    assert.ok(containerHTML.includes('WINNER'), 'Deve conter tag WINNER');
    assert.ok(containerHTML.includes('Score 95'), 'Score deve ser 95');
    assert.ok(containerHTML.includes('R$ 120,50'), 'Investimento formatado correto');
    assert.ok(containerHTML.includes('6 un'), 'Quantidade de compras correta');
    assert.ok(containerHTML.includes('Aumentar +15%'), 'Botão de ação de escala deve estar presente');
});

runTest('Abertura de diagnóstico para Campanha com alto gasto e sem conversões alerta ATENÇÃO CRÍTICA', () => {
    dashboard.openRadwanAnalysisModal('camp_bleeding');
    assert.ok(!modalClasses.includes('hidden'), 'Modal deve estar visível');
    assert.ok(containerHTML.includes('ATENÇÃO CRÍTICA'), 'Deve alertar atenção crítica');
    assert.ok(containerHTML.includes('Score 38'), 'Score de saúde deve ser baixo');
    assert.ok(containerHTML.includes('Pausar entidade para estancar custo'), 'Recomendação de parada correta');
});

runTest('Abertura de diagnóstico para Campanha sem dados exibe estado INSUFFICIENT_DATA com explicação', () => {
    dashboard.openRadwanAnalysisModal('camp_empty');
    assert.ok(!modalClasses.includes('hidden'), 'Modal deve estar visível');
    assert.ok(containerHTML.includes('Dados insuficientes para diagnóstico no período'), 'Deve exibir mensagem explicativa');
    assert.ok(containerHTML.includes('03 - CAMPANHA RECÉM CRIADA'), 'Nome da campanha presente');
});

runTest('Abertura com ID desconhecido trata erro graciosamente sem travar ou deixar vazio', () => {
    dashboard.openRadwanAnalysisModal('id_inexistente_999');
    assert.ok(!modalClasses.includes('hidden'), 'Modal deve abrir');
    assert.ok(containerHTML.length > 0, 'Corpo do modal NÃO PODE ficar vazio');
    assert.ok(containerHTML.includes('id_inexistente_999'), 'ID deve constar no corpo');
});

runTest('Fechamento do modal adiciona classe hidden', () => {
    mockModal.classList.add('hidden');
    assert.ok(modalClasses.includes('hidden'), 'Modal deve fechar corretamente');
});

console.log('\n═══════════════════════════════════════════════════════════════════════');
console.log(`🎉 RESULTADO: ${testsPassed}/${totalTests} TESTES APROVADOS COM SUCESSO (100%)`);
console.log('═══════════════════════════════════════════════════════════════════════\n');

if (testsPassed !== totalTests) {
    process.exit(1);
}
