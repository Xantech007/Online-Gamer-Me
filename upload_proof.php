<?php
header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Method not allowed.']);
    exit;
}

if (!isset($_FILES['receipt']) || $_FILES['receipt']['error'] !== UPLOAD_ERR_OK) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'No valid receipt image provided.']);
    exit;
}

$file = $_FILES['receipt'];
$extension = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
$allowedExtensions = ['jpg', 'jpeg', 'png', 'webp'];

if (!in_array($extension, $allowedExtensions)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Invalid file format. Only JPG, PNG, and WEBP allowed.']);
    exit;
}

$targetDir = __DIR__ . '/proof/';
if (!is_dir($targetDir)) {
    mkdir($targetDir, 0755, true);
}

// Generate unique filename to avoid collisions
$fileName = time() . '_' . bin2hex(random_bytes(6)) . '.' . $extension;
$targetPath = $targetDir . $fileName;
$relativePath = 'proof/' . $fileName;

if (move_uploaded_file($file['tmp_name'], $targetPath)) {
    echo json_encode([
        'success' => true,
        'fileName' => $fileName,
        'filePath' => $relativePath
    ]);
} else {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Failed to save uploaded file on server.']);
}
