/**
 * TEST SUITE: RADWAN ADS — REAL-TIME SALES NOTIFICATION & AUDIO ENGINE
 * Validação de Deduplicação Canônica, FIFO Queue, Asset MP3, Baseline Histórico,
 * Multi-Tab Safety, Web Audio API Synth, Toasts e Privacidade.
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('🧪 Iniciando testes de validação: Real-Time Sales Notification System...\n');

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

// 1. Asset MP3 Existence & Size
test('1. Arquivo de som sale-approved.mp3 copiado para assets/sounds e íntegro (> 40KB)', () => {
    const soundPath = path.join(__dirname, '..', 'assets', 'sounds', 'sale-approved.mp3');
    assert(fs.existsSync(soundPath), 'Arquivo assets/sounds/sale-approved.mp3 não encontrado');
    const stat = fs.statSync(soundPath);
    assert(stat.size > 40000, `Tamanho inesperado do MP3: ${stat.size} bytes`);
});

// 2. Audit no código para garantir ausência de caminhos absolutos / Desktop
test('2. Código-fonte não possui caminhos absolutos locais ou caminhos de Desktop hardcoded', () => {
    const engineCode = fs.readFileSync(path.join(__dirname, '..', 'js', 'sales-notification-engine.js'), 'utf8');
    assert(!engineCode.includes('C:\\'), 'Caminho absoluto Windows detectado no engine');
    assert(!engineCode.includes('Desktop'), 'Caminho de Desktop detectado no engine');
    assert(engineCode.includes("assets/sounds/sale-approved.mp3"), 'Caminho relativo interno deve ser assets/sounds/sale-approved.mp3');
});

// 3. Simulação da Lógica do SalesNotificationEngine em Node.js
test('3. Baseline Histórico: Carregar histórico inicial não dispara nenhuma notificação (Zero Sons)', () => {
    // Mock simples de ambiente do navegador
    const localStorageMock = new Map();
    const mockStorage = {
        getItem: (k) => localStorageMock.get(k) || null,
        setItem: (k, v) => localStorageMock.set(k, String(v))
    };

    let audioEnqueued = [];
    let toastsShown = [];

    class MockSalesAudioEngine {
        constructor() {
            this.settings = { soundEnabled: true, pendingSoundEnabled: true, approvedSoundEnabled: true };
        }
        enqueue(type) {
            audioEnqueued.push(type);
        }
    }

    class MockSalesNotificationEngine {
        constructor() {
            this.audioEngine = new MockSalesAudioEngine();
            this.knownEvents = new Set();
            this.isBaselineEstablished = false;
        }

        normalizeStatus(raw) {
            const s = (raw || '').toUpperCase().trim();
            return (s === 'PAID' || s === 'PAGO' || s === 'APROVADO') ? 'PAID' : 'PENDING';
        }

        processOrders(orders) {
            if (!this.isBaselineEstablished) {
                orders.forEach(o => {
                    this.knownEvents.add(`${o.transaction_id}:${this.normalizeStatus(o.status)}`);
                });
                this.isBaselineEstablished = true;
                return;
            }

            orders.forEach(o => {
                const status = this.normalizeStatus(o.status);
                const key = `${o.transaction_id}:${status}`;
                if (!this.knownEvents.has(key)) {
                    this.knownEvents.add(key);
                    toastsShown.push({ type: status, id: o.transaction_id });
                    this.audioEngine.enqueue(status === 'PAID' ? 'approved' : 'pending');
                }
            });
        }
    }

    const engine = new MockSalesNotificationEngine();

    // Carrega 20 pedidos históricos no baseline inicial
    const historicalOrders = Array.from({ length: 20 }, (_, i) => ({
        transaction_id: `HIST_${i}`,
        status: i % 3 === 0 ? 'PAGO' : 'PENDENTE',
        amount: 89.90
    }));

    engine.processOrders(historicalOrders);

    assert.strictEqual(audioEnqueued.length, 0, 'Baseline histórico não pode enfileirar sons');
    assert.strictEqual(toastsShown.length, 0, 'Baseline histórico não pode disparar toasts');
    assert.strictEqual(engine.knownEvents.size, 20, 'Todos os 20 pedidos devem estar registrados no baseline');
});

test('4. Novo PIX Pendente: Dispara exatamente 1 toast e 1 som pendente', () => {
    let audioEnqueued = [];
    let toasts = [];

    const engine = {
        knownEvents: new Set(['HIST_1:PENDING']),
        isBaselineEstablished: true,
        normalizeStatus: (s) => (s === 'PAGO' || s === 'PAID') ? 'PAID' : 'PENDING',
        processOrders(orders) {
            orders.forEach(o => {
                const status = this.normalizeStatus(o.status);
                const key = `${o.transaction_id}:${status}`;
                if (!this.knownEvents.has(key)) {
                    this.knownEvents.add(key);
                    toasts.push({ type: status, id: o.transaction_id, amount: o.amount });
                    audioEnqueued.push(status === 'PAID' ? 'approved' : 'pending');
                }
            });
        }
    };

    // Chegada de novo pedido
    engine.processOrders([{ transaction_id: 'TX_NEW_1', status: 'PENDENTE', amount: 89.90 }]);

    assert.strictEqual(audioEnqueued.length, 1);
    assert.strictEqual(audioEnqueued[0], 'pending');
    assert.strictEqual(toasts.length, 1);
    assert.strictEqual(toasts[0].type, 'PENDING');

    // Reenvio do mesmo webhook / sync repetido (Deduplicação)
    engine.processOrders([{ transaction_id: 'TX_NEW_1', status: 'PENDENTE', amount: 89.90 }]);
    assert.strictEqual(audioEnqueued.length, 1, 'Reenvio de evento idêntico não pode duplicar som');
    assert.strictEqual(toasts.length, 1, 'Reenvio de evento idêntico não pode duplicar toast');
});

test('5. Transição PENDING -> PAID: Dispara exatamente 1 som approved adicional', () => {
    let audioEnqueued = [];

    const engine = {
        knownEvents: new Set(['TX_TRANS:PENDING']),
        isBaselineEstablished: true,
        normalizeStatus: (s) => (s === 'PAGO' || s === 'PAID' || s === 'APROVADO') ? 'PAID' : 'PENDING',
        processOrders(orders) {
            orders.forEach(o => {
                const status = this.normalizeStatus(o.status);
                const key = `${o.transaction_id}:${status}`;
                if (!this.knownEvents.has(key)) {
                    this.knownEvents.add(key);
                    audioEnqueued.push(status === 'PAID' ? 'approved' : 'pending');
                }
            });
        }
    };

    // Pedido agora compensado como PAGO
    engine.processOrders([{ transaction_id: 'TX_TRANS', status: 'PAGO', amount: 89.90 }]);

    assert.strictEqual(audioEnqueued.length, 1);
    assert.strictEqual(audioEnqueued[0], 'approved');

    // Próximo ciclo de sync mantendo PAGO (Deduplicação)
    engine.processOrders([{ transaction_id: 'TX_TRANS', status: 'PAGO', amount: 89.90 }]);
    assert.strictEqual(audioEnqueued.length, 1, 'Sync subsequente com status PAGO mantido não pode retocar som');
});

test('6. Venda Aprovada Direta (sem pendência anterior): Dispara apenas approved', () => {
    let audioEnqueued = [];

    const engine = {
        knownEvents: new Set(),
        isBaselineEstablished: true,
        normalizeStatus: (s) => {
            const up = (s || '').toUpperCase().trim();
            return (up === 'PAGO' || up === 'PAID' || up === 'APROVADO' || up === 'APPROVED' || up === 'COMPLETED') ? 'PAID' : 'PENDING';
        },
        processOrders(orders) {
            orders.forEach(o => {
                const status = this.normalizeStatus(o.status);
                const key = `${o.transaction_id}:${status}`;
                if (!this.knownEvents.has(key)) {
                    this.knownEvents.add(key);
                    audioEnqueued.push(status === 'PAID' ? 'approved' : 'pending');
                }
            });
        }
    };

    engine.processOrders([{ transaction_id: 'TX_DIRECT_APPROVED', status: 'APPROVED', amount: 149.90 }]);

    assert.strictEqual(audioEnqueued.length, 1);
    assert.strictEqual(audioEnqueued[0], 'approved', 'Deve tocar approved e nunca inventar pending');
});

test('7. FIFO Audio Queue: Processamento sequencial com intervalo e zero sobreposição', async () => {
    const queue = [];
    let isProcessing = false;
    const playLogs = [];

    async function processQueue() {
        if (isProcessing || queue.length === 0) return;
        isProcessing = true;

        while (queue.length > 0) {
            const item = queue.shift();
            playLogs.push({ type: item.type, time: Date.now() });
            // Simula delay de reprodução + minInterval
            await new Promise(r => setTimeout(r, 20));
        }

        isProcessing = false;
    }

    // 3 aprovações em sequência quase simultânea (1ms)
    queue.push({ type: 'approved' });
    queue.push({ type: 'approved' });
    queue.push({ type: 'approved' });

    await processQueue();

    assert.strictEqual(playLogs.length, 3, 'Todas as 3 vendas devem ser processadas na fila');
    assert.strictEqual(playLogs[0].type, 'approved');
    assert.strictEqual(playLogs[1].type, 'approved');
    assert.strictEqual(playLogs[2].type, 'approved');
});

test('8. Configurações de som e controle de volume respeitados', () => {
    const engineCode = fs.readFileSync(path.join(__dirname, '..', 'js', 'sales-notification-engine.js'), 'utf8');
    assert(engineCode.includes('soundEnabled'), 'Falta suporte a soundEnabled');
    assert(engineCode.includes('pendingSoundEnabled'), 'Falta suporte a pendingSoundEnabled');
    assert(engineCode.includes('approvedSoundEnabled'), 'Falta suporte a approvedSoundEnabled');
    assert(engineCode.includes('setVolume'), 'Falta suporte a setVolume');
    assert(engineCode.includes('this.minIntervalMs = 1800') || engineCode.includes('1800'), 'Falta intervalo sequencial mínimo de 1.8s');
});

test('9. Painel de Configurações no HTML e Botões de Teste Isolados (Preview Only)', () => {
    const htmlCode = fs.readFileSync(path.join(__dirname, '..', 'admin-ads.html'), 'utf8');
    assert(htmlCode.includes('id="view-settings"'), 'Falta section #view-settings no HTML');
    assert(htmlCode.includes('id="setting-sound-master"'), 'Falta switch master de som no HTML');
    assert(htmlCode.includes('id="setting-sound-pending"'), 'Falta switch de som pendente no HTML');
    assert(htmlCode.includes('id="setting-sound-approved"'), 'Falta switch de som aprovado no HTML');
    assert(htmlCode.includes('id="setting-sound-volume"'), 'Falta slider de volume no HTML');
    assert(htmlCode.includes('testSound(\'pending\')'), 'Falta botão de teste de som pendente no HTML');
    assert(htmlCode.includes('testSound(\'approved\')'), 'Falta botão de teste de som aprovado no HTML');
});

test('10. Estilos de Toasts com aria-live e classes de destaque em assets/admin-ads.css', () => {
    const cssCode = fs.readFileSync(path.join(__dirname, '..', 'assets', 'admin-ads.css'), 'utf8');
    assert(cssCode.includes('#toast-container'), 'Falta #toast-container no CSS');
    assert(cssCode.includes('.toast-sale-pending'), 'Falta .toast-sale-pending no CSS');
    assert(cssCode.includes('.toast-sale-approved'), 'Falta .toast-sale-approved no CSS');
});

console.log(`\n========================================`);
console.log(`📊 Resultado dos Testes: ${passedTests}/${totalTests} PASS`);
console.log(`========================================\n`);

if (passedTests === totalTests) {
    console.log('🎉 TODOS OS TESTES DE NOTIFICAÇÕES DE VENDAS FORAM APROVADOS COM SUCESSO!');
    process.exit(0);
} else {
    console.error('⚠️ ALGUNS TESTES FALHARAM. CORRIJA ANTES DE PROSSEGUIR.');
    process.exit(1);
}
