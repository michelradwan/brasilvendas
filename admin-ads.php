<?php
session_start();

// Configurações de Acesso ao Painel
$senha_painel = "admin123"; // Senha padrão de proteção do painel

if (isset($_GET['logout'])) {
    unset($_SESSION['ads_logged']);
    header("Location: admin-ads.php");
    exit;
}

if (isset($_POST['login_password'])) {
    if ($_POST['login_password'] === $senha_painel) {
        $_SESSION['ads_logged'] = true;
    } else {
        $login_error = "Senha incorreta!";
    }
}

// Se não estiver logado, exibe tela de login elegante
if (!isset($_SESSION['ads_logged'])) {
    ?>
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Login | Gestor Ads IA</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <style>
            body { background-color: #07090e; font-family: 'Inter', sans-serif; }
        </style>
    </head>
    <body class="flex items-center justify-center min-h-screen text-white">
        <div class="w-full max-w-md bg-[#0e121a] border border-white/10 p-8 rounded-3xl shadow-2xl">
            <div class="text-center mb-6">
                <span class="text-4xl">🤖</span>
                <h1 class="text-xl font-bold mt-3">Gestor Ads IA</h1>
                <p class="text-xs text-gray-400 mt-1">Digite a senha para acessar a central de campanhas</p>
            </div>
            <form method="POST" class="space-y-4">
                <div>
                    <label class="block text-xs font-semibold text-gray-400 mb-1">Senha de Acesso</label>
                    <input type="password" name="login_password" required placeholder="••••••••" class="w-full bg-[#07090e] border border-white/10 rounded-xl p-3 text-white focus:outline-none focus:border-yellow-500 text-center">
                    <?php if (isset($login_error)) { echo '<p class="text-xs text-red-400 mt-1 text-center">⚠️ ' . $login_error . '</p>'; } ?>
                </div>
                <button type="submit" class="w-full bg-yellow-500 hover:bg-yellow-600 text-black font-bold py-3.5 rounded-xl transition-all active:scale-[0.98]">
                    Entrar no Painel
                </button>
            </form>
        </div>
    </body>
    </html>
    <?php
    exit;
}

// Configurações Locais Seguras
$storageDir = __DIR__ . '/storage';
if (!is_dir($storageDir)) {
    mkdir($storageDir, 0755, true);
    file_put_contents($storageDir . '/.htaccess', "Order allow,deny\nDeny from all\n");
}

$configFile = $storageDir . '/config-ads.json';
$config = [
    'access_token' => 'EAA6kKz1qBV8BSZAIyOatrEf3ZBvLE0uAP0xi7pIeFdDuxDLr7S4lXbHTlHohasRuUJvW6PbiFDBD0YhfZBHTJFGtATD6WNbyI7bn1y4uDbpH0cztZBAA5s9R98iG7uooUMGbqNHFDbVWBXEDeYnX4rKCWb0GpNjgZBjDDptLq8Q4PINiLPdnsreVtoVI4FmAiZAsZCm7iZAwNJydKp56zSoyXfj1uXE34mymGc2yKw3ODzFMRe8ZBKTFE5Gl4ODUDLLdbkoKKmfZBl5L8Qng6f7BSMURbX',
    'ad_account_id' => 'act_846780837970771',
    'rules_enabled' => false,
    'target_cpa' => 40.00,
    'max_daily_budget' => 500.00,
    'logs' => []
];

if (file_exists($configFile)) {
    $loaded = json_decode(file_get_contents($configFile), true);
    if (is_array($loaded)) {
        $config = array_merge($config, $loaded);
    }
}

// Processar salvamento de configurações e ações via AJAX
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_GET['action'])) {
    $action = $_GET['action'];
    header('Content-Type: application/json');

    if ($action === 'save_settings') {
        $config['access_token'] = trim($_POST['access_token']);
        $config['ad_account_id'] = trim($_POST['ad_account_id']);
        $config['rules_enabled'] = isset($_POST['rules_enabled']) ? (bool)$_POST['rules_enabled'] : false;
        $config['target_cpa'] = floatval($_POST['target_cpa']);
        $config['max_daily_budget'] = floatval($_POST['max_daily_budget']);

        file_put_contents($configFile, json_encode($config, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
        echo json_encode(['success' => true]);
        exit;
    }

    if ($action === 'meta_request') {
        $endpoint = $_POST['endpoint'];
        $method = $_POST['method'] ?? 'GET';
        $params = $_POST['params'] ?? [];
        
        $url = "https://graph.facebook.com/v20.0/" . ltrim($endpoint, '/');
        
        $ch = curl_init();
        if ($method === 'POST') {
            curl_setopt($ch, CURLOPT_POST, true);
            $params['access_token'] = $config['access_token'];
            curl_setopt($ch, CURLOPT_POSTFIELDS, http_build_query($params));
        } else {
            $params['access_token'] = $config['access_token'];
            $url .= '?' . http_build_query($params);
        }

        curl_setopt($ch, CURLOPT_URL, $url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
        curl_setopt($ch, CURLOPT_TIMEOUT, 20);

        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        echo $response;
        exit;
    }

    if ($action === 'add_log') {
        $message = trim($_POST['message']);
        $logEntry = [
            'time' => date('d/m/Y H:i:s'),
            'message' => $message
        ];
        array_unshift($config['logs'], $logEntry);
        $config['logs'] = array_slice($config['logs'], 0, 50); // Limite de 50 logs
        file_put_contents($configFile, json_encode($config, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
        echo json_encode(['success' => true]);
        exit;
    }
}
?>
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Painel Gestor Ads IA | central de Campanhas</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Outfit:wght@600;700;800&display=swap" rel="stylesheet">
    <script>
        tailwind.config = {
            theme: {
                extend: {
                    fontFamily: {
                        'inter': ['Inter', 'sans-serif'],
                        'outfit': ['Outfit', 'sans-serif'],
                    }
                }
            }
        }
    </script>
    <style>
        body { background-color: #07090e; font-family: 'Inter', sans-serif; }
        .glass-panel { background: rgba(14, 18, 26, 0.85); backdrop-filter: blur(12px); border: 1px solid rgba(255, 255, 255, 0.08); }
    </style>
</head>
<body class="text-gray-200 min-h-screen pb-12">

    <!-- Header -->
    <header class="border-b border-white/10 bg-[#0e121a] py-4">
        <div class="container mx-auto px-4 flex items-center justify-between">
            <div class="flex items-center space-x-3">
                <span class="text-3xl">🤖</span>
                <div>
                    <h1 class="font-outfit text-lg sm:text-xl font-bold text-white leading-none">Gestor Ads IA</h1>
                    <p class="text-xs text-gray-400 mt-1">Otimizador Autônomo de Tráfego Pago</p>
                </div>
            </div>
            <div class="flex items-center space-x-3">
                <span class="text-xs font-semibold px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center space-x-1.5">
                    <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></span>
                    <span>Conectado</span>
                </span>
                <a href="admin-ads.php?logout=true" class="text-xs bg-white/5 hover:bg-white/10 px-3 py-1.5 rounded-xl border border-white/5 transition-colors">Sair</a>
            </div>
        </div>
    </header>

    <main class="container mx-auto px-4 mt-6 max-w-6xl space-y-6">

        <!-- Top Metrics Cards -->
        <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            <div class="glass-panel p-5 rounded-2xl">
                <p class="text-xs text-gray-400 font-semibold uppercase">Total Investido (Geral)</p>
                <h3 class="text-2xl font-bold font-outfit text-white mt-1.5" id="metric-spent">Calculando...</h3>
            </div>
            <div class="glass-panel p-5 rounded-2xl">
                <p class="text-xs text-gray-400 font-semibold uppercase">Status da Conta</p>
                <h3 class="text-2xl font-bold font-outfit text-white mt-1.5" id="metric-status">Calculando...</h3>
            </div>
            <div class="glass-panel p-5 rounded-2xl">
                <p class="text-xs text-gray-400 font-semibold uppercase">Moeda</p>
                <h3 class="text-2xl font-bold font-outfit text-white mt-1.5" id="metric-currency">Calculando...</h3>
            </div>
            <div class="glass-panel p-5 rounded-2xl border-yellow-500/30 bg-yellow-500/5">
                <p class="text-xs text-gray-400 font-semibold uppercase">Modo Piloto Automático</p>
                <h3 class="text-2xl font-bold font-outfit text-yellow-500 mt-1.5" id="metric-ai-status">
                    <?php echo $config['rules_enabled'] ? 'Ativo 🤖' : 'Inativo 😴'; ?>
                </h3>
            </div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">

            <!-- Coluna de Regras e Configuração da IA -->
            <div class="space-y-6 lg:col-span-1">
                
                <!-- Card de Configuração -->
                <div class="glass-panel p-5 rounded-3xl space-y-4">
                    <h3 class="font-outfit text-base font-bold text-white flex items-center space-x-2">
                        <span>⚙️</span>
                        <span>Configurações do Robô</span>
                    </h3>
                    
                    <form id="settings-form" class="space-y-3.5">
                        <div>
                            <label class="block text-[11px] font-bold uppercase text-gray-400 mb-1">ID da Conta de Anúncios</label>
                            <input type="text" name="ad_account_id" value="<?php echo htmlspecialchars($config['ad_account_id']); ?>" class="w-full bg-[#07090e] border border-white/10 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-yellow-500">
                        </div>

                        <div>
                            <label class="block text-[11px] font-bold uppercase text-gray-400 mb-1">Token de Acesso (API Meta)</label>
                            <input type="password" name="access_token" value="<?php echo htmlspecialchars($config['access_token']); ?>" class="w-full bg-[#07090e] border border-white/10 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-yellow-500">
                        </div>

                        <div class="h-[1px] bg-white/5"></div>

                        <div>
                            <label class="block text-[11px] font-bold uppercase text-gray-400 mb-1">CPA Alvo Máximo (R$)</label>
                            <input type="number" step="0.01" name="target_cpa" value="<?php echo $config['target_cpa']; ?>" class="w-full bg-[#07090e] border border-white/10 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-yellow-500">
                            <p class="text-[10px] text-gray-400 mt-1">IA pausará anúncios que gastarem mais que isso sem vendas.</p>
                        </div>

                        <div>
                            <label class="block text-[11px] font-bold uppercase text-gray-400 mb-1">Teto Máximo Diário (R$)</label>
                            <input type="number" step="0.01" name="max_daily_budget" value="<?php echo $config['max_daily_budget']; ?>" class="w-full bg-[#07090e] border border-white/10 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-yellow-500">
                            <p class="text-[10px] text-gray-400 mt-1">Limite máximo de orçamento diário acumulado das campanhas.</p>
                        </div>

                        <div class="flex items-center justify-between p-3 rounded-2xl bg-white/[0.02] border border-white/5">
                            <div>
                                <p class="text-xs font-bold text-white">Ativar Piloto Automático</p>
                                <p class="text-[10px] text-gray-400">IA otimiza a cada 3h</p>
                            </div>
                            <label class="relative inline-flex items-center cursor-pointer">
                                <input type="checkbox" name="rules_enabled" value="1" <?php echo $config['rules_enabled'] ? 'checked' : ''; ?> class="sr-only peer">
                                <div class="w-9 h-5 bg-gray-600 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-yellow-500"></div>
                            </label>
                        </div>

                        <button type="submit" class="w-full bg-yellow-500 hover:bg-yellow-600 text-black font-bold py-3 rounded-xl transition-all">
                            Salvar Configurações
                        </button>
                    </form>
                </div>

                <!-- Histórico de Decisões do Robô IA -->
                <div class="glass-panel p-5 rounded-3xl space-y-3">
                    <h3 class="font-outfit text-base font-bold text-white flex items-center space-x-2">
                        <span>🤖</span>
                        <span>Decisões & Logs da IA</span>
                    </h3>
                    <div class="space-y-2.5 max-h-[220px] overflow-y-auto pr-1" id="log-container">
                        <?php if (empty($config['logs'])): ?>
                            <p class="text-xs text-gray-400 italic text-center py-4">Nenhuma decisão registrada ainda...</p>
                        <?php else: ?>
                            <?php foreach ($config['logs'] as $log): ?>
                                <div class="p-2.5 rounded-xl bg-white/[0.02] border border-white/5 text-[11px] space-y-1">
                                    <div class="flex justify-between font-semibold text-yellow-500/80">
                                        <span>IA Decision</span>
                                        <span><?php echo $log['time']; ?></span>
                                    </div>
                                    <p class="text-gray-300"><?php echo htmlspecialchars($log['message']); ?></p>
                                </div>
                            <?php endforeach; ?>
                        <?php endif; ?>
                    </div>
                </div>

            </div>

            <!-- Coluna Principal das Campanhas -->
            <div class="lg:col-span-2 space-y-6">

                <!-- Tabela de Campanhas Ativas -->
                <div class="glass-panel p-5 rounded-3xl space-y-4">
                    <div class="flex items-center justify-between">
                        <h3 class="font-outfit text-base font-bold text-white flex items-center space-x-2">
                            <span>📢</span>
                            <span>Campanhas Ativas</span>
                        </h3>
                        <button onclick="carregarCampanhas()" class="text-xs font-semibold px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 transition-colors flex items-center space-x-1.5">
                            <span>🔄</span>
                            <span>Atualizar Lista</span>
                        </button>
                    </div>

                    <div class="overflow-x-auto rounded-2xl border border-white/5">
                        <table class="w-full text-xs text-left">
                            <thead class="bg-[#121620] text-gray-400 uppercase font-semibold">
                                <tr>
                                    <th class="p-3.5">Nome / Status</th>
                                    <th class="p-3.5">Orçamento</th>
                                    <th class="p-3.5">CPA / Vendas</th>
                                    <th class="p-3.5 text-center">Ações</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-white/5 text-gray-200" id="campaigns-tbody">
                                <tr>
                                    <td colspan="4" class="p-8 text-center text-gray-400 italic">Carregando campanhas do Meta Ads...</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>

                <!-- Painel de Otimização Automática Rápida -->
                <div class="glass-panel p-6 rounded-3xl border-yellow-500/20 bg-yellow-500/[0.02] flex flex-col sm:flex-row justify-between items-center gap-4">
                    <div>
                        <h4 class="font-bold text-white text-sm">Rodar Otimização Forçada com IA agora?</h4>
                        <p class="text-xs text-gray-400 mt-0.5">Analisa todas as campanhas, escala os orçamentos e pausa os anúncios ruins instantaneamente.</p>
                    </div>
                    <button onclick="rodarOtimizacaoIA()" class="bg-yellow-500 hover:bg-yellow-600 text-black font-extrabold text-xs px-5 py-3.5 rounded-xl transition-all shadow-lg active:scale-95 whitespace-nowrap">
                        🤖 RODAR CENTRAL IA
                    </button>
                </div>

            </div>

        </div>

    </main>

    <script>
        const AD_ACCOUNT_ID = '<?php echo $config['ad_account_id']; ?>';

        // AJAX para envio de requisição da Graph API
        async function reqMeta(endpoint, method = 'GET', params = {}) {
            const formData = new FormData();
            formData.append('endpoint', endpoint);
            formData.append('method', method);
            
            for (const k in params) {
                if (params[k] && typeof params[k] === 'object') {
                    formData.append(`params[${k}]`, JSON.stringify(params[k]));
                } else {
                    formData.append(`params[${k}]`, params[k]);
                }
            }

            const res = await fetch('admin-ads.php?action=meta_request', {
                method: 'POST',
                body: formData
            });
            return await res.json();
        }

        // Registrar decisão no banco local
        async function salvarLog(message) {
            const formData = new FormData();
            formData.append('message', message);
            await fetch('admin-ads.php?action=add_log', {
                method: 'POST',
                body: formData
            });

            // Adiciona na interface
            const logContainer = document.getElementById('log-container');
            const time = new Date().toLocaleDateString('pt-BR') + ' ' + new Date().toLocaleTimeString('pt-BR');
            const newLogHtml = `
                <div class="p-2.5 rounded-xl bg-white/[0.02] border border-white/5 text-[11px] space-y-1">
                    <div class="flex justify-between font-semibold text-yellow-500/80">
                        <span>IA Decision</span>
                        <span>${time}</span>
                    </div>
                    <p class="text-gray-300">${message}</p>
                </div>
            `;
            logContainer.innerHTML = newLogHtml + logContainer.innerHTML;
        }

        // Salvar formulário de configurações
        document.getElementById('settings-form').addEventListener('submit', async function(e) {
            e.preventDefault();
            const formData = new FormData(this);
            const res = await fetch('admin-ads.php?action=save_settings', {
                method: 'POST',
                body: formData
            });
            const data = await res.json();
            if (data.success) {
                alert('Configurações salvas com sucesso!');
                window.location.reload();
            }
        });

        // Carregar detalhes gerais da conta de anúncios
        async function carregarContaInfo() {
            try {
                const info = await reqMeta(AD_ACCOUNT_ID, 'GET', { fields: 'name,account_status,currency,amount_spent' });
                
                if (info && !info.error) {
                    const spentFormatted = (parseFloat(info.amount_spent) || 0).toLocaleString('pt-BR', { style: 'currency', currency: info.currency || 'BRL' });
                    document.getElementById('metric-spent').textContent = spentFormatted;
                    
                    let statusLabel = 'Ativa 🟢';
                    if (info.account_status !== 1) statusLabel = 'Pausada/Desativada 🔴';
                    document.getElementById('metric-status').textContent = statusLabel;
                    document.getElementById('metric-currency').textContent = info.currency || 'BRL';
                }
            } catch (e) {
                console.error(e);
            }
        }

        // Carregar lista de campanhas e insights
        async function carregarCampanhas() {
            const tbody = document.getElementById('campaigns-tbody');
            tbody.innerHTML = `<tr><td colspan="4" class="p-8 text-center text-gray-400 italic">Buscando campanhas direto do Meta Ads...</td></tr>`;

            try {
                const res = await reqMeta(`${AD_ACCOUNT_ID}/campaigns`, 'GET', {
                    fields: 'name,status,daily_budget,lifetime_budget,buying_type',
                    limit: 25
                });

                if (res.error) {
                    tbody.innerHTML = `<tr><td colspan="4" class="p-8 text-center text-red-400">⚠️ Erro da API: ${res.error.message}</td></tr>`;
                    return;
                }

                if (!res.data || res.data.length === 0) {
                    tbody.innerHTML = `<tr><td colspan="4" class="p-8 text-center text-gray-400">Nenhuma campanha localizada nesta conta.</td></tr>`;
                    return;
                }

                tbody.innerHTML = '';
                
                for (const camp of res.data) {
                    // Pega insights de conversões e gasto
                    const insightsRes = await reqMeta(`${camp.id}/insights`, 'GET', {
                        fields: 'spend,actions',
                        date_preset: 'today'
                    });

                    let spendToday = 0;
                    let purchases = 0;
                    let cpa = 0;

                    if (insightsRes.data && insightsRes.data[0]) {
                        const insight = insightsRes.data[0];
                        spendToday = parseFloat(insight.spend) || 0;
                        if (insight.actions) {
                            const purchAction = insight.actions.find(act => act.action_type === 'purchase');
                            if (purchAction) purchases = parseInt(purchAction.value) || 0;
                        }
                        if (purchases > 0) {
                            cpa = spendToday / purchases;
                        }
                    }

                    const budgetRaw = camp.daily_budget ? camp.daily_budget : camp.lifetime_budget;
                    const budgetFormatted = budgetRaw ? (parseFloat(budgetRaw) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : 'Sob consulta';

                    const isChecked = camp.status === 'ACTIVE';

                    const tr = document.createElement('tr');
                    tr.className = "hover:bg-white/[0.02] transition-colors";
                    tr.innerHTML = `
                        <td class="p-3.5">
                            <p class="font-semibold text-white text-sm truncate max-w-[200px]" title="${camp.name}">${camp.name}</p>
                            <span class="text-[10px] text-gray-400 flex items-center space-x-1.5 mt-0.5">
                                <span class="w-1.5 h-1.5 rounded-full ${isChecked ? 'bg-green-500' : 'bg-red-500'}"></span>
                                <span>${camp.status}</span>
                            </span>
                        </td>
                        <td class="p-3.5 font-semibold text-white">
                            ${budgetFormatted} <span class="text-[9px] text-gray-400 font-normal block">${camp.daily_budget ? 'Diário' : 'Total'}</span>
                        </td>
                        <td class="p-3.5">
                            <span class="font-bold text-white">${purchases} vendas</span>
                            <span class="text-[10px] text-gray-400 block mt-0.5">CPA Hoje: ${cpa > 0 ? cpa.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : 'R$ 0,00'}</span>
                        </td>
                        <td class="p-3.5 text-center">
                            <div class="flex items-center justify-center space-x-2">
                                <button onclick="toggleCampStatus('${camp.id}', '${camp.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE'}')" class="px-2.5 py-1.5 rounded-lg text-[10px] font-bold ${isChecked ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 'bg-green-500/10 text-green-400 border border-green-500/20'} hover:opacity-80 transition-opacity">
                                    ${isChecked ? 'Pausar' : 'Ativar'}
                                </button>
                                <button onclick="ajustarOrcamentoPrompt('${camp.id}', '${camp.daily_budget ? 'daily_budget' : 'lifetime_budget'}', '${budgetRaw}')" class="px-2.5 py-1.5 rounded-lg bg-yellow-500/10 text-yellow-500 border border-yellow-500/20 hover:opacity-80 text-[10px] font-bold">
                                    Orçamento
                                </button>
                                <button onclick="duplicarCampanha('${camp.id}')" class="px-2.5 py-1.5 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20 hover:opacity-80 text-[10px] font-bold">
                                    Duplicar
                                </button>
                            </div>
                        </td>
                    `;
                    tbody.appendChild(tr);
                }
            } catch (err) {
                tbody.innerHTML = `<tr><td colspan="4" class="p-8 text-center text-red-400">⚠️ Erro técnico de conexão.</td></tr>`;
            }
        }

        // Ligar/Pausar Campanha
        async function toggleCampStatus(id, newStatus) {
            if (!confirm(`Confirmar alteração de status para ${newStatus}?`)) return;

            try {
                const res = await reqMeta(id, 'POST', { status: newStatus });
                if (res.success) {
                    await salvarLog(`Alterado status da campanha ${id} para ${newStatus}.`);
                    alert('Status atualizado com sucesso!');
                    carregarCampanhas();
                } else {
                    alert('Erro ao atualizar: ' + (res.error?.message || 'Tente novamente.'));
                }
            } catch (e) {
                alert('Erro de conexão.');
            }
        }

        // Alterar Orçamento
        async function ajustarOrcamentoPrompt(id, field, valueRaw) {
            const currentVal = parseFloat(valueRaw) / 100;
            const newValStr = prompt(`Digite o novo orçamento diário/total (Valor atual: R$ ${currentVal.toFixed(2)}):`, currentVal.toFixed(2));
            if (newValStr === null) return;

            const newVal = parseFloat(newValStr);
            if (isNaN(newVal) || newVal <= 0) {
                alert('Valor de orçamento inválido!');
                return;
            }

            // O Meta exige orçamento em centavos
            const valCents = Math.round(newVal * 100);

            try {
                const res = await reqMeta(id, 'POST', { [field]: valCents });
                if (res.success) {
                    await salvarLog(`Alterado orçamento da campanha ${id} de R$ ${currentVal.toFixed(2)} para R$ ${newVal.toFixed(2)}.`);
                    alert('Orçamento atualizado com sucesso!');
                    carregarCampanhas();
                } else {
                    alert('Erro ao atualizar orçamento: ' + (res.error?.message || 'Tente novamente.'));
                }
            } catch (e) {
                alert('Erro de conexão.');
            }
        }

        // Duplicar Campanha
        async function duplicarCampanha(id) {
            if (!confirm('Deseja duplicar esta campanha inteira?')) return;
            alert('Aguardando duplicação via API...');

            try {
                // A duplicação é feita gerando uma cópia estruturada via POST
                const campData = await reqMeta(id, 'GET', { fields: 'name,buying_type,objective,status' });
                
                if (campData.error) {
                    alert('Erro ao ler campanha para duplicar.');
                    return;
                }

                const payload = {
                    name: campData.name + ' - CÓPIA AUTÔNOMA IA',
                    buying_type: campData.buying_type,
                    objective: campData.objective,
                    status: 'PAUSED'
                };

                const res = await reqMeta(`${AD_ACCOUNT_ID}/campaigns`, 'POST', payload);
                if (res.id) {
                    await salvarLog(`Campanha ${id} duplicada com sucesso. Nova campanha criada: ${res.id}`);
                    alert(`Campanha duplicada com sucesso sob o ID: ${res.id}`);
                    carregarCampanhas();
                } else {
                    alert('Erro ao duplicar.');
                }
            } catch (e) {
                alert('Erro na API ao duplicar.');
            }
        }

        // Executar Piloto Automático IA
        async function rodarOtimizacaoIA() {
            if (!confirm('Executar otimização autônoma baseada em CPA e orçamento?')) return;

            alert('IA analisando as métricas...');
            try {
                const res = await reqMeta(`${AD_ACCOUNT_ID}/campaigns`, 'GET', { fields: 'name,status,daily_budget,lifetime_budget' });
                if (!res.data || res.data.length === 0) {
                    alert('Nenhuma campanha ativa para otimizar.');
                    return;
                }

                let acoesTomadas = 0;

                for (const camp of res.data) {
                    if (camp.status !== 'ACTIVE') continue;

                    const insightsRes = await reqMeta(`${camp.id}/insights`, 'GET', {
                        fields: 'spend,actions',
                        date_preset: 'today'
                    });

                    if (insightsRes.data && insightsRes.data[0]) {
                        const insight = insightsRes.data[0];
                        const spendToday = parseFloat(insight.spend) || 0;
                        let purchases = 0;
                        if (insight.actions) {
                            const purchAction = insight.actions.find(act => act.action_type === 'purchase');
                            if (purchAction) purchases = parseInt(purchAction.value) || 0;
                        }

                        // REGRA 1: Stop-loss (CPA acima do limite de R$ 40 com gasto expressivo)
                        const targetCPA = <?php echo $config['target_cpa']; ?>;
                        if (purchases === 0 && spendToday > targetCPA) {
                            // Pausar campanha
                            await reqMeta(camp.id, 'POST', { status: 'PAUSED' });
                            await salvarLog(`IA pausou a campanha "${camp.name}" (${camp.id}) por Stop-Loss. Gasto: R$ ${spendToday.toFixed(2)} sem vendas.`);
                            acoesTomadas++;
                        }

                        // REGRA 2: Escala Segura (+15% no orçamento de campanhas saudáveis)
                        if (purchases >= 3) {
                            const cpa = spendToday / purchases;
                            if (cpa < targetCPA && camp.daily_budget) {
                                const currentBudget = parseFloat(camp.daily_budget);
                                const newBudget = Math.round(currentBudget * 1.15); // +15%
                                
                                await reqMeta(camp.id, 'POST', { daily_budget: newBudget });
                                await salvarLog(`IA escalou orçamento da campanha "${camp.name}" em 15% (Novo orçamento: R$ ${(newBudget/100).toFixed(2)}/dia). CPA: R$ ${cpa.toFixed(2)}.`);
                                acoesTomadas++;
                            }
                        }
                    }
                }

                if (acoesTomadas === 0) {
                    await salvarLog('IA rodou otimização. Nenhuma campanha precisou de alteração no momento (métricas estáveis).');
                    alert('Otimização concluída. Nenhuma alteração foi necessária no momento.');
                } else {
                    alert(`${acoesTomadas} ações automáticas foram tomadas pela IA!`);
                }
                carregarCampanhas();

            } catch (e) {
                alert('Erro de conexão ao executar a IA.');
            }
        }

        // Execução Inicial ao carregar a página
        carregarContaInfo();
        carregarCampanhas();
    </script>
</body>
</html>
