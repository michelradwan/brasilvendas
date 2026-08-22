<?php
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    echo json_encode(['success' => false, 'message' => 'Método não permitido']);
    exit;
}

// Configurações da API Duttyfy
$apiUrl = 'https://www.links-pagamentos.online/api-pix/Akc4K4Bs4Q9sBfbGv3Kuh-9i39GvsmiE2IjP1IuCrdIlrDHCdCHF3UQ7zMlW-QmQa7KAfnDqL6QDvKX0kG2AHg';
$apiKey = 'b8ae99391cf645b2af25b66eef4b99d3';

// Ler dados recebidos do frontend
$rawInput = file_get_contents('php://input');
$inputData = json_decode($rawInput, true);

if (!$inputData) {
    $inputData = $_POST;
}

// Dados do Cliente
$name = isset($inputData['customer']['name']) ? trim($inputData['customer']['name']) : 'Cliente Patriota';
$cpf = isset($inputData['customer']['document']) ? preg_replace('/\D/', '', $inputData['customer']['document']) : '';
if (empty($cpf) && isset($inputData['customer']['cpf'])) {
    $cpf = preg_replace('/\D/', '', $inputData['customer']['cpf']);
}
$phone = isset($inputData['customer']['phone']) ? preg_replace('/\D/', '', $inputData['customer']['phone']) : '11999999999';
$email = isset($inputData['customer']['email']) ? trim($inputData['customer']['email']) : 'cliente@patriotas.com.br';
$size = isset($inputData['size']) ? trim($inputData['size']) : (isset($inputData['item']['size']) ? trim($inputData['item']['size']) : 'M');

// Dados de Entrega / Dropshipping
$address = isset($inputData['address']) ? $inputData['address'] : [];
$cep = isset($address['cep']) ? preg_replace('/\D/', '', $address['cep']) : '';
$street = isset($address['street']) ? trim($address['street']) : '';
$number = isset($address['number']) ? trim($address['number']) : 'S/N';
$complement = isset($address['complement']) ? trim($address['complement']) : '';
$neighborhood = isset($address['neighborhood']) ? trim($address['neighborhood']) : '';
$city = isset($address['city']) ? trim($address['city']) : '';
$state = isset($address['state']) ? strtoupper(trim($address['state'])) : '';

// Quantidade
// Limite de 1 a 10 unidades (mantendo valor abaixo de 1k)
$rawQtd = isset($inputData['quantity']) ? intval($inputData['quantity']) : (isset($inputData['item']['quantity']) ? intval($inputData['item']['quantity']) : 1);
$quantity = min(10, max(1, $rawQtd));

// Frete e Cálculo de Valores
$shippingType = isset($inputData['shipping']['type']) ? $inputData['shipping']['type'] : 'free';
$isExpress = ($shippingType === 'express');

// Preço proporcional por quantidade + Frete
$amountInCents = intval(($quantity * 8990) + ($isExpress ? 999 : 0));
$amountFormatted = ($quantity * 89.90) + ($isExpress ? 9.99 : 0.00);
$shippingLabel = $isExpress ? 'Frete Full Express (3 dias úteis)' : 'Frete Grátis (7 dias úteis)';

// Montar payload estrito para a Duttyfy
$payload = [
    'paymentMethod' => 'PIX',
    'customer' => [
        'name' => $name,
        'document' => $cpf,
        'email' => $email,
        'phone' => $phone
    ],
    'item' => [
        'title' => "{$quantity}x Kit Patriota 2026 (Tam {$size}) - {$shippingLabel}",
        'price' => $amountInCents,
        'quantity' => $quantity
    ],
    'amount' => $amountInCents
];

// Fazer chamada cURL para a API Duttyfy
$ch = curl_init();
curl_setopt($ch, CURLOPT_URL, $apiUrl);
curl_setopt($ch, CURLOPT_POST, true);
curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($payload));
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_HTTPHEADER, [
    'Content-Type: application/json',
    'Authorization: Bearer ' . $apiKey,
    'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
]);
curl_setopt($ch, CURLOPT_TIMEOUT, 20);
curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);

$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$curlError = curl_error($ch);
curl_close($ch);

$data = json_decode($response, true);

