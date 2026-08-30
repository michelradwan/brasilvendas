/**
 * RADWAN ADS — COMPREHENSIVE PREVIEW SIMULATION TEST SUITE
 * Validação exaustiva de todos os cenários exigidos para o ambiente Preview:
 * 1. Auth & Session (Login/Logout/Timing-safe/Cookie)
 * 2. Meta READ vs Meta WRITE (Preview Guard simulation)
 * 3. Autopilot Dry-Run enforcement
 * 4. Webhook Sandbox vs Production payload suppression
 * 5. Orders isolation in preview namespace
 * 6. Multi-instance Emergency Stop & Cooldown persistence
 * 7. Storage Fail-Closed mutation blocking
 */

const http = require('http');
const assert = require('assert');
const path = require('path');

// Força ambiente Preview para a suíte de testes
process.env.VERCEL = '1';
process.env.VERCEL_ENV = 'preview';
process.env.PREVIEW_MODE = 'true';
process.env.VERCEL_GIT_COMMIT_REF = 'chore_radwan_vercel_production';
process.env.ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'test-suite-admin-secret-2026';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-suite-session-secret-2026';

const authHandler = require('../api/auth.js');
const metaProxyHandler = require('../api/meta-proxy.js');
const autopilotHandler = require('../api/meta-autopilot.js');
const webhookHandler = require('../api/webhook.js');
const pedidosHandler = require('../api/pedidos.js');
const { storage, envAdapter } = require('../lib/storage-adapter.js');
const serverState = require('../lib/meta-state.js');
const authGuard = require('../lib/auth-guard.js');

console.log('🔬 [PREVIEW LIVE SIMULATION] Iniciando bateria completa de testes no Node 20...\n');

function mockReqRes(method, query = {}, body = null, headers = {}) {
    const req = {
        method,
        query,
        body,
        headers: {
            'content-type': 'application/json',
            'x-forwarded-for': '127.0.0.1',
            ...headers
        }
    };

    let statusCode = 200;
    let headersSent = {};
    let responseData = null;

    const res = {
        status(code) { statusCode = code; return this; },
        setHeader(k, v) { headersSent[k] = v; return this; },
        json(data) { responseData = data; return this; },
        end() { return this; }
    };

    return { req, res, getResult: () => ({ statusCode, headers: headersSent, body: responseData }) };
}

