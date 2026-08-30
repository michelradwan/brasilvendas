// ==============================================================================
// TESTE DE CONFORMIDADE DO BOTÃO DE LUXO "INICIAR RADWAN"
// ==============================================================================

const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('💎 Validando Fidelidade e Camadas de Luxo do Botão INICIAR RADWAN...\n');

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

test('1. Elemento <button> nativo acessível com aria-label e texto exato', () => {
    assert(htmlCode.includes('id="btn-start-radwan"'), 'ID btn-start-radwan ausente no HTML');
    assert(htmlCode.includes('class="radwan-launch-btn"'), 'Classe radwan-launch-btn ausente');
    assert(htmlCode.includes('aria-label="Iniciar RADWAN"'), 'aria-label ausente');
    assert(htmlCode.includes('INICIAR RADWAN'), 'Texto INICIAR RADWAN ausente');
});

test('2. Presença das 10 Camadas de Hardware & Vidro Escuro no HTML', () => {
    assert(htmlCode.includes('radwan-launch-glow'), 'Falta camada de Glow');
    assert(htmlCode.includes('radwan-launch-hotspot hotspot-top'), 'Falta Hotspot Superior');
    assert(htmlCode.includes('radwan-launch-hotspot hotspot-bottom'), 'Falta Hotspot Inferior');
    assert(htmlCode.includes('radwan-launch-rim'), 'Falta Moldura Metálica Interna (Inner Rim)');
    assert(htmlCode.includes('radwan-launch-shine'), 'Falta Reflexo Diagonal Glass');
    assert(htmlCode.includes('radwan-launch-scan'), 'Falta Linha de Scan Subliminar');
    assert(htmlCode.includes('radwan-launch-label'), 'Falta Label Tipográfico');
});

test('3. CSS do Botão com Raio de 36px, Radial Gradient Escuro e Borda Vermelha #FF2035', () => {
    assert(cssCode.includes('border-radius: 36px;'), 'border-radius deve ser 36px');
    assert(cssCode.includes('rgba(255, 32, 53,'), 'Cor base vermelha #FF2035 presente');
    assert(cssCode.includes('radial-gradient'), 'Fundo com múltiplas camadas de gradient');
    assert(cssCode.includes('clamp('), 'Responsividade clamp presente');
});

test('4. Hotspots com gradiente do branco ao vermelho com drop-shadow de neon', () => {
    assert(cssCode.includes('linear-gradient(90deg, transparent 0%, #FF1F32 25%, #FFFFFF 50%, #FF1F32 75%, transparent 100%)'), 'Gradiente com ponto branco centralizado no hotspot');
    assert(cssCode.includes('filter: drop-shadow(0 0 6px #FF2035)'), 'Filtro drop-shadow nos hotspots');
});

test('5. Microinterações Hover, Active e Animação de Flash ao Clicar', () => {
    assert(cssCode.includes('.radwan-launch-btn:hover'), 'Regras de hover presentes');
    assert(cssCode.includes('.radwan-launch-btn:active'), 'Regras de active presentes');
    assert(cssCode.includes('@keyframes launch-flash'), 'Keyframe launch-flash presente');
});

console.log(`\n========================================`);
console.log(`📊 Resultado dos Testes: ${passed}/${total} PASS`);
console.log(`========================================\n`);

if (passed === total) {
    console.log('🎉 BOTÃO INICIAR RADWAN VALIDADO COM 100% DE SUCESSO!');
    process.exit(0);
} else {
    process.exit(1);
}
