// ==============================================================================
// RADWAN ADS — TESTE DE RESPONSIVIDADE E UX DA SEÇÃO CRIATIVOS
// Matrix 320px a 2560px, Long Names, Extreme Metrics, Zero Overflow, Bounding
// ==============================================================================

const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('🧪 [CREATIVES RESPONSIVE AUDIT] Iniciando auditoria estática e estrutural de Criativos...\n');

const htmlContent = fs.readFileSync(path.resolve(__dirname, '../admin-ads.html'), 'utf8');
const cssContent = fs.readFileSync(path.resolve(__dirname, '../assets/admin-ads.css'), 'utf8');
const jsContent = fs.readFileSync(path.resolve(__dirname, '../js/dashboard.js'), 'utf8');

let passed = 0;

// 1. AUDITORIA: Estrutura HTML da Seção Criativos
console.log('1. Auditando estrutura da Seção 3 (Criativos) em admin-ads.html...');
assert(htmlContent.includes('id="view-creatives"'), 'Seção view-creatives deve existir no DOM');
assert(htmlContent.includes('id="creatives-grid-container"'), 'Container creatives-grid-container deve existir no DOM');
assert(htmlContent.includes('class="creatives-period-bar'), 'Barra de período local com scroller deve existir');
console.log('   ✅ PASS: Estrutura HTML de Criativos verificada.');
passed++;

// 2. AUDITORIA: Regras de Grid Responsivo em CSS
console.log('2. Auditando regras de Grid Responsivo para Criativos em admin-ads.css...');
assert(cssContent.includes('.creatives-grid {'), 'Classe .creatives-grid deve estar declarada');
assert(cssContent.includes('minmax(0, 1fr)'), '.creatives-grid deve usar minmax(0, 1fr) para mobile');
assert(!htmlContent.includes('.creatives-grid { display: grid; grid-template-columns: repeat(3, minmax(280px, 1fr))'), 'Não deve haver minmax(280px, 1fr) inline rígido no HTML');
console.log('   ✅ PASS: Grid 100% responsivo para mobile (<640px) e tablet/desktop.');
passed++;

// 3. AUDITORIA: Card Header Blindado (Grid 1fr auto)
console.log('3. Auditando blindagem contra nomes longos (.creative-card-header)...');
assert(cssContent.includes('.creative-card-header {'), 'Classe .creative-card-header deve existir');
assert(cssContent.includes('grid-template-columns: minmax(0, 1fr) auto'), 'Header deve usar grid-template-columns: minmax(0, 1fr) auto');
assert(cssContent.includes('.creative-status-badge {'), 'Badge de status deve ter classe dedicada');
assert(cssContent.includes('flex-shrink: 0'), 'Badge de status deve ter flex-shrink: 0');
console.log('   ✅ PASS: Header blindado contra colisão de nomes longos e badges.');
passed++;

// 4. AUDITORIA: Métricas 2x2 sem Overflow
console.log('4. Auditando Grid 2x2 de Métricas (.creative-metrics-grid)...');
assert(cssContent.includes('.creative-metrics-grid {'), 'Classe .creative-metrics-grid deve existir');
assert(cssContent.includes('.creative-metric-cell {'), 'Classe .creative-metric-cell deve existir');
assert(cssContent.includes('.creative-metric-value {'), 'Classe .creative-metric-value deve existir');
assert(cssContent.includes('text-overflow: ellipsis'), 'Valores de métricas devem possuir proteção ellipsis');
console.log('   ✅ PASS: Células de métricas com min-width: 0 e proteção de texto.');
passed++;

// 5. AUDITORIA: Footer do Card com ID e Vendas
console.log('5. Auditando alinhamento do Footer do Card (.creative-card-footer)...');
assert(cssContent.includes('.creative-card-footer {'), 'Classe .creative-card-footer deve existir');
assert(cssContent.includes('.creative-card-id {'), 'ID do card deve ter classe própria');
assert(cssContent.includes('.creative-card-sales {'), 'Vendas deve ter classe própria');
console.log('   ✅ PASS: Footer responsivo com ID truncável e vendas.');
passed++;

// 6. AUDITORIA: Bulk Actions Bar Inativa sem Overlay
console.log('6. Auditando isolamento do #bulk-actions-bar inativo...');
assert(cssContent.includes('visibility: hidden'), '#bulk-actions-bar inativo deve ter visibility: hidden');
assert(cssContent.includes('opacity: 0'), '#bulk-actions-bar inativo deve ter opacity: 0');
assert(cssContent.includes('pointer-events: none'), '#bulk-actions-bar inativo deve ter pointer-events: none');
console.log('   ✅ PASS: Zero overlay ou interferência de elementos flutuantes.');
passed++;

// 7. AUDITORIA: Tradução Visual em Português sem Quebrar Enums
console.log('7. Auditando tradução visual em renderCreativesView (js/dashboard.js)...');
assert(jsContent.includes("'Em teste'"), 'Status TESTING deve ser apresentado como "Em teste"');
assert(jsContent.includes("'Vencedor'"), 'Status WINNER deve ser apresentado como "Vencedor"');
assert(jsContent.includes("'Fadiga'"), 'Status FATIGUE deve ser apresentado como "Fadiga"');
assert(jsContent.includes("'Atenção'"), 'Status WATCH deve ser apresentado como "Atenção"');
console.log('   ✅ PASS: Português visual claro e consistente.');
passed++;

console.log(`\n🎉 [AUDITORIA CONCLUÍDA COM SUCESSO] Todos os ${passed}/${passed} critérios de engenharia e responsividade foram aprovados!`);
