<?php

$request = $_POST['request'];
$success = false;
$data = "";

if ($request == "fetchReport") {

    $reportId = $_POST['reportId'];
    $reportName = "report-";

    // Build report name, in case of malicious activity
    // All reports will be named "report-XXXXXXXXX.json" where X's are digits
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
}

echo json_encode($data);

