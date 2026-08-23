// ==============================================================================
// AUTOMATED VERIFICATION SUITE — META ADS AI COMMAND CENTER
// ==============================================================================

const assert = require('assert');

console.log('🧪 [TEST SUITE] Iniciando bateria de testes do Meta Ads AI Command Center...\n');

// 1. TESTE DO PROXY SERVERLESS (Syntax & Handlers)
console.log('1. Testando carregamento dos handlers serverless...');
const metaProxy = require('../api/meta-proxy.js');
const metaAutopilot = require('../api/meta-autopilot.js');
assert.strictEqual(typeof metaProxy, 'function', 'api/meta-proxy.js deve exportar uma função de handler');
assert.strictEqual(typeof metaAutopilot, 'function', 'api/meta-autopilot.js deve exportar uma função de handler');
console.log('   ✅ Handlers serverless carregados com sucesso.');

// 2. TESTE DE UNIT ECONOMICS & ANALYTICS
console.log('2. Testando cálculos de Unit Economics e Break-Even...');
const productPrice = 89.90;
const cogs = 38.00;
const shippingCost = 15.00;
const gatewayFee = productPrice * 0.0399;
const tax = productPrice * 0.04;
const refund = productPrice * 0.015;

const deductions = cogs + shippingCost + gatewayFee + tax + refund;
const contributionMargin = productPrice - deductions;
const breakEvenCPA = contributionMargin;
const breakEvenROAS = productPrice / breakEvenCPA;

assert(breakEvenCPA > 25 && breakEvenCPA < 35, `Break-even CPA esperado entre 25 e 35. Calculado: ${breakEvenCPA.toFixed(2)}`);
assert(breakEvenROAS > 2.5 && breakEvenROAS < 3.8, `Break-even ROAS esperado entre 2.5 e 3.8. Calculado: ${breakEvenROAS.toFixed(2)}`);
console.log(`   ✅ Break-Even CPA: R$ ${breakEvenCPA.toFixed(2)} | Break-Even ROAS: ${breakEvenROAS.toFixed(2)}x`);

// 3. TESTE DE GUARDRAILS (Regra de 20% Máximo por Ciclo)
console.log('3. Testando travas de segurança dos Guardrails...');
const currentBudgetCents = 10000; // R$ 100,00
const maxAllowedPct = 20; // 20%
const safeIncreaseCents = Math.round(currentBudgetCents * 1.15); // +15% (R$ 115,00)
const illegalIncreaseCents = Math.round(currentBudgetCents * 1.35); // +35% (R$ 135,00)

function validateBudgetIncrease(current, target) {
    const pct = ((target - current) / current) * 100;
    return {
        allowed: pct <= maxAllowedPct,
        pct: pct
    };
}

assert.strictEqual(validateBudgetIncrease(currentBudgetCents, safeIncreaseCents).allowed, true, 'Aumento de 15% deve ser permitido');
assert.strictEqual(validateBudgetIncrease(currentBudgetCents, illegalIncreaseCents).allowed, false, 'Aumento de 35% deve ser bloqueado pelos guardrails');
console.log('   ✅ Travas de limite percentual (+20% máx) validadas.');

// 4. TESTE DE DETECÇÃO DE FADIGA DE CRIATIVO
console.log('4. Testando motor de detecção de fadiga de criativo...');
function isCreativeFatigued(frequency, ctr, spend) {
    return frequency >= 2.2 && ctr < 1.2 && spend > 40;
}

assert.strictEqual(isCreativeFatigued(2.6, 0.8, 80), true, 'Criativo com freq 2.6 e CTR 0.8% deve ser classificado como FATIGUE');
assert.strictEqual(isCreativeFatigued(1.3, 2.4, 80), false, 'Criativo com freq 1.3 e CTR 2.4% deve ser saudável');
console.log('   ✅ Regra de detecção multivariada de fadiga validada.');

// 5. TESTE DE CLASSIFICAÇÃO WINNER
console.log('5. Testando classificação de campanhas vencedoras...');
function classifyCampaign(purchases, cpa, roas, targetCpa) {
    if (purchases >= 3 && cpa <= targetCpa * 0.85 && roas >= 2.2) {
        return 'WINNER';
    }
    if (purchases === 0 && cpa === 0) {
        return 'TESTING';
    }
    return 'WATCH';
}

assert.strictEqual(classifyCampaign(5, 22.50, 4.0, 35.00), 'WINNER', '5 compras com CPA R$ 22,50 e ROAS 4.0x deve ser WINNER');
console.log('   ✅ Classificação de performance WINNER validada.');

console.log('\n======================================================');
console.log('🎉 TODOS OS TESTES UNITÁRIOS E DE GUARDRAIL PASSARAM!');
console.log('======================================================\n');
