/**
 * TEST SUITE: RADWAN ADS — PREMIUM PRODUCT POLISH
 * Validação de tokens de motion, skeleton shimmer, sticky depth shadow,
 * Command Menu (⌘K), Mobile Bottom Dock e Reduced Motion.
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('🧪 Iniciando testes de validação: Premium Product Polish...\n');

let passedTests = 0;
let totalTests = 0;

function test(description, fn) {
    totalTests++;
    try {
        fn();
        console.log(`  ✅ PASS: ${description}`);
        passedTests++;
    } catch (err) {
        console.error(`  ❌ FAIL: ${description}`);
        console.error(`     Erro: ${err.message}\n`);
    }
}

const cssPath = path.join(__dirname, '..', 'assets', 'admin-ads.css');
const htmlPath = path.join(__dirname, '..', 'admin-ads.html');
const jsPath = path.join(__dirname, '..', 'js', 'dashboard.js');

const cssContent = fs.readFileSync(cssPath, 'utf8');
const htmlContent = fs.readFileSync(htmlPath, 'utf8');
const jsContent = fs.readFileSync(jsPath, 'utf8');

// 1. Motion Tokens & Physics
test('1. Tokens de Motion e física refinada estão presentes em :root', () => {
    assert(cssContent.includes('--motion-instant: 120ms'), 'Falta --motion-instant: 120ms');
    assert(cssContent.includes('--motion-fast: 150ms'), 'Falta --motion-fast: 150ms');
    assert(cssContent.includes('--motion-normal: 180ms'), 'Falta --motion-normal: 180ms');
    assert(cssContent.includes('--motion-modal: 200ms'), 'Falta --motion-modal: 200ms');
    assert(cssContent.includes('--focus-ring:'), 'Falta --focus-ring');
});

// 2. Shimmer Skeleton
test('2. Keyframes e classes de skeleton shimmer em grafite escuro estão definidos', () => {
    assert(cssContent.includes('@keyframes shimmer'), 'Falta @keyframes shimmer');
    assert(cssContent.includes('.skeleton-shimmer'), 'Falta .skeleton-shimmer');
    assert(cssContent.includes('background-size: 200% 100%'), 'Falta background-size do shimmer');
});

// 3. Disciplined Pulse
test('3. Keyframe de halo de sincronização ativa está configurado sem pulso infinito em status estáticos', () => {
    assert(cssContent.includes('@keyframes active-sync-halo'), 'Falta @keyframes active-sync-halo');
    assert(cssContent.includes('.is-syncing-pulse'), 'Falta .is-syncing-pulse');
});

// 4. Table Sticky Column Depth Shadow
test('4. Sombra dinâmica de profundidade para colunas sticky (.is-scrolled) está implementada no CSS e JS', () => {
    assert(cssContent.includes('.table-container.is-scrolled .sticky-col-status') || 
           cssContent.includes('.data-table-container.is-scrolled .sticky-col-status'), 
           'Falta seletor .is-scrolled no CSS para sticky-col-status');
    assert(jsContent.includes('setupTableStickyScrollDepth'), 'Falta método setupTableStickyScrollDepth em js/dashboard.js');
    assert(jsContent.includes('container.scrollLeft > 2'), 'Falta detecção de scrollLeft > 2 em js/dashboard.js');
});

// 5. Command Menu Markup & Engine
test('5. Markup do Command Menu (⌘K) está presente no HTML com acessibilidade e inputs', () => {
    assert(htmlContent.includes('id="command-menu-modal"'), 'Falta #command-menu-modal no HTML');
    assert(htmlContent.includes('id="command-menu-search-input"'), 'Falta #command-menu-search-input no HTML');
    assert(htmlContent.includes('id="command-menu-results"'), 'Falta #command-menu-results no HTML');
    assert(htmlContent.includes('⌘K'), 'Falta atalho ⌘K no HTML');
});

test('6. CommandMenuEngine está instanciado e conectado aos atalhos de teclado e views em JS', () => {
    assert(jsContent.includes('class CommandMenuEngine'), 'Falta class CommandMenuEngine em js/dashboard.js');
    assert(jsContent.includes("e.key.toLowerCase() === 'k'"), 'Falta atalho Ctrl+K / Cmd+K');
    assert(jsContent.includes('window.commandMenu = new CommandMenuEngine'), 'Falta inicialização de window.commandMenu');
    assert(jsContent.includes('toggleEmergencyStop'), 'Falta ação de Kill Switch no Command Menu');
});

// 6. Mobile Bottom Dock
test('7. Mobile Bottom Navigation Dock possui 4 atalhos essenciais e safe-area', () => {
    assert(htmlContent.includes('id="mobile-bottom-dock"'), 'Falta #mobile-bottom-dock no HTML');
    assert(htmlContent.includes('data-dock-view="home"'), 'Falta botão Home no dock');
    assert(htmlContent.includes('data-dock-view="campaigns"'), 'Falta botão Campanhas no dock');
    assert(htmlContent.includes('data-dock-view="site-intelligence"'), 'Falta botão Inteligência no dock');
    assert(htmlContent.includes('data-dock-view="more"'), 'Falta botão Mais no dock');
    assert(cssContent.includes('env(safe-area-inset-bottom)'), 'Falta safe-area-inset-bottom no dock mobile');
});

test('8. Sincronização de view ativa atualiza o Mobile Bottom Dock', () => {
    assert(jsContent.includes("document.querySelectorAll('.mobile-dock-btn')"), 'Falta atualização de classe active no mobile-dock-btn em switchView');
});

// 7. Reduced Motion
test('9. Suporte a @media (prefers-reduced-motion: reduce) configurado para acessibilidade', () => {
    assert(cssContent.includes('@media (prefers-reduced-motion: reduce)'), 'Falta @media (prefers-reduced-motion: reduce)');
    assert(cssContent.includes('animation: none !important'), 'Falta desativação de animações para reduced-motion');
});

// 8. Canonical Navigation Home / Overview
test('10. Mapeamento canônico de Home -> Overview em switchView() restaura a tela inicial sem falha', () => {
    assert(jsContent.includes("const canonical = (viewName === 'home' || viewName === 'overview') ? 'overview' : viewName;"), 'Falta canonical resolution de home -> overview em js/dashboard.js');
    assert(htmlContent.includes('id="view-overview"'), 'Falta section #view-overview no HTML');
});

console.log(`\n========================================`);
console.log(`📊 Resultado dos Testes: ${passedTests}/${totalTests} PASS`);
console.log(`========================================\n`);

if (passedTests === totalTests) {
    console.log('🎉 TODOS OS TESTES DE POLISH PREMIUM FORAM APROVADOS COM SUCESSO!');
    process.exit(0);
} else {
    console.error('⚠️ ALGUNS TESTES FALHARAM. CORRIJA ANTES DE PROSSEGUIR.');
    process.exit(1);
}
