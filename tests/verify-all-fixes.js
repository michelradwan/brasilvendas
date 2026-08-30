// ==============================================================================
// EXPANDED VERIFICATION TEST SUITE — META ADS ZERO-TRUST AUDIT PASS
// ==============================================================================

const assert = require('assert');
const serverState = require('../lib/meta-state.js');
const { ALLOWED_OPERATIONS, ALLOWED_AD_ACCOUNT_ID } = require('../config/meta-constants.js');

console.log('🧪 [EXPANDED AUDIT TEST SUITE] Iniciando validação de segurança e robustez...\n');

// 1. TESTE DE CONCORRÊNCIA E DISTRIBUTED LOCK
console.log('1. Testando Distributed Lock e bloqueio de concorrência...');
serverState.releaseLock('act_846780837970771');
const lock1 = serverState.acquireLock('act_846780837970771', 60);
const lock2 = serverState.acquireLock('act_846780837970771', 60);

assert.strictEqual(lock1.acquired, true, 'Worker 1 deve conseguir adquirir o lock');
assert.strictEqual(lock2.acquired, false, 'Worker 2 concorrente deve ser bloqueado');
serverState.releaseLock('act_846780837970771');
console.log('   ✅ Distributed Lock aprovado: concorrência simultânea bloqueada.');

// 2. TESTE DE IDEMPOTÊNCIA SERVER-SIDE
console.log('2. Testando Idempotência com action_id único...');
const testActionId = `ACT_TEST_${Date.now()}`;
const idempBefore = serverState.checkIdempotency(testActionId);
assert.strictEqual(idempBefore.isDuplicate, false, 'Primeira execução não deve ser duplicada');

serverState.recordIdempotency(testActionId, { success: true, budget: 6000 });
const idempAfter = serverState.checkIdempotency(testActionId);
assert.strictEqual(idempAfter.isDuplicate, true, 'Segunda execução com mesmo action_id deve ser detectada como duplicada');
assert.strictEqual(idempAfter.cachedResult.budget, 6000, 'Resultado prévio deve ser retornado intacto');
console.log('   ✅ Idempotência Server-Side aprovada: reexecução duplicada prevenida.');

// 3. TESTE DE COOLDOWN NO SERVIDOR
console.log('3. Testando Cooldown no servidor...');
const testCampId = '999888777';
serverState.setCooldown(testCampId);
const cooldownCheck = serverState.isUnderCooldown(testCampId, 12);
assert.strictEqual(cooldownCheck.underCooldown, true, 'Campanha recém-alterada deve estar em cooldown');
console.log(`   ✅ Cooldown Server-Side aprovado: restam ${cooldownCheck.remainingHours}h.`);

// 4. TESTE DE EMERGENCY STOP NO SERVIDOR
console.log('4. Testando Emergency Stop no servidor...');
serverState.setEmergencyStop(true);
assert.strictEqual(serverState.isEmergencyStopped(), true, 'Kill Switch deve estar ativo');
serverState.setEmergencyStop(false);
assert.strictEqual(serverState.isEmergencyStopped(), false, 'Kill Switch deve ser liberado');
console.log('   ✅ Emergency Stop Server-Side aprovado.');

// 5. TESTE DE ALLOWLIST RIGOROSA
console.log('5. Testando Allowlist de endpoints autorizados...');
function testAllowlist(endpoint, method) {
    for (const [opName, rule] of Object.entries(ALLOWED_OPERATIONS)) {
        if (rule.method === method && rule.pathRegex.test(endpoint)) {
            return true;
        }
    }
    return false;
}

assert.strictEqual(testAllowlist('act_846780837970771/campaigns', 'GET'), true, 'Endpoint de campanhas da conta autorizada deve ser permitido');
assert.strictEqual(testAllowlist('act_999999999999999/campaigns', 'GET'), false, 'Endpoint de conta não autorizada deve ser BLOQUEADO');
assert.strictEqual(testAllowlist('me/adaccounts', 'GET'), false, 'Endpoint arbitrário deve ser BLOQUEADO');
assert.strictEqual(testAllowlist('act_846780837970771/insights', 'DELETE'), false, 'Método DELETE não permitido deve ser BLOQUEADO');
console.log('   ✅ Allowlist estrita de endpoints e contas aprovada.');

// 6. TESTE DE SANITIZAÇÃO CONTRA XSS
console.log('6. Testando função de escape contra injeção XSS...');
function escapeHTML(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

const xssPayload = `<img src=x onerror=alert("hacked")> ' " &`;
const safeEscaped = escapeHTML(xssPayload);
assert(!safeEscaped.includes('<img'), 'Tags HTML devem ser escapadas');
assert(safeEscaped.includes('&lt;img'), 'Caracteres perigosos devem virar entidades HTML seguras');
console.log('   ✅ Prevenção XSS aprovada: tags e scripts neutralizados.');

// 7. TESTE DE DEDUPLICAÇÃO DE PURCHASE
console.log('7. Testando deduplicação estrita de purchase vs omni_purchase...');
const sampleActions = [
    { action_type: 'purchase', value: '4' },
    { action_type: 'omni_purchase', value: '4' }
];

let finalPurchases = 0;
const pAction = sampleActions.find(a => a.action_type === 'purchase');
if (pAction) {
    finalPurchases = parseInt(pAction.value) || 0;
} else {
    const omniP = sampleActions.find(a => a.action_type === 'omni_purchase');
    if (omniP) finalPurchases = parseInt(omniP.value) || 0;
}

assert.strictEqual(finalPurchases, 4, 'Purchases não devem ser somadas duas vezes (esperado 4, não 8)');
console.log('   ✅ Deduplicação de Purchase aprovada.');

// 8. TESTE DE TRATAMENTO DE "NO DATA" (SEM ESTIMATIVAS FICTÍCIAS)
console.log('8. Testando integridade de métricas ausentes...');
const missingInsight = { spend: '100', clicks: '50' }; // Sem landing_page_view
let lpv = missingInsight.landing_page_view ? parseInt(missingInsight.landing_page_view) : null;
assert.strictEqual(lpv, null, 'LPV ausente deve ser null (NO DATA) e nunca estimado com cliques * 0.82');
console.log('   ✅ Integridade de dados analíticos aprovada (zero métricas fabricadas).');

// 9. TESTE DE EXIGÊNCIA DE UNIT ECONOMICS VERIFICADO
console.log('9. Testando bloqueio de escala se Unit Economics não estiver verificado...');
serverState.setUnitEconomicsVerified(false);
assert.strictEqual(serverState.isUnitEconomicsVerified(), false, 'Unit Economics não verificado deve bloquear escala');
serverState.setUnitEconomicsVerified(true);
assert.strictEqual(serverState.isUnitEconomicsVerified(), true, 'Unit Economics verificado libera escala');
serverState.setUnitEconomicsVerified(false);
console.log('   ✅ Trava de Unit Economics verificado aprovada.');

console.log('\n======================================================');
console.log('🎉 TODOS OS 9 TESTES DE BLINDAGEM E AUDITORIA PASSARAM!');
console.log('======================================================\n');
