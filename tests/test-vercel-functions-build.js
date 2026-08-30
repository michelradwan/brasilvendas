/**
 * VERCEL SERVERLESS FUNCTIONS & STATIC ASSETS PACKAGING AUDIT
 * Validação rigorosa de cada Serverless Function em api/ e assets estáticos.
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('📦 [VERCEL BUILD AUDIT] Iniciando validação de empacotamento das Serverless Functions...\n');

const API_DIR = path.join(__dirname, '..', 'api');
const files = fs.readdirSync(API_DIR).filter(f => f.endsWith('.js'));

const requiredFunctions = [
    'auth.js',
    'pedidos.js',
    'meta-proxy.js',
    'meta-autopilot.js',
    'tracking-gateway.js',
    'webhook.js',
    'gerar-pix.js',
    'status-pix.js',
    'si-collect.js',
    'si-query.js',
    'visitantes.js'
];

let functionsCount = 0;
for (const reqFn of requiredFunctions) {
    assert(files.includes(reqFn), `Serverless Function obrigatória ausente: api/${reqFn}`);
    const fnPath = path.join(API_DIR, reqFn);
    
    // Testa carregamento do módulo
    const handler = require(fnPath);
    assert(typeof handler === 'function', `api/${reqFn} deve exportar um handler assíncrono (Function)`);
    console.log(`  ⚡ Function Detectada: /api/${reqFn.replace('.js', '')} (Node.js 20.x Runtime)`);
    functionsCount++;
}

console.log(`\n📄 [STATIC ASSETS AUDIT] Validando assets essenciais para deploy na Vercel...`);
const staticAssets = [
    'admin-ads.html',
    'admin.html',
    'index.html',
    'vercel.json',
    'package.json',
    'assets/admin-ads.css',
    'assets/logo-radwan-ads.png',
    'assets/sounds/sale-approved.mp3',
    'js/dashboard.js',
    'js/sales-notification-engine.js',
    'js/auth-gate.js'
];

let assetsCount = 0;
for (const asset of staticAssets) {
    const assetPath = path.join(__dirname, '..', asset);
    assert(fs.existsSync(assetPath), `Asset estático obrigatório ausente: ${asset}`);
    const stat = fs.statSync(assetPath);
    console.log(`  📁 Static Asset: ${asset} (${stat.size} bytes)`);
    assetsCount++;
}

console.log(`\n========================================`);
console.log(`📊 Total Functions: ${functionsCount}/${requiredFunctions.length} OK`);
console.log(`📊 Total Static Assets: ${assetsCount}/${staticAssets.length} OK`);
console.log(`========================================\n`);
console.log('🎉 BUILD AUDIT CONCLUÍDO COM 100% DE SUCESSO (0 ERROS / 0 WARNINGS CRÍTICOS)!');
process.exit(0);
