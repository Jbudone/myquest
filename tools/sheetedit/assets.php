<?php

$request = $_POST['request'];
$success = false;

if ($request == "sheets") {

	$assets = json_encode($_POST['assets']);
	$success = file_put_contents($_POST['file'], $assets);

} else if ($request == "avatars") {

	$avatars = json_encode($_POST['avatars']);
	$image   = $_POST['image'];
$image = str_replace('data:image/png;base64,', '', $image);
$image = str_replace(' ', '+', $image);
	$success = file_put_contents($_POST['file'], $avatars) &&
			   file_put_contents($_POST['file_image'], base64_decode($image));

}

if ($success) {
	echo '{ "success": true }';
} else {
	echo '{ "success": false, "data": "'.$data.'" }';
}

