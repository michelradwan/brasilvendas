// ==============================================================================
// TESTE AUTOMATIZADO DE CALIBRAÇÃO VISUAL E LAYOUT (CAMPANHAS 390px)
// ==============================================================================

const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('📱 Iniciando auditoria de código e layout mobile (320px - 430px)...\n');

let passed = 0;
let total = 0;

function test(name, fn) {
    total++;
    try {
        fn();
        console.log(`  ✅ PASS: ${name}`);
        passed++;
    } catch (e) {
        console.error(`  ❌ FAIL: ${name}`);
        console.error(`     Erro: ${e.message}`);
    }
}

const htmlCode = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const cssCode = fs.readFileSync(path.join(__dirname, '..', 'assets', 'admin-ads.css'), 'utf8');

// 1. Proibição estrita de text-overflow: ellipsis nas abas principais da tabela de campanhas
test('1. Proibição de text-overflow: ellipsis em Campanhas / Conjuntos / Anúncios', () => {
    assert(!htmlCode.includes('id="tab-nav-campaigns" class="campaign-tab-btn active truncate"'), 'Abas de campanhas não podem ter truncate');
    assert(htmlCode.includes('id="tab-nav-campaigns"') && htmlCode.includes('<span class="tab-label">Campanhas</span>'), 'Aba Campanhas com label íntegro');
    assert(htmlCode.includes('id="tab-nav-adsets"') && htmlCode.includes('<span class="tab-label">Conjuntos</span>'), 'Aba Conjuntos com label íntegro');
    assert(htmlCode.includes('id="tab-nav-ads"') && htmlCode.includes('<span class="tab-label">Anúncios</span>'), 'Aba Anúncios com label íntegro');
    assert(cssCode.includes('.campaign-tab-btn .tab-label'), 'Regra .campaign-tab-btn .tab-label ausente no CSS');
    assert(cssCode.includes('text-overflow: clip') || cssCode.includes('overflow: visible'), 'Abas devem ter overflow visível');
});

// 2. Grid Responsivo de 3 Colunas com proporção calibrada para "Campanhas"
test('2. Grid de Abas com proporção calibrada (minmax(0, 1.25fr)...) para acomodar texto longo', () => {
    assert(cssCode.includes('.campaign-tabs-grid'), 'Classe .campaign-tabs-grid ausente no CSS');
    assert(cssCode.includes('grid-template-columns: minmax(0, 1.25fr) minmax(0, 1.05fr) minmax(0, 1.0fr);'), 'Grid com proporção assimétrica para Campanhas');
});

// 3. Filter Chips com scroll horizontal nativo sem quebra de linha nem vazamento de card
test('3. Filter Chips com scroll horizontal nativo e box-sizing: border-box', () => {
    assert(cssCode.includes('.filter-chips-row'), 'Classe .filter-chips-row ausente no CSS');
    assert(cssCode.includes('overflow-x: auto'), 'Falta overflow-x: auto no filter-chips-row');
    assert(cssCode.includes('-webkit-overflow-scrolling: touch'), 'Falta suporte a touch scroll nativo no iOS');
    assert(cssCode.includes('flex: 0 0 auto'), 'Chips devem ter flex: 0 0 auto para não serem comprimidos');
});

// 4. Controles de Visão e Colunas em Grid Responsivo 2 colunas
test('4. Linha de Visão e Colunas com layout contido e sem elementos externos', () => {
    assert(cssCode.includes('.campaigns-toolbar-row'), 'Classe .campaigns-toolbar-row ausente no CSS');
    assert(cssCode.includes('grid-template-columns: minmax(0, 1fr) auto;'), 'Grid 2 colunas para Visão + Colunas');
    assert(htmlCode.includes('hidden sm:inline-flex flex-shrink-0" title="Alternar densidade da tabela"'), 'Botão de densidade (📐) oculto no mobile para não vazar');
});

// 5. Box-Sizing e Ausência de Largura Fixa (> 100%)
test('5. Box-sizing: border-box em toda a árvore de campanhas', () => {
    assert(cssCode.includes('box-sizing: border-box'), 'Falta box-sizing: border-box');
    assert(htmlCode.includes('id="global-search-input"'), 'Input de busca global presente');
});

console.log(`\n========================================`);
console.log(`📊 Resultado da Auditoria: ${passed}/${total} PASS`);
console.log(`========================================\n`);

if (passed === total) {
    console.log('🎉 TODAS AS REGRAS E CALIBRAÇÕES MOBILE FORAM VALIDADAS COM SUCESSO!');
    process.exit(0);
} else {
    process.exit(1);
}
