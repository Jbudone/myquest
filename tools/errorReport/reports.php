<?php

$request = $_POST['request'];
$success = false;
$data = "";

if ($request == "fetchReport") {

    $reportId = $_POST['reportId'];
    $reportName = "report-";

    // Build report name, in case of malicious activity
    // All reports will be named "report-XXXXXXXXX.json" where X's are digits
    // NOTE: intval can return hex if str begins with "0x", but that should still be safe since its alphanumeric, and
    // any reports in the reports/ directory are safe to return
    $reportName .= intval($reportId);
    $reportName .= ".json";

    // Load report
    $report = file_get_contents("../../reports/" . $reportName);

    $data = array(
        "reportName" => $reportName,
        "report" => $report,
        "success" => true
    );

} else if ($request == "fetchReports") {

    $path    = '../../reports';
    $filesInDir = scandir($path);
    $files = array();
    foreach ($filesInDir as $file) {
        if (strpos($file, "report-") !== false) {
            array_push($files, $file);
        }
    }

    $data = array(
        "reports" => $files,
        "success" => true
    );
} else if ($request == "fetchSource") {

    $fileReq = trim($_POST['file']);
    $gitHeadReq = trim($_POST['gitHead']);
    $line = $_POST['line'];

    // Strip down the gitHead request to only letters/numbers (since git commits are sha1 hashes)
    // As long as its just alphanumeric, it should be safe to run in cmdline
    $matchedGitHead = null;
    preg_match('/^[a-zA-Z0-9]+$/', $gitHeadReq, $matchedGitHead);
    if (count($matchedGitHead) === 0 or strlen($matchedGitHead[0]) === 0) {
        $data = array(
            "success" => false,
            "reason" => "Could not filter gitHead request: $gitHeadReq"
        );

    } else {

        // Get all of the files in js from this commit. We want to see if this file is in the list tree rather than
        // blindly accept the users input (since its being passed into cmdline)
        $gitHead = $matchedGitHead[0];
        $filesInHeadBuff = shell_exec("git ls-tree --name-only --full-tree -r $gitHead js/");
        $filesInHead = explode("\n", $filesInHeadBuff);
        $indexOfFile = array_search($fileReq, $filesInHead);
        if ($indexOfFile === False) {
            // This file is not in the commit..Perhaps its a new file in staging and waiting to be added in the next
            // commit?

            $addedFilesInHeadBuff = shell_exec("git diff --name-only --cached");
            $addedFilesInHead = explode("\n", $addedFilesInHeadBuff);
            $indexOfFile = array_search($fileReq, $addedFilesInHead);
            if ($indexOfFile === False) {
                $data = array(
                    "success" => false,
                    "reason" => "File ($fileReq) does not exist in commit $gitHead"
                );
            } else {
                $file = $addedFilesInHead[$indexOfFile];
                $source = shell_exec("cat ../../$file"); // FIXME: There must be a way to do this safely within git?

                $data = array(
                    "ranthis" => "cat ../../$file",
                    "source" => $source,
                    "success" => true
                );
            }
        } else {

            $file = $filesInHead[$indexOfFile];
            $source = shell_exec("git show $gitHead:$file");

            $data = array(
                "ranthis" => "git show $gitHead:$file",
                "source" => $source,
                "success" => true
            );
        }
    }
}

echo json_encode($data);

