<?php

$request = $_POST['request'];

if ($request === 'save') {

	$data = $_POST['data'];
	$success = file_put_contents($_POST['file'], $data);
    $postReq = json_encode($_POST);

    if ($success) {
        echo '{ "success": true }';
    } else {
        echo '{ "success": false, "results": '.$postReq.' }';
    }

    exit;
} else if ($request === 'saveWorld') {

	$data = $_POST['data'];
	$success = file_put_contents($_POST['file'], $data);
    $postReq = json_encode($_POST);

    if ($success) {
        echo '{ "success": true }';
    } else {
        echo '{ "success": false, "results": '.$postReq.' }';
    }

    exit;
} else if ($request === 'load') {

    $data = file_get_contents($_POST['file']);
    $retData = array(
        'success' => true,
        'mapData' => $data
    );

    echo json_encode($retData);
}
