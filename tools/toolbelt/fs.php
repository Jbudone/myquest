<?php

$request = $_POST['request'];
$success = false;

if ($request == "save") {

	$data = $_POST['data'];
	$success = file_put_contents($_POST['file'], $data);
    $postReq = json_encode($_POST);

    if ($success) {
        echo '{ "success": true }';
    } else {
        echo '{ "success": false, "data": '.$postReq.' }';
    }

    exit;

} else if ($request === "fetchImages") {

    // Fetch all images in subdirectory
    //find resources/sprites -iname '*.png'

    ob_start();
    //passthru("find /resources/sprites -iname '*.png'");
    passthru("find ../../resources/sprites -iname '*.png' | sed 's/^..\/..\///g' | xargs --delimiter='\\\\n' | perl -p -e 's/\n/###SEP###/'");
    $fileListing = ob_get_contents();
    ob_end_clean(); //Use this instead of ob_flush()

    $fileListing = substr($fileListing, 0, -1); // Get rid of newline; thought xargs -d'\n' would work, but apparently not
    $postReq = $fileListing;
    echo '{ "success": true, "data": "'.$postReq.'" }';

    exit;
} else if ($request === "waitAMin") {

    // NOTE: Session will not be allowed to start/resume from further spawns of the same script until the previous
    // session has closed. Therefore need to close the sessino before we do any long term synchronous processing
    session_start();
    if ($_SESSION['waiting']) {
        echo '{ "success": false, "reason": "already waiting bro" }';
        exit;
    } else {

        $_SESSION['waiting'] = true;

        session_write_close();
        sleep(3);
        session_start();
        echo '{ "success": true }';
        $_SESSION['waiting'] = false;
        session_write_close();
    }
    exit;
} else if ($request === "processImage") {

    // NOTE: Session will not be allowed to start/resume from further spawns of the same script until the previous
    // session has closed. Therefore need to close the sessino before we do any long term synchronous processing
    session_start();
    if ($_SESSION['processingImage'] !== NULL) {
        // Cancel previous session somehow (either halt the session/script, or actually kill the pid)
        ob_start();
        $processingOnPid = $_SESSION['processingImage'];
        passthru("kill $processingOnPid");
        //ob_get_contents();
        ob_end_clean(); //Use this instead of ob_flush()
    }

    $imageSrc = $_POST['imageSrc'];
    $imageProcess = $_POST['process'];
    $imagePath = $_POST['outputPath'];
    $imageOutput = $_POST['output'];
    $imageBasename = $_POST['basename'];

    // Does the file already exist?
    if (file_exists("../../$imageOutput")) {
        echo '{ "success": true, "results": "file already exists" }';
        exit;
    }

    $_SESSION['processingImage'] = getmypid();
    session_write_close();

    // Process the image, close the session in case we want to make further calls (which will kill this synchronous
    // process)
    ob_start();
    if (!file_exists("../../$imagePath")) {
        mkdir("../../$imagePath", 0777);
    }
    
    $runCmd = "rm \"../../$imagePath/$imageBasename*\" ; convert \"../../$imageSrc\"  $imageProcess \"../../$imageOutput\"";
    passthru($runCmd);
    $results = ob_get_contents();
    ob_end_clean(); //Use this instead of ob_flush()

    session_start();
    $_SESSION['processingImage'] = NULL;
    session_write_close();

    echo '{ "success": true, "results": "'.$results.'", "ranCmd": "'.$runCmd.'" }';
    exit;
} else if ($request === "cancelProcessImage") {
    // Explicitly cancel a previously established process
    // This would be used in case we close the image options and no longer need a preview

    session_start();
    $results = "None";
    if ($_SESSION['processingImage'] !== NULL) {
        ob_start();
        $processingOnPid = $_SESSION['processingImage'];
        passthru("kill $processingOnPid");
        $results = ob_get_contents();
        ob_end_clean(); //Use this instead of ob_flush()
    }

    $_SESSION['processingImage'] = NULL;
    echo '{ "success": true, "results": "'.$results.'" }';
}


