<?php
session_start();

// SENHA DE ACESSO AO PAINEL (Lida de variável de ambiente)
$envAdminPass = getenv('ADMIN_PASSWORD');
$ALLOWED_PASSWORDS = array_filter(array_unique([$envAdminPass]));

// Processar Logout
if (isset($_GET['logout'])) {
    session_destroy();
    header('Location: admin-pedidos.php');
    exit;
}

// Processar Login
$authError = '';
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['password'])) {
    $typedPass = trim($_POST['password']);
    if (in_array($typedPass, $ALLOWED_PASSWORDS)) {
        $_SESSION['admin_logged'] = true;
        header('Location: admin-pedidos.php');
        exit;
    } else {
        $authError = 'Senha incorreta. Tente novamente.';
    }
}

// Suporte a acesso direto via token de URL
if (isset($_GET['token']) && in_array($_GET['token'], $ALLOWED_PASSWORDS)) {
    $_SESSION['admin_logged'] = true;
}

// Verificar se está autenticado
$isLogged = isset($_SESSION['admin_logged']) && $_SESSION['admin_logged'] === true;

// Se não estiver logado, exibir tela de Login segura
if (!$isLogged) {
    ?>
    <!DOCTYPE html>
    <html lang="pt-BR" class="dark">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Painel de Pedidos - Acesso Restrito</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;900&family=Outfit:wght@600;800;900&display=swap" rel="stylesheet">
    </head>
    <body class="bg-[#090a0f] text-white font-['Inter'] min-h-screen flex items-center justify-center p-4">
        <div class="w-full max-w-md bg-[#0e1017] border border-white/10 p-8 rounded-3xl shadow-2xl">
            <div class="text-center mb-8">
                <div class="w-14 h-14 bg-yellow-400/10 text-yellow-400 rounded-2xl flex items-center justify-center mx-auto mb-4 text-2xl font-bold border border-yellow-400/20">🔒</div>
                <h1 class="font-['Outfit'] text-2xl font-bold">Painel de Pedidos</h1>
                <p class="text-xs text-gray-400 mt-1">Acesso seguro e anônimo ao banco de dados</p>
            </div>

            <?php if (!empty($authError)): ?>
                <div class="bg-red-500/10 border border-red-500/30 text-red-400 text-xs p-3.5 rounded-xl mb-5 text-center">
                    <?= htmlspecialchars($authError) ?>
                </div>
            <?php endif; ?>

            <form method="POST" class="space-y-4">
                <div>
                    <label class="block text-xs font-semibold text-gray-300 mb-1.5">Senha de Acesso</label>
                    <input type="password" name="password" required placeholder="Digite a senha..." class="w-full bg-[#151822] border border-white/10 rounded-xl p-3.5 text-white placeholder-gray-500 focus:outline-none focus:border-yellow-400 text-sm transition-colors">
                </div>
                <button type="submit" class="w-full bg-yellow-400 hover:bg-yellow-300 text-gray-900 font-['Outfit'] font-black py-3.5 rounded-xl transition-all shadow-lg shadow-yellow-400/20 active:scale-[0.98]">
                    ENTRAR NO PAINEL ➔
                </button>
            </form>
        </div>
    </body>
    </html>
    <?php
    exit;
}

// =============================================================================
// CARREGAR PEDIDOS DO BANCO DE DADOS LOCAL
// =============================================================================
$pedidos = [];
$dbFile = __DIR__ . '/storage/pedidos.sqlite';
$jsonFile = __DIR__ . '/storage/pedidos.json';

if (file_exists($dbFile)) {
    try {
        $pdo = new PDO('sqlite:' . $dbFile);
        $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        $stmt = $pdo->query("SELECT * FROM pedidos ORDER BY id DESC");
        $pedidos = $stmt->fetchAll(PDO::FETCH_ASSOC);
    } catch (Exception $e) {}
}

if (empty($pedidos) && file_exists($jsonFile)) {
    try {
        $pedidos = json_decode(file_get_contents($jsonFile), true);
        if (is_array($pedidos)) {
            $pedidos = array_reverse($pedidos);
        }
    } catch (Exception $e) {}
}