async function runSimulation() {
    let passed = 0;
    let total = 0;

    function step(desc, fn) {
        total++;
        try {
            fn();
            console.log(`  ✅ PASS: ${desc}`);
            passed++;
        } catch (e) {
            console.error(`  ❌ FAIL: ${desc}`);
            console.error(`     ${e.message}\n`);
        }
    }

    async function stepAsync(desc, fn) {
        total++;
        try {
            await fn();
            console.log(`  ✅ PASS: ${desc}`);
            passed++;
        } catch (e) {
            console.error(`  ❌ FAIL: ${desc}`);
            console.error(`     ${e.message}\n`);
        }
    }

    // 1. AUTH LOGIN & SESSION CREATION
    await stepAsync('1. Login com senha administrativa emite cookie radwan_session assinado', async () => {
        const { req, res, getResult } = mockReqRes('POST', { action: 'login' }, { password: process.env.ADMIN_PASSWORD });
        await authHandler(req, res);
        const result = getResult();
        assert.strictEqual(result.statusCode, 200);
        assert.strictEqual(result.body.success, true);
        assert(result.headers['Set-Cookie'].includes('radwan_session='));
        assert(result.headers['Set-Cookie'].includes('HttpOnly'));
    });

    // 2. AUTH REJECT INCORRECT PASSWORD
    await stepAsync('2. Login com senha incorreta é rejeitado com 401', async () => {
        const { req, res, getResult } = mockReqRes('POST', { action: 'login' }, { password: 'senha_incorreta_totalmente_invalida' });
        await authHandler(req, res);
        const result = getResult();
        assert.strictEqual(result.statusCode, 401);
        assert(result.body.error !== undefined, 'Deve retornar objeto de erro no payload');
    });

    // 3. META READ IN PREVIEW
    await stepAsync('3. Meta READ (GET /api/meta-proxy) permitido com sessão autenticada', async () => {
        const token = authGuard.createSessionToken();
        const { req, res, getResult } = mockReqRes('GET', { endpoint: 'act_846780837970771/campaigns' }, null, {
            cookie: `radwan_session=${token}`
        });
        await metaProxyHandler(req, res);
        const result = getResult();
        assert(result.statusCode === 200 || result.statusCode === 400 || result.body.data !== undefined, 'Deve processar requisição');
    });

    // 4. META WRITE MUTATION GUARD IN PREVIEW
    await stepAsync('4. Meta WRITE (POST status=PAUSED) interceptado com sucesso pelo Preview Guard (Zero Mutation)', async () => {
        const token = authGuard.createSessionToken();
        const { req, res, getResult } = mockReqRes('POST', {}, {
            endpoint: '120215999999999',
            method: 'POST',
            payload: { status: 'PAUSED' }
        }, {
            cookie: `radwan_session=${token}`
        });
        await metaProxyHandler(req, res);
        const result = getResult();
        assert.strictEqual(result.statusCode, 200);
        assert.strictEqual(result.body.preview_mode, true);
        assert.strictEqual(result.body.simulated, true);
        assert(result.body.message.includes('Ambiente Preview: Mutação simulada'));
    });

    // 5. AUTOPILOT DRY-RUN ENFORCEMENT IN PREVIEW
    await stepAsync('5. Autopilot Worker no Preview opera obrigatoriamente com effectiveDryRun=true', async () => {
        const { req, res, getResult } = mockReqRes('POST', {}, { mode: 'AUTOPILOT', dry_run: false }, {
            'x-cron-auth': process.env.ADMIN_PASSWORD
        });
        await autopilotHandler(req, res);
        const result = getResult();
        assert.strictEqual(result.statusCode, 200);
        assert.strictEqual(result.body.success, true);
        assert(result.body.report.preview_safety_guard.includes('Execução restrita a simulação'));
        assert.strictEqual(result.body.report.actions_taken.length, 0, 'Zero mutações reais podem ser aplicadas no Preview');
    });

    // 6. WEBHOOK PRODUCTION PAYLOAD SUPPRESSION IN PREVIEW
    await stepAsync('6. Webhook com payload real de Produção é suprimido no Preview (Zero CAPI)', async () => {
        const { req, res, getResult } = mockReqRes('POST', {}, {
            transaction_id: 'REAL_PROD_PAYMENT_999',
            status: 'approved',
            amount: 89.90
        });
        await webhookHandler(req, res);
        const result = getResult();
        assert.strictEqual(result.statusCode, 200);
        assert.strictEqual(result.body.preview_mode, true);
        assert.strictEqual(result.body.skipped, true);
        assert(result.body.message.includes('Webhook de produção real ignorado com segurança'));
    });

    // 7. WEBHOOK SANDBOX TEST EVENT IN PREVIEW
    await stepAsync('7. Webhook de teste sandbox (TEST_*) é processado no namespace Preview', async () => {
        const { req, res, getResult } = mockReqRes('POST', {}, {
            transaction_id: 'TEST_PREVIEW_TX_001',
            status: 'approved',
            amount: 89.90,
            sandbox: true
        });
        await webhookHandler(req, res);
        const result = getResult();
        assert.strictEqual(result.statusCode, 200);
        assert.strictEqual(result.body.success, true);
    });

    // 8. ORDERS NAMESPACE ISOLATION
    await stepAsync('8. Pedidos salvos utilizam o prefixo de namespace radwan:preview:...', async () => {
        const ns = envAdapter.getNamespace();
        assert(ns.startsWith('radwan:preview:'), `Namespace deve ser de Preview, atual: ${ns}`);
        await storage.set('actions', 'ORDER_TEST_ISOLATION_99', { result: { transaction_id: 'TEST_ISOLATION_99', status: 'PENDENTE' } });
        const saved = await storage.get('actions', 'ORDER_TEST_ISOLATION_99');
        assert(saved !== null, 'Pedido de teste deve ser recuperável no namespace Preview');
    });

    // 9. MULTI-INSTANCE EMERGENCY STOP PERSISTENCE
    await stepAsync('9. Emergency Stop persistente: Ativação bloqueia execuções subsequentes', async () => {
        await serverState.setEmergencyStop(true);
        const isStopped = await serverState.isEmergencyStoppedAsync();
        assert.strictEqual(isStopped, true, 'Emergency stop deve persistir como true');

        // Tenta mutação
        const token = authGuard.createSessionToken();
        const { req, res, getResult } = mockReqRes('POST', {}, {
            endpoint: '120215999999999',
            method: 'POST',
            payload: { status: 'ACTIVE' }
        }, {
            cookie: `radwan_session=${token}`
        });
        await metaProxyHandler(req, res);
        const result = getResult();
        assert.strictEqual(result.statusCode, 403);
        assert.strictEqual(result.body.error.type, 'EMERGENCY_STOP_ACTIVE');

        // Restaura
        await serverState.setEmergencyStop(false);
    });

    // 10. MULTI-INSTANCE COOLDOWN PERSISTENCE
    await stepAsync('10. Cooldown persistente: Campanha em cooldown é bloqueada para novo aumento', async () => {
        const testCampId = '120215999999999';
        await serverState.setCooldown(testCampId);
        const cooldownCheck = await serverState.isUnderCooldown(testCampId, 12);
        assert.strictEqual(cooldownCheck.underCooldown, true);
        assert(Number(cooldownCheck.remainingHours) > 11.5);
    });

    // 11. STORAGE FAIL-CLOSED POLICY
    await stepAsync('11. Fail-Closed Policy: Se storage estiver indisponível em Produção, mutações são bloqueadas', async () => {
        // Simula storage indisponível
        const origCheck = envAdapter.isAvailableForMutations;
        envAdapter.isAvailableForMutations = () => false;

        const token = authGuard.createSessionToken();
        const { req, res, getResult } = mockReqRes('POST', {}, {
            endpoint: '120215999999999',
            method: 'POST',
            payload: { status: 'ACTIVE' }
        }, {
            cookie: `radwan_session=${token}`
        });
        await metaProxyHandler(req, res);
        const result = getResult();
        assert.strictEqual(result.statusCode, 503);
        assert.strictEqual(result.body.error.type, 'STORAGE_UNAVAILABLE_FAIL_CLOSED');

        // Restaura
        envAdapter.isAvailableForMutations = origCheck;
    });

    console.log(`\n========================================`);
    console.log(`📊 Resultado da Simulação Preview: ${passed}/${total} PASS`);
    console.log(`========================================\n`);

    if (passed === total) {
        console.log('🎉 TODOS OS CENÁRIOS DO PREVIEW FORAM VALIDADOS COM 100% DE SUCESSO!');
        process.exit(0);
    } else {
        console.error('⚠️ ALGUNS CENÁRIOS FALHARAM. CORRIJA ANTES DE PROSSEGUIR.');
        process.exit(1);
    }
}

runSimulation();
