<?php

$request = $_POST['request'];
$success = false;

if ($request == "save") {

	$data = $_POST['data'];
	$success = file_put_contents($_POST['file'], $data);
    $postReq = json_encode($_POST);

}

if ($success) {
	echo '{ "success": true }';
} else {
	echo '{ "success": false, "data": '.$postReq.' }';
}