if ($data && (isset($data['pixCode']) || isset($data['pix_code']))) {
    $pixCode = isset($data['pixCode']) ? $data['pixCode'] : $data['pix_code'];
    $transactionId = isset($data['transactionId']) ? $data['transactionId'] : (isset($data['transaction_id']) ? $data['transaction_id'] : 'tx_' . uniqid());
    $qrcodeUrl = 'https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=' . urlencode($pixCode);

    // =========================================================================
    // SALVAR PEDIDO NO BANCO DE DADOS LOCAL (SQLite / JSON Seguro)
    // =========================================================================
    try {
        $dbDir = __DIR__ . '/storage';
        if (!is_dir($dbDir)) {
            mkdir($dbDir, 0755, true);
            // Proteger diretório de acesso HTTP direto
            file_put_contents($dbDir . '/.htaccess', "Order allow,deny\nDeny from all\n");
        }

        $dbFile = $dbDir . '/pedidos.sqlite';
        $pdo = new PDO('sqlite:' . $dbFile);
        $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

        // Criar tabela se não existir
        $pdo->exec("CREATE TABLE IF NOT EXISTS pedidos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            transaction_id TEXT UNIQUE,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            name TEXT,
            cpf TEXT,
            phone TEXT,
            email TEXT,
            size TEXT,
            shipping_type TEXT,
            shipping_label TEXT,
            amount REAL,
            status TEXT DEFAULT 'PENDENTE',
            cep TEXT,
            street TEXT,
            number TEXT,
            complement TEXT,
            neighborhood TEXT,
            city TEXT,
            state TEXT,
            pix_code TEXT
        )");

        $stmt = $pdo->prepare("INSERT OR REPLACE INTO pedidos (
            transaction_id, created_at, name, cpf, phone, email, size,
            shipping_type, shipping_label, amount, status, cep,
            street, number, complement, neighborhood, city, state, pix_code
        ) VALUES (
            :tx, :dt, :name, :cpf, :phone, :email, :size,
            :shipping_type, :shipping_label, :amount, 'PENDENTE', :cep,
            :street, :number, :complement, :neighborhood, :city, :state, :pix_code
        )");

        $stmt->execute([
            ':tx' => $transactionId,
            ':dt' => date('Y-m-d H:i:s'),
            ':name' => $name,
            ':cpf' => $cpf,
            ':phone' => $phone,
            ':email' => $email,
            ':size' => $size,
            ':shipping_type' => $shippingType,
            ':shipping_label' => $shippingLabel,
            ':amount' => $amountFormatted,
            ':cep' => $cep,
            ':street' => $street,
            ':number' => $number,
            ':complement' => $complement,
            ':neighborhood' => $neighborhood,
            ':city' => $city,
            ':state' => $state,
            ':pix_code' => $pixCode
        ]);
    } catch (Exception $e) {
        // Fallback em arquivo JSON seguro se SQLite não estiver disponível
        try {
            $jsonFile = __DIR__ . '/storage/pedidos.json';
            $pedidosList = file_exists($jsonFile) ? json_decode(file_get_contents($jsonFile), true) : [];
            if (!is_array($pedidosList)) $pedidosList = [];
            
            $pedidosList[] = [
                'transaction_id' => $transactionId,
                'created_at' => date('Y-m-d H:i:s'),
                'name' => $name,
                'cpf' => $cpf,
                'phone' => $phone,
                'email' => $email,
                'size' => $size,
                'shipping_type' => $shippingType,
                'shipping_label' => $shippingLabel,
                'amount' => $amountFormatted,
                'status' => 'PENDENTE',
                'cep' => $cep,
                'street' => $street,
                'number' => $number,
                'complement' => $complement,
                'neighborhood' => $neighborhood,
                'city' => $city,
                'state' => $state,
                'pix_code' => $pixCode
            ];
            file_put_contents($jsonFile, json_encode($pedidosList, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
        } catch(Exception $ex){}
    }

    echo json_encode([
        'success' => true,
        'transaction_id' => $transactionId,
        'pix_code' => $pixCode,
        'qrcode_url' => $qrcodeUrl,
        'amount' => $amountFormatted,
        'shipping' => [
            'type' => $shippingType,
            'label' => $shippingLabel,
            'amount' => $isExpress ? 9.99 : 0.00
        ],
        'status' => 'PENDING',
        'raw' => $data
    ]);
    exit;
}

echo json_encode([
    'success' => false,
    'http_code' => $httpCode,
    'error' => $data,
    'curl_error' => $curlError
]);
exit;