if (!is_array($pedidos)) $pedidos = [];

// Exportar CSV
if (isset($_GET['export']) && $_GET['export'] === 'csv') {
    header('Content-Type: text/csv; charset=utf-8');
    header('Content-Disposition: attachment; filename=pedidos_dropshipping_' . date('Y-m-d_His') . '.csv');
    $output = fopen('php://output', 'w');
    fprintf($output, chr(0xEF).chr(0xBB).chr(0xBF)); // BOM UTF-8 para Excel
    fputcsv($output, ['ID Transacao', 'Data', 'Status', 'Nome', 'CPF', 'Telefone/WhatsApp', 'E-mail', 'Tamanho Camisa', 'Tipo Frete', 'Valor (R$)', 'CEP', 'Rua', 'Numero', 'Complemento', 'Bairro', 'Cidade', 'UF']);
    
    foreach ($pedidos as $p) {
        fputcsv($output, [
            $p['transaction_id'] ?? '',
            $p['created_at'] ?? '',
            $p['status'] ?? 'PENDENTE',
            $p['name'] ?? '',
            $p['cpf'] ?? '',
            $p['phone'] ?? '',
            $p['email'] ?? '',
            $p['size'] ?? 'M',
            $p['shipping_label'] ?? $p['shipping_type'] ?? 'Frete Grátis',
            number_format((float)($p['amount'] ?? 89.90), 2, ',', '.'),
            $p['cep'] ?? '',
            $p['street'] ?? '',
            $p['number'] ?? '',
            $p['complement'] ?? '',
            $p['neighborhood'] ?? '',
            $p['city'] ?? '',
            $p['state'] ?? ''
        ]);
    }
    fclose($output);
    exit;
}

// Métricas do Dashboard
$totalPedidos = count($pedidos);
$totalPagos = 0;
$faturamento = 0;
$totalExpress = 0;

foreach ($pedidos as $p) {
    $status = strtoupper($p['status'] ?? 'PENDENTE');
    if ($status === 'APROVADO' || $status === 'PAID' || $status === 'PAGO') {
        $totalPagos++;
        $faturamento += (float)($p['amount'] ?? 89.90);
    }
    if (isset($p['shipping_type']) && $p['shipping_type'] === 'express') {
        $totalExpress++;
    }
}
?>
<!DOCTYPE html>
<html lang="pt-BR" class="dark">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Painel de Pedidos & Dropshipping</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=Outfit:wght@500;600;700;800;900&display=swap" rel="stylesheet">
    <style>
        body { font-family: 'Inter', sans-serif; }
        .font-outfit { font-family: 'Outfit', sans-serif; }
    </style>
