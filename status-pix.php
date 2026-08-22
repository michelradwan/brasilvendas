<?php
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

$apiKey = 'b8ae99391cf645b2af25b66eef4b99d3';
$txId = isset($_GET['id']) ? trim($_GET['id']) : '';

if (empty($txId)) {
    echo json_encode(['success' => false, 'status' => 'pending']);
    exit;
}

// Consultar status na Duttyfy
$apiUrl = 'https://www.links-pagamentos.online/api-pix/status/' . urlencode($txId);

$ch = curl_init();
curl_setopt($ch, CURLOPT_URL, $apiUrl);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_HTTPHEADER, [
    'Authorization: Bearer ' . $apiKey,
    'Accept: application/json'
]);
curl_setopt($ch, CURLOPT_TIMEOUT, 10);
curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);

$response = curl_exec($ch);
curl_close($ch);

$status = 'pending';
if ($response) {
    $data = json_decode($response, true);
    if (isset($data['status']) && in_array(strtolower($data['status']), ['paid', 'approved', 'pago', 'completed'])) {
        $status = 'paid';
    }
}

echo json_encode([
    'success' => true,
    'transaction_id' => $txId,
    'status' => $status
]);
exit;
