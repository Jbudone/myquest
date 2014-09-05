<?php

$assets = json_encode($_POST['assets']);
$success = file_put_contents('../../data/assets.json', $assets);

if ($success) {
	echo '{ "success": true }';
} else {
	echo '{ "success": false }';
}

