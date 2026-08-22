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

$name = isset($inputData['customer']['name']) ? trim($inputData['customer']['name']) : (isset($inputData['name']) ? trim($inputData['name']) : 'Cliente Patriota');
$cpf = isset($inputData['customer']['cpf']) ? preg_replace('/\D/', '', $inputData['customer']['cpf']) : (isset($inputData['cpf']) ? preg_replace('/\D/', '', $inputData['cpf']) : '');
$phone = isset($inputData['customer']['phone']) ? preg_replace('/\D/', '', $inputData['customer']['phone']) : (isset($inputData['phone']) ? preg_replace('/\D/', '', $inputData['phone']) : '11999999999');
$email = isset($inputData['customer']['email']) ? trim($inputData['customer']['email']) : (isset($inputData['email']) ? trim($inputData['email']) : 'cliente@patriotas.com.br');
$size = isset($inputData['size']) ? trim($inputData['size']) : 'M';

// Garantir CPF válido caso venha vazio
if (strlen($cpf) !== 11) {
    $cpf = '12345678909';
}

$amountInCents = 8990; // R$ 89,90 em centavos

// Montar payload exato exigido pela API Duttyfy
$payload = [
    'paymentMethod' => 'PIX',
    'customer' => [
        'name' => $name,
        'document' => $cpf,
        'email' => $email,
        'phone' => $phone
    ],
    'item' => [
        'title' => 'Kit Patriota 2025 - Tam ' . $size,
        'price' => $amountInCents,
        'quantity' => 1
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

if ($data && isset($data['pixCode'])) {
    $pixCode = $data['pixCode'];
    $transactionId = $data['transactionId'];
    $qrcodeUrl = 'https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=' . urlencode($pixCode);

    echo json_encode([
        'success' => true,
        'transaction_id' => $transactionId,
        'pix_code' => $pixCode,
        'qrcode_url' => $qrcodeUrl,
        'amount' => 89.90,
        'status' => 'PENDING',
        'raw' => $data
    ]);
    exit;
}

// Em caso de erro da API externa
echo json_encode([
    'success' => false,
    'http_code' => $httpCode,
    'error' => $data,
    'curl_error' => $curlError
]);
exit;