</head>
<body class="bg-[#08090d] text-gray-200 min-h-screen">
    
    <!-- Topbar -->
    <header class="border-b border-white/10 bg-[#0e1017]/80 backdrop-blur-md sticky top-0 z-50">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
            <div class="flex items-center space-x-3">
                <div class="w-9 h-9 rounded-xl bg-yellow-400/20 text-yellow-400 flex items-center justify-center font-bold font-outfit text-lg">🇧🇷</div>
                <div>
                    <h1 class="font-outfit text-lg font-bold text-white">Brasil Vendas — Gestão de Pedidos</h1>
                    <p class="text-[11px] text-gray-400">Banco de dados local anônimo & dropshipping</p>
                </div>
            </div>
            <div class="flex items-center space-x-3">
                <a href="admin-pedidos.php?export=csv" class="bg-emerald-500/20 border border-emerald-500/40 hover:bg-emerald-500/30 text-emerald-300 text-xs font-semibold px-4 py-2 rounded-xl transition-colors flex items-center space-x-2">
                    <span>📥 Baixar Excel / CSV</span>
                </a>
                <a href="admin-pedidos.php?logout=1" class="text-xs text-gray-400 hover:text-red-400 px-3 py-2 transition-colors">
                    Sair
                </a>
            </div>
        </div>
    </header>

    <main class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        
        <!-- Cards de Métricas -->
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <div class="bg-[#11141e] border border-white/5 p-5 rounded-2xl">
                <p class="text-xs text-gray-400 uppercase tracking-wider font-semibold">Total de Pedidos Gerados</p>
                <p class="text-3xl font-outfit font-black text-white mt-1"><?= $totalPedidos ?></p>
            </div>
            <div class="bg-[#11141e] border border-emerald-500/20 p-5 rounded-2xl">
                <p class="text-xs text-emerald-400 uppercase tracking-wider font-semibold">Pedidos Pagos (PIX)</p>
                <p class="text-3xl font-outfit font-black text-emerald-400 mt-1"><?= $totalPagos ?></p>
            </div>
            <div class="bg-[#11141e] border border-yellow-400/20 p-5 rounded-2xl">
                <p class="text-xs text-yellow-400 uppercase tracking-wider font-semibold">Faturamento Aprovado</p>
                <p class="text-3xl font-outfit font-black text-yellow-400 mt-1">R$ <?= number_format($faturamento, 2, ',', '.') ?></p>
            </div>
            <div class="bg-[#11141e] border border-purple-500/20 p-5 rounded-2xl">
                <p class="text-xs text-purple-400 uppercase tracking-wider font-semibold">Frete Full Express (Bump)</p>
                <p class="text-3xl font-outfit font-black text-purple-300 mt-1"><?= $totalExpress ?> pedidos</p>
            </div>
        </div>

        <!-- Tabela de Pedidos -->
        <div class="bg-[#11141e] border border-white/10 rounded-2xl overflow-hidden shadow-2xl">
            <div class="p-5 border-b border-white/10 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h2 class="font-outfit text-lg font-bold text-white">Lista de Pedidos para Despacho</h2>
                    <p class="text-xs text-gray-400">Copie o endereço e tamanho para enviar ao fornecedor</p>
                </div>
                <input type="text" id="filtro-busca" placeholder="Buscar por nome, CPF ou cidade..." onkeyup="filtrarTabela()" class="bg-[#181c2a] border border-white/10 rounded-xl px-4 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-yellow-400 w-full sm:w-72">
            </div>

            <?php if (empty($pedidos)): ?>
                <div class="p-12 text-center text-gray-500">
                    <p class="text-4xl mb-3">📦</p>
                    <p class="font-semibold text-sm">Nenhum pedido registrado ainda.</p>
                    <p class="text-xs text-gray-600 mt-1">Assim que um cliente gerar um PIX no site, ele aparecerá aqui automaticamente!</p>
                </div>
            <?php else: ?>
                <div class="overflow-x-auto">
                    <table class="w-full text-left text-xs" id="tabela-pedidos">
                        <thead class="bg-[#161a27] text-gray-400 uppercase tracking-wider text-[10px]">
                            <tr>
                                <th class="p-4">Data / Status</th>
                                <th class="p-4">Cliente & Contato</th>
                                <th class="p-4">Item & Tamanho</th>
                                <th class="p-4">Endereço de Entrega</th>
                                <th class="p-4">Frete / Valor</th>
                                <th class="p-4 text-center">Ações</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-white/5 text-gray-300">
                            <?php foreach ($pedidos as $p): 
                                $status = strtoupper($p['status'] ?? 'PENDENTE');
                                $isPago = ($status === 'APROVADO' || $status === 'PAID' || $status === 'PAGO');
                                $fullAddress = trim(($p['street'] ?? '') . ', ' . ($p['number'] ?? '') . ' ' . ($p['complement'] ?? '') . ' - ' . ($p['neighborhood'] ?? '') . ' - ' . ($p['city'] ?? '') . '/' . ($p['state'] ?? '') . ' - CEP: ' . ($p['cep'] ?? ''));
                                $phoneClean = preg_replace('/\D/', '', $p['phone'] ?? '');
                            ?>
                                <tr class="hover:bg-white/[0.02] transition-colors pedido-row">
                                    <!-- Data e Status -->
                                    <td class="p-4 whitespace-nowrap">
                                        <p class="font-medium text-white"><?= date('d/m/Y H:i', strtotime($p['created_at'] ?? 'now')) ?></p>
                                        <div class="mt-1.5">
                                            <?php if ($isPago): ?>
                                                <span class="inline-flex items-center space-x-1.5 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-md font-bold text-[10px]">
                                                    <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                                                    <span>PAGO</span>
                                                </span>
                                            <?php else: ?>
                                                <span class="inline-flex items-center space-x-1.5 bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 px-2 py-0.5 rounded-md font-medium text-[10px]">
                                                    <span class="w-1.5 h-1.5 rounded-full bg-yellow-400"></span>
                                                    <span>PENDENTE</span>
                                                </span>
                                            <?php endif; ?>
                                        </div>
                                    </td>

                                    <!-- Cliente e Contato -->
                                    <td class="p-4">
                                        <p class="font-bold text-white text-sm cliente-nome"><?= htmlspecialchars($p['name'] ?? 'Sem Nome') ?></p>
                                        <p class="text-[11px] text-gray-400">CPF: <?= htmlspecialchars($p['cpf'] ?? '-') ?></p>
                                        <div class="mt-1 flex items-center space-x-2">
                                            <a href="https://wa.me/55<?= $phoneClean ?>" target="_blank" class="inline-flex items-center space-x-1 text-emerald-400 hover:text-emerald-300 font-semibold text-[11px]">
                                                <span>💬 <?= htmlspecialchars($p['phone'] ?? '-') ?></span>
                                            </a>
                                        </div>
                                        <p class="text-[10px] text-gray-500 truncate max-w-[180px]"><?= htmlspecialchars($p['email'] ?? '') ?></p>
                                    </td>

                                    <!-- Item e Tamanho -->
                                    <td class="p-4 whitespace-nowrap">
                                        <p class="font-bold text-white">Kit Patriota 2025</p>
                                        <span class="inline-block bg-yellow-400/20 text-yellow-400 border border-yellow-400/30 px-2 py-0.5 rounded-md font-black text-xs mt-1">
                                            TAM: <?= htmlspecialchars($p['size'] ?? 'M') ?>
                                        </span>
                                    </td>

                                    <!-- Endereço Completo -->
                                    <td class="p-4 max-w-xs">
                                        <p class="text-gray-200 text-xs leading-relaxed font-medium cliente-endereco"><?= htmlspecialchars($fullAddress) ?></p>
                                    </td>

                                    <!-- Frete e Valor -->
                                    <td class="p-4 whitespace-nowrap">
                                        <p class="text-sm font-black text-white">R$ <?= number_format((float)($p['amount'] ?? 89.90), 2, ',', '.') ?></p>
                                        <p class="text-[10px] <?= (isset($p['shipping_type']) && $p['shipping_type'] === 'express') ? 'text-purple-400 font-bold' : 'text-gray-400' ?>">
                                            <?= htmlspecialchars($p['shipping_label'] ?? 'Frete Grátis') ?>
                                        </p>
                                    </td>

                                    <!-- Ações -->
                                    <td class="p-4 text-center whitespace-nowrap">
                                        <button onclick="copiarTexto('<?= addslashes($fullAddress) ?>', this)" class="bg-[#1c2132] hover:bg-yellow-400 hover:text-gray-900 text-gray-300 font-medium px-3 py-1.5 rounded-lg text-[11px] transition-colors border border-white/10">
                                            📋 Copiar Endereço
                                        </button>
                                    </td>
                                </tr>
                            <?php endforeach; ?>
                        </tbody>
                    </table>
                </div>
            <?php endif; ?>
        </div>

    </main>

    <script>
        function copiarTexto(texto, btn) {
            navigator.clipboard.writeText(texto).then(() => {
                const original = btn.textContent;
                btn.textContent = "✓ Copiado!";
                btn.classList.add('bg-emerald-500', 'text-gray-900');
                setTimeout(() => {
                    btn.textContent = original;
                    btn.classList.remove('bg-emerald-500', 'text-gray-900');
                }, 2000);
            });
        }

        function filtrarTabela() {
            const query = document.getElementById('filtro-busca').value.toLowerCase();
            const rows = document.querySelectorAll('.pedido-row');
            
            rows.forEach(row => {
                const texto = row.innerText.toLowerCase();
                if (texto.includes(query)) {
                    row.style.display = '';
                } else {
                    row.style.display = 'none';
                }
            });
        }
    </script>
</body>
</html>
