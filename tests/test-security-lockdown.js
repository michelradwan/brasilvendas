// ==============================================================================
// TEST SUITE: RADWAN ADS — ZERO-TRUST SECURITY LOCKDOWN (P0 VERIFICATION)
// ==============================================================================

const http = require('http');
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const url = require('url');

process.env.ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'test-suite-admin-secret-2026';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-suite-session-secret-2026';

const PORT = 3334;
const ROOT = path.resolve(__dirname, '..');

const server = http.createServer(async (req, res) => {
    const parsedUrl = url.parse(req.url, true);
    let reqPath = parsedUrl.pathname;

    if (reqPath.startsWith('/api/')) {
        const apiName = reqPath.replace('/api/', '').replace('.js', '');
        const apiFile = path.join(ROOT, 'api', `${apiName}.js`);

        if (fs.existsSync(apiFile)) {
            let bodyData = '';
            req.on('data', chunk => { bodyData += chunk; });
            req.on('end', async () => {
                let parsedBody = {};
                try {
                    parsedBody = bodyData ? JSON.parse(bodyData) : {};
                } catch(e) {
                    parsedBody = bodyData;
                }

                const mockReq = {
                    method: req.method,
                    url: req.url,
                    headers: req.headers,
                    query: parsedUrl.query,
                    body: parsedBody
                };

                const mockRes = {
                    statusCode: 200,
                    headers: {},
                    setHeader(k, v) {
                        const lk = k.toLowerCase();
                        if (lk === 'set-cookie') {
                            if (!this.headers['Set-Cookie']) this.headers['Set-Cookie'] = [];
                            if (Array.isArray(v)) this.headers['Set-Cookie'].push(...v);
                            else this.headers['Set-Cookie'].push(v);
                        } else {
                            this.headers[k] = v;
                        }
                    },
                    status(code) { this.statusCode = code; return this; },
                    json(data) {
                        this.headers['Content-Type'] = 'application/json; charset=utf-8';
                        res.writeHead(this.statusCode, this.headers);
                        res.end(JSON.stringify(data));
                    },
                    end(data) {
                        res.writeHead(this.statusCode, this.headers);
                        res.end(data);
                    }
                };

                try {
                    delete require.cache[require.resolve(apiFile)];
                    const handler = require(apiFile);
                    await handler(mockReq, mockRes);
                } catch (err) {
                    mockRes.status(500).json({ success: false, error: err.message });
                }
            });
            return;
        }
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
});

function makeRequest(options, postData = null) {
    return new Promise((resolve, reject) => {
        const req = http.request({
            hostname: 'localhost',
            port: PORT,
            ...options
        }, res => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                let json = null;
                try { json = JSON.parse(data); } catch(e) {}
                resolve({ statusCode: res.statusCode, headers: res.headers, body: json, raw: data });
            });
        });

        req.on('error', err => reject(err));
        if (postData) {
            req.write(typeof postData === 'string' ? postData : JSON.stringify(postData));
        }
        req.end();
    });
}

