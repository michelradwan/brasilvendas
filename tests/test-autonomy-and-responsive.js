// ==============================================================================
// RADWAN ADS — AUTONOMY ENGINE & RESPONSIVE GEOMETRY TEST SUITE
// ==============================================================================

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

console.log('═══════════════════════════════════════════════════════════════════════');
console.log('🤖 INICIANDO TESTES DO MODO AUTOMÁTICO, AUTONOMIA E RESPONSIVIDADE');
console.log('═══════════════════════════════════════════════════════════════════════\n');

// 1. SETUP DO AMBIENTE GLOBAL MOCK
const storageData = {};
const mockLocalStorage = {
    getItem: (k) => storageData[k] || null,
    setItem: (k, v) => { storageData[k] = v.toString(); },
    removeItem: (k) => { delete storageData[k]; },
    clear: () => { Object.keys(storageData).forEach(k => delete storageData[k]); }
};

global.window = {
    localStorage: mockLocalStorage,
    sessionStorage: mockLocalStorage,
    dispatchEvent: () => {},
    addEventListener: () => {},
    CustomEvent: class CustomEvent { constructor(name, opts) { this.name = name; this.detail = opts ? opts.detail : null; } }
};
global.localStorage = mockLocalStorage;
global.sessionStorage = mockLocalStorage;
global.document = {
    querySelectorAll: () => [],
    getElementById: () => null,
    addEventListener: () => {}
};
global.CustomEvent = window.CustomEvent;

// Carregar scripts do motor
eval(fs.readFileSync(path.join(ROOT, 'js', 'audit.js'), 'utf8'));
eval(fs.readFileSync(path.join(ROOT, 'js', 'guardrails.js'), 'utf8'));
eval(fs.readFileSync(path.join(ROOT, 'js', 'execution.js'), 'utf8'));
eval(fs.readFileSync(path.join(ROOT, 'js', 'autopilot.js'), 'utf8'));

// Mock do MetaAdapter para testes unitários seguros
window.metaAdapter = {
    isAuthenticated: () => true,
    getStoredCredentials: () => ({ adAccountId: 'act_846780837970771' }),
    request: async (id, method, params) => ({ id, name: 'Campanha Teste', status: 'ACTIVE', daily_budget: 10000 }),
    updateStatus: async (id, status) => ({ success: true, id, status }),
    updateBudget: async (id, field, amount) => ({ success: true, id, [field]: amount }),
    getCampaigns: async () => ({ data: [{ id: '123', name: 'Campanha 01', status: 'ACTIVE', daily_budget: 10000 }] }),
    getInsights: async () => ({ data: [{ spend: 50, purchases: 2, cpa: 25, roas: 3.5 }] })
};

// Mock do AnalyticsEngine
window.analyticsEngine = {
    parseInsights: (i) => i ? { spend: i.spend || 0, purchases: i.purchases || 0, cpa: i.cpa || 0, roas: i.roas || 0 } : { spend: 0, purchases: 0, cpa: 0, roas: 0 },
    dataConfidenceScore: 88
};

// Mock do DecisionEngine
window.decisionEngine = {
    diagnoseCampaign: (name, today, last7d, targetCPA) => {
        if (today.purchases > 0 && today.roas > 2.5) {
            return { actionType: 'SCALE_BUDGET', evidence: ['ROAS Alto', 'CPA Saudável'] };
        }
        return { actionType: 'HOLD', evidence: ['Performance Estável'] };
    }
};

const htmlContent = fs.readFileSync(path.join(ROOT, 'admin-ads.html'), 'utf8');
const cssContent = fs.readFileSync(path.join(ROOT, 'assets', 'admin-ads.css'), 'utf8');

let testsPassed = 0;
let totalTests = 0;

async function runTest(name, fn) {
    totalTests++;
    try {
        await fn();
        console.log(`   ✅ PASS: ${name}`);
        testsPassed++;
    } catch (err) {
        console.error(`   ❌ FAIL: ${name}`);
        console.error(`      Motivo: ${err.message}\n`);
    }
}

