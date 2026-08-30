// ==============================================================================
// TESTE DE ISOLAMENTO MULTI-TENANT E SEGURANÇA RBAC (RADWAN ADS SAAS)
// ==============================================================================

const assert = require('assert');
const supabase = require('../lib/supabase-gateway.js');

async function runTests() {
    console.log('🧪 Iniciando Bateria de Testes: Multi-Tenant & SaaS Security...\n');
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

    // 1. Criptografia e Decriptografia de Tokens Meta (AES-256-GCM)
    test('1. AES-256-GCM Criptografa e Decriptografa Token Meta com Integridade', () => {
        const rawToken = 'EAA6kKz1qBV8BScqZAG8mVrcPD4ICruA1t9WqObGj21tgmjSmOz5w2ngISSd2m9LSgETqq8zZCrfBERBmbSwMzTJaAxUvwSFnlZCOY0lK0CDZAihxtzHieFl6dyDAQdM9xJVpXBT8Ya6KpWnVctmTqUugUUaaujxfpAu7J7ZBKkx17UN2o0BbWjyUQ8lR38UDnagZDZD';
        const encrypted = supabase.encryptToken(rawToken);
        assert(encrypted && encrypted.includes(':'), 'Formato encriptado inválido');
        assert(!encrypted.includes(rawToken), 'O token não pode estar exposto em plaintext');

        const decrypted = supabase.decryptToken(encrypted);
        assert.strictEqual(decrypted, rawToken, 'Decriptografia deve retornar o token exato');
    });

    // 2. Isolamento de Contexto Tenant (Simulação de Membership)
    test('2. Membership Validator bloqueia acesso cruzado não autorizado (Fail-Closed)', async () => {
        // Usuário A tentando acessar Workspace B
        const userA = 'user_00000000-0000-0000-0000-000000000001';
        const workspaceB = 'ws_00000000-0000-0000-0000-000000000002';
        
        // Deve retornar null se o usuário não for membro
        const membership = await supabase.getUserWorkspaceMembership(userA, workspaceB);
        assert.strictEqual(membership, null, 'Acesso não autorizado deve retornar estritamente null');
    });

    // 3. Validação de Sanitização e Ausência de Secrets Expostos no Frontend
    test('3. Código Frontend não contém chaves de serviço privadas (Service Role)', () => {
        const fs = require('fs');
        const path = require('path');
        const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
        const authGateJs = fs.readFileSync(path.join(__dirname, '..', 'js', 'auth-gate.js'), 'utf8');

        assert(!indexHtml.includes('sb_secret_'), 'Chave secreta Supabase exposta no index.html!');
        assert(!authGateJs.includes('sb_secret_'), 'Chave secreta Supabase exposta no auth-gate.js!');
        assert(!authGateJs.includes('ADMIN_PASSWORD'), 'Senha admin exposta no auth-gate.js!');
    });

    console.log(`\n========================================`);
    console.log(`📊 Resultado dos Testes: ${passed}/${total} PASS`);
    console.log(`========================================\n`);

    if (passed === total) {
        console.log('🎉 TODOS OS TESTES MULTI-TENANT FORAM APROVADOS COM SUCESSO!');
        process.exit(0);
    } else {
        process.exit(1);
    }
}

runTests();