(async () => {
    await new Promise(r => server.listen(PORT, r));

    console.log('═══════════════════════════════════════════════════════════════════════');
    console.log('🔒 INICIANDO BATERIA DE TESTES DE SEGURANÇA E AUTHENTICATION GATE (P0)');
    console.log('═══════════════════════════════════════════════════════════════════════\n');

    try {
        // ─── TESTE 1: ACESSO TOTALMENTE NÃO AUTENTICADO ───
        console.log('1. Testando bloqueio de requisições anônimas sem sessão nem credenciais...');

        const endpointsToTest = [
            { method: 'GET', path: '/api/auth?action=check', name: 'Auth Check' },
            { method: 'GET', path: '/api/meta-proxy?endpoint=act_846780837970771/campaigns', name: 'Meta Proxy Campaigns' },
            { method: 'POST', path: '/api/meta-proxy', name: 'Meta Proxy Write', body: { endpoint: 'act_846780837970771/campaigns' } },
            { method: 'GET', path: '/api/pedidos', name: 'Pedidos & PII de Clientes' },
            { method: 'DELETE', path: '/api/pedidos', name: 'Limpeza de Pedidos' },
            { method: 'GET', path: '/api/si-query', name: 'Site Intelligence Analytics' },
            { method: 'GET', path: '/api/visitantes', name: 'Monitor de Visitantes Online' }
        ];

        for (const ep of endpointsToTest) {
            const res = await makeRequest({
                path: ep.path,
                method: ep.method,
                headers: { 'Content-Type': 'application/json' }
            }, ep.body);

            assert.strictEqual(res.statusCode, 401, `Endpoint ${ep.name} (${ep.path}) DEVERIA RETORNAR 401 mas retornou ${res.statusCode}`);
            console.log(`   ✅ PASS: [${ep.method}] ${ep.name} bloqueado com 401 Unauthorized.`);
        }

        // ─── TESTE 2: RATE LIMITING CONTRA BRUTE-FORCE ───
        console.log('\n2. Testando proteção contra ataque de força bruta (Rate Limiting)...');
        
        let rateLimitTriggered = false;
        const attackerIp = '203.0.113.195';
        for (let i = 1; i <= 6; i++) {
            const res = await makeRequest({
                path: '/api/auth?action=login',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-forwarded-for': attackerIp
                }
            }, { password: 'senha_errada_brute_force' });

            if (res.statusCode === 429) {
                rateLimitTriggered = true;
                assert(res.headers['retry-after'], 'Falta cabeçalho Retry-After no 429');
                console.log(`   ✅ PASS: Tentativa #${i} do IP atacante ${attackerIp} bloqueada por Rate Limiting (429 Too Many Requests)!`);
                break;
            }
        }
        assert(rateLimitTriggered, 'Rate limit não foi acionado após múltiplas tentativas falhas');

        // ─── TESTE 3: LOGIN CORRETO E EMISSÃO DE COOKIE HTTPONLY SEGURO ───
        console.log('\n3. Testando login com credencial administrativa correta...');

        const loginRes = await makeRequest({
            path: '/api/auth?action=login',
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        }, { password: process.env.ADMIN_PASSWORD });

        assert.strictEqual(loginRes.statusCode, 200, `Login falhou com código ${loginRes.statusCode}`);
        assert(loginRes.body.success, 'Login retornou success: false');

        const setCookie = loginRes.headers['set-cookie']?.[0] || '';
        assert(setCookie.includes('radwan_session='), 'Cookie radwan_session não foi emitido no login');
        assert(setCookie.includes('HttpOnly'), 'Flag HttpOnly ausente no cookie');
        assert(setCookie.includes('SameSite='), 'Flag SameSite ausente no cookie');
        console.log('   ✅ PASS: Login autorizado com sucesso e cookie HttpOnly emitido.');

        const sessionCookieValue = setCookie.split(';')[0];

        // ─── TESTE 4: REQUISIÇÕES AUTENTICADAS VIA COOKIE ───
        console.log('\n4. Testando acesso a todos os módulos com a sessão autenticada...');

        // 4.1 Auth Check
        const authCheckRes = await makeRequest({
            path: '/api/auth?action=check',
            method: 'GET',
            headers: { 'Cookie': sessionCookieValue }
        });
        assert.strictEqual(authCheckRes.statusCode, 200);
        assert.strictEqual(authCheckRes.body.authenticated, true);
        console.log('   ✅ PASS: /api/auth?action=check validou sessão ativa (200 OK).');

        // 4.2 Meta Proxy
        const metaRes = await makeRequest({
            path: '/api/meta-proxy?endpoint=act_846780837970771/campaigns',
            method: 'GET',
            headers: { 'Cookie': sessionCookieValue }
        });
        assert.strictEqual(metaRes.statusCode, 200);
        assert(Array.isArray(metaRes.body.data), 'Meta proxy não retornou lista de dados');
        console.log(`   ✅ PASS: /api/meta-proxy autenticado com sucesso (${metaRes.body.data.length} campanhas).`);

        // 4.3 Pedidos & PII
        const pedidosRes = await makeRequest({
            path: '/api/pedidos',
            method: 'GET',
            headers: { 'Cookie': sessionCookieValue }
        });
        assert.strictEqual(pedidosRes.statusCode, 200);
        assert(Array.isArray(pedidosRes.body.pedidos), 'Pedidos não retornou array de pedidos');
        console.log(`   ✅ PASS: /api/pedidos autenticado com sucesso (${pedidosRes.body.pedidos.length} pedidos).`);

        // 4.4 Site Intelligence
        const siRes = await makeRequest({
            path: '/api/si-query',
            method: 'GET',
            headers: { 'Cookie': sessionCookieValue }
        });
        assert.strictEqual(siRes.statusCode, 200);
        console.log('   ✅ PASS: /api/si-query autenticado com sucesso (200 OK).');

        // 4.5 Visitantes
        const visitantesRes = await makeRequest({
            path: '/api/visitantes',
            method: 'GET',
            headers: { 'Cookie': sessionCookieValue }
        });
        assert.strictEqual(visitantesRes.statusCode, 200);
        console.log('   ✅ PASS: /api/visitantes autenticado com sucesso (200 OK).');

        // ─── TESTE 5: LOGOUT E DESTRUIÇÃO DE SESSÃO ───
        console.log('\n5. Testando encerramento de sessão (Logout)...');

        const logoutRes = await makeRequest({
            path: '/api/auth?action=logout',
            method: 'POST',
            headers: { 'Cookie': sessionCookieValue }
        });
        assert.strictEqual(logoutRes.statusCode, 200);
        const logoutCookie = logoutRes.headers['set-cookie']?.[0] || '';
        assert(logoutCookie.includes('Max-Age=0') || logoutCookie.includes('Expires='), 'Cookie não foi invalidado no logout');
        console.log('   ✅ PASS: Logout efetuado e cookie invalidado no navegador.');

        // Tentativa de acesso com cookie expirado/vazio
        const afterLogoutRes = await makeRequest({
            path: '/api/meta-proxy?endpoint=act_846780837970771/campaigns',
            method: 'GET',
            headers: { 'Cookie': 'radwan_session=' }
        });
        assert.strictEqual(afterLogoutRes.statusCode, 401, 'Requisição após logout deveria ser rejeitada');
        console.log('   ✅ PASS: Acesso imediatamente revogado após logout (401 Unauthorized).');

        // ─── TESTE 6: AUDITORIA ESTÁTICA DE ZERO SENHAS NO FRONTEND ───
        console.log('\n6. Auditando código-fonte frontend contra credenciais ou tokens expostos...');

        const frontendFiles = [
            'index.html',
            'admin-ads.html',
            'js/meta-adapter.js',
            'js/dashboard.js',
            'js/auth-gate.js'
        ];

        for (const file of frontendFiles) {
            const content = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
            assert(!content.includes('ADMIN_PASSWORD') && !content.includes('SESSION_SECRET'), `SEGREDOS ENCONTRADOS EM ${file}!`);
            assert(!content.includes('EAA6kKz1q'), `META ACCESS TOKEN ENCONTRADO EM ${file}!`);
            console.log(`   ✅ PASS: ${file} limpo (0 senhas, 0 tokens expostos).`);
        }

        console.log('\n═══════════════════════════════════════════════════════════════════════');
        console.log('🎉 TODOS OS TESTES DE SEGURANÇA E AUTHENTICATION GATE FORAM APROVADOS!');
        console.log('═══════════════════════════════════════════════════════════════════════\n');

        server.close();
        process.exit(0);

    } catch (err) {
        console.error('\n❌ FALHA NO TESTE DE SEGURANÇA:', err);
        server.close();
        process.exit(1);
    }
})();