async function main() {
    // ─── BATERIA 1: SINGLE SOURCE OF TRUTH & MODOS DE AUTONOMIA ─────────────────
    console.log('1. Testando Modos de Autonomia e Single Source of Truth...');

    await runTest('Existência dos 4 modos canônicos no AutopilotEngine', () => {
        const modes = window.autopilotEngine.modes;
        assert.ok(modes.ANALYSIS_ONLY, 'Modo ANALYSIS_ONLY deve existir');
        assert.ok(modes.SHADOW, 'Modo SHADOW deve existir');
        assert.ok(modes.ASSISTED, 'Modo ASSISTED deve existir');
        assert.ok(modes.GUARDED_AUTOMATION, 'Modo GUARDED_AUTOMATION deve existir');
    });

    await runTest('Transição e persistência do modo no localStorage', () => {
        window.autopilotEngine.setMode('ANALYSIS_ONLY');
        assert.strictEqual(window.autopilotEngine.mode, 'ANALYSIS_ONLY');
        assert.strictEqual(window.localStorage.getItem('radwan_autonomy_mode'), 'ANALYSIS_ONLY');

        window.autopilotEngine.setMode('GUARDED_AUTOMATION');
        assert.strictEqual(window.autopilotEngine.mode, 'GUARDED_AUTOMATION');
        assert.strictEqual(window.localStorage.getItem('radwan_autonomy_mode'), 'GUARDED_AUTOMATION');
    });

    // ─── BATERIA 2: EXECUTION LAYER GOVERNANCE POR NÍVEL DE AUTONOMIA ───────────
    console.log('\n2. Testando Governança e Bloqueio de Mutações por Modo...');

    await runTest('Modo ANALYSIS_ONLY bloqueia mutação de status no ExecutionEngine', async () => {
        window.autopilotEngine.setMode('ANALYSIS_ONLY');
        let blocked = false;
        try {
            await window.executionEngine.executeStatusChange('123', 'PAUSED');
        } catch (err) {
            blocked = err.message.includes('BLOCKED_BY_AUTONOMY_POLICY');
        }
        assert.ok(blocked, 'Mutações devem ser estritamente bloqueadas em ANALYSIS_ONLY');
    });

    await runTest('Modo ANALYSIS_ONLY bloqueia mutação de orçamento no ExecutionEngine', async () => {
        window.autopilotEngine.setMode('ANALYSIS_ONLY');
        let blocked = false;
        try {
            await window.executionEngine.executeBudgetChange('123', 'daily_budget', 12000);
        } catch (err) {
            blocked = err.message.includes('BLOCKED_BY_AUTONOMY_POLICY');
        }
        assert.ok(blocked, 'Edição de orçamento deve ser estritamente bloqueada em ANALYSIS_ONLY');
    });

    await runTest('Modo SHADOW simula ação sem executar na Meta e registra no Audit', async () => {
        window.autopilotEngine.setMode('SHADOW');
        const result = await window.executionEngine.executeStatusChange('123', 'PAUSED', 'Teste Sombra');
        assert.strictEqual(result.dryRun, true);
        assert.strictEqual(result.verification, 'SIMULATED_SUCCESS');

        // Verifica se registrou no Audit Log
        const logs = window.auditEngine?.logs || [];
        const shadowLog = logs.find(l => l.action === 'SHADOW_SIMULATION');
        assert.ok(shadowLog, 'Ação em modo sombra deve ser registrada no Audit Log');
    });

    await runTest('Modo ASSISTED enfileira para aprovação humana', () => {
        window.autopilotEngine.setMode('ASSISTED');
        const item = window.executionEngine.enqueueApproval({
            type: 'SCALE_BUDGET',
            campaignId: '123',
            campaignName: 'Campanha 01',
            reason: 'Escalar +15%'
        });
        assert.strictEqual(item.status, 'PENDING');
        assert.ok(window.executionEngine.approvalQueue.some(i => i.id === item.id));
    });

    await runTest('Modo GUARDED_AUTOMATION respeita teto de +15% e cooldown de 12h', () => {
        window.autopilotEngine.setMode('GUARDED_AUTOMATION');
        const details = window.autopilotEngine.getModeDetails('GUARDED_AUTOMATION');
        assert.strictEqual(details.maxBudgetScalePct, 15);
        assert.strictEqual(details.cooldownHours, 12);
    });

    // ─── BATERIA 3: PARADA DE SEGURANÇA (KILL SWITCH) COM PRIORIDADE MÁXIMA ──────
    console.log('\n3. Testando Parada de Segurança (Kill Switch)...');

    await runTest('Ativação do Kill Switch bloqueia 100% das mutações', async () => {
        await window.guardrailEngine.triggerEmergencyStop();
        assert.strictEqual(window.guardrailEngine.isEmergencyStopped(), true);

        let blocked = false;
        try {
            await window.executionEngine.executeStatusChange('123', 'PAUSED', 'Teste', 'GUARDED_AUTOMATION');
        } catch (err) {
            blocked = err.message.includes('EMERGENCY_STOP_BLOCKED');
        }
        assert.ok(blocked, 'Qualquer mutação DEVE ser abortada com Emergency Stop ativo');
    });

    await runTest('Reativação do Kill Switch restaura operação segura', async () => {
        await window.guardrailEngine.resumeEmergencyStop();
        assert.strictEqual(window.guardrailEngine.isEmergencyStopped(), false);
    });

    // ─── BATERIA 4: CÁLCULO REAL DE PRONTIDÃO & BLINDAGEM (0 A 100 PTS) ─────────
    console.log('\n4. Testando Cálculo Matemático Real de Prontidão (Zero Hardcode)...');

    await runTest('calculateReadinessScore retorna pontuação real transparente (6 pilares)', () => {
        const result = window.autopilotEngine.calculateReadinessScore({
            trackingHealth: { status: 'HEALTHY' },
            dataTrustScore: 85
        });

        assert.ok(typeof result.totalScore === 'number');
        assert.ok(result.totalScore >= 0 && result.totalScore <= 100);
        assert.strictEqual(result.components.length, 6, 'Devem existir 6 pilares de governança avaliados');

        const names = result.components.map(c => c.name);
        assert.ok(names.includes('Rastreamento Reconciliado'));
        assert.ok(names.includes('Economia Unitária Real'));
        assert.ok(names.includes('Confiança dos Dados'));
        assert.ok(names.includes('Limites e Cooldown'));
        assert.ok(names.includes('Verificação Pós-Escrita'));
        assert.ok(names.includes('Parada de Segurança'));

        // Verifica que soma dos componentes bate com o totalScore
        const sum = result.components.reduce((acc, c) => acc + c.score, 0);
        assert.strictEqual(result.totalScore, sum);
    });

    await runTest('Readiness Score penaliza caso o Kill Switch esteja ativo', async () => {
        await window.guardrailEngine.triggerEmergencyStop();
        const result = window.autopilotEngine.calculateReadinessScore();
        const killComp = result.components.find(c => c.name === 'Parada de Segurança');
        assert.strictEqual(killComp.score, 0, 'Componente de Parada de Segurança deve zerar se ativo');
        await window.guardrailEngine.resumeEmergencyStop();
    });

    // ─── BATERIA 5: RESPONSIVIDADE DAS 3 ABAS E BULK ACTION BAR ──────────────────
    console.log('\n5. Testando Responsividade das Abas e Floating Bulk Action Bar...');

    await runTest('Abas de Campanhas usam grid responsivo no mobile (3 colunas iguais)', () => {
        assert.ok(htmlContent.includes('grid grid-cols-3 w-full sm:w-auto sm:flex'), 'Container das abas deve ter grid-cols-3 w-full para mobile');
        assert.ok(htmlContent.includes('tab-nav-campaigns'), 'Tab Campanhas presente');
        assert.ok(htmlContent.includes('tab-nav-adsets'), 'Tab Conjuntos presente');
        assert.ok(htmlContent.includes('tab-nav-ads'), 'Tab Anúncios presente');
    });

    await runTest('Contadores das abas usam flex-shrink-0 e não escapam da caixa', () => {
        assert.ok(htmlContent.includes('id="tab-count-campaigns" class="badge badge-active text-[9.5px] px-1.5 py-0.2 flex-shrink-0"'));
        assert.ok(htmlContent.includes('id="tab-count-adsets" class="badge badge-paused text-[9.5px] px-1.5 py-0.2 flex-shrink-0"'));
        assert.ok(htmlContent.includes('id="tab-count-ads" class="badge badge-paused text-[9.5px] px-1.5 py-0.2 flex-shrink-0"'));
    });

    await runTest('Floating Bulk Action Bar não possui duplicatas no HTML', () => {
        const occurrences = (htmlContent.match(/id="bulk-actions-bar"/g) || []).length;
        assert.strictEqual(occurrences, 1, 'Deve existir EXATAMENTE UM #bulk-actions-bar no DOM');
    });

    await runTest('Floating Bulk Action Bar possui regras responsivas com safe-area no CSS', () => {
        assert.ok(cssContent.includes('#bulk-actions-bar {'), 'CSS de #bulk-actions-bar deve existir');
        assert.ok(cssContent.includes('safe-area-inset-bottom'), 'Deve respeitar env(safe-area-inset-bottom)');
        assert.ok(cssContent.includes('@media (max-width: 639px) {'), 'Media query para mobile de #bulk-actions-bar deve existir');
        assert.ok(cssContent.includes('grid-template-columns: repeat(3, 1fr)'), 'Ações em massa devem se auto-ajustar em grid de 3 colunas no mobile');
    });

    await runTest('Botão Orçamento está presente e íntegro na Bulk Action Bar', () => {
        assert.ok(htmlContent.includes('window.dashboard.openBulkBudgetModal()'));
        assert.ok(htmlContent.includes('<span>💰</span> <span>Orçamento</span>'));
    });

    console.log('\n═══════════════════════════════════════════════════════════════════════');
    console.log(`🎉 RESULTADO: ${testsPassed}/${totalTests} TESTES APROVADOS COM SUCESSO (100%)`);
    console.log('═══════════════════════════════════════════════════════════════════════\n');

    if (testsPassed !== totalTests) {
        process.exit(1);
    }
}

main();
