
// Load up Error Reporting
$(document).ready(() => {

    const System = {
        UI: {
            reportsList: $('#reportsList'),
            report: $('#report'),
            server: {
                container: $('#report-server'),
                logs:      $('#report-server-logs'),
                error:     $('#report-server-error'),
                dump:      $('#report-server-dump')
            },
            client: {
                container: $('#report-client'),
                logs:      $('#report-client-logs'),
                error:     $('#report-client-error'),
                dump:      $('#report-client-dump')
            }
        },
        Report: null
    };

    window.System = System;

    // ================================================================ //

    const loadReports = () => {

        $.post('reports.php', {
            request: "fetchReports"
        }, (data) => {
            const json  = JSON.parse(data),
                success = !!json.success;

            console.log('Fetching Reports: '+(success?'true':'false'));

            if (success) {
                // Fill Reports List
                console.log(json);

                System.UI.reportsList.html(""); // TODO: Nope..
                for (let i = 0; i < json.reports.length; ++i) {

                    const reportName = json.reports[i];

                    // report-00000001.json
                    let reportId = reportName;
                    reportId = reportId.substr(reportId.indexOf('-') + 1); // 00000001.json
                    reportId = reportId.substr(0, reportId.indexOf('.'));

                    const date = new Date();
                    date.setTime(reportId);

                    const reportTitle = `Report ${date.toLocaleString()}`;

                    // Build report link here
                    $('<div/>')
                        .addClass('reportId')
                        .append(
                            $('<a/>')
                            .attr('href', '')
                            .data('id', reportId)
                            .on('click', (e) => {
                                const reportId = $(e.target).data('id');
                                console.log("Attempting to load report: " + reportId);
                                loadReport( reportId );
                                return false;
                            })
                            .text(reportTitle)
                            .addClass('reportLink')
                    ).appendTo( System.UI.reportsList );
                }
            }
        });
    };

    const loadReport = (reportId) => {

        return new Promise((success, fail) => {
            $.post('reports.php', {
                request: "fetchReport",
                reportId: reportId
            }, (data) => {
                const json  = JSON.parse(data),
                    success = !!json.success;

                console.log('Fetching Report: '+(success?'true':'false'));

                if (success) {
                    let report = null;
                    try {
                        report = JSON.parse(json.report);
                        console.log(report);
                    } catch(e) {
                        console.error("Error parsing report");
                        console.error(e);
                    }

                    if (report) {
                        System.Report = report;
                        setupReport(report);
                    }
                }
            });
        });
    };

    // ================================================================ //

    const setupReport = (report) => {

        // Log, Error, Dump

        // TODO: For stupid reasons the clients JSON needs to be double-parsed

        let clientReport = null;
        if (report.client) {
            clientReport = JSON.parse(report.client.report);
        }

        const reportContexts = {
            'client': {
                report: clientReport,
                context: System.UI.client
            },
            'server': {
                report: report.server,
                context: System.UI.server
            }
        };

        for (const contextName in reportContexts) {
            const reportContext = reportContexts[contextName],
                context = reportContext.context,
                report = reportContext.report;

            // TODO: Clear UI context (regardless of if report exists or not)
            context.logs.html('');
            context.error.html('');

            if (report) {

                if (report.error) {

                    let err = report.error,
                        stack = err.stack.split('\n');

                    const stackEl = $('<div/>')
                                        .addClass('error-stack')
                                        .appendTo(context.error);

                    // FIXME: stack[0] is the message

                    // Parse the frames
                    const frames = [];
                    for (let i = 1; i < stack.length; ++i) {

                        const stackFrame = stack[i],
                            frame = /\s*at\s*(\w+\.?\w*(\(.+\))?).+\(([^\:]+)\:(\d*)\:(\d*)/g.exec(stackFrame.trim());
                        // at BuffMgr.(anonymous function) [as initialize] 
                        if (frame && frame.length === 6) {
                            let file   = frame[3],
                                fileType = "";
                                func   = frame[1],
                                line   = frame[4],
                                col    = frame[5];


                            let formatedFile = /.*myquest\/dist\/(.+)$/g.exec(file);
                            if (formatedFile && formatedFile.length === 2) {
                                formatedFile = formatedFile[1];

                                if (formatedFile.indexOf("scripts/") === 0) {
                                    fileType = "script";
                                }
                            } else if (file.indexOf("node_modules") >= 0) {
                                formatedFile = file.substr(file.indexOf("node_modules"));
                                fileType = "lib";
                            } else {
                                formatedFile = file;
                            }

                            frames.push({
                                file: formatedFile,
                                fileType: fileType,
                                func: func,
                                line: line,
                                col: col
                            });
                        } else {
                            console.error(`Not sure what to make of ${stackFrame}`);
                        }
                    }

                    for (let i = 0; i < frames.length; ++i) {

                        let frame = frames[i];

                        $('<div/>')
                            .addClass('stackframe')
                            .append(
                                $('<a/>')
                                .addClass('stackframe-line')
                                .text(frame.line)
                            )
                            .append(
                                $('<a/>')
                                .addClass('stackframe-file')
                                .addClass('stackframe-file-'+frame.fileType)
                                .text(frame.file)
                            )
                            .append(
                                $('<a/>')
                                .addClass('stackframe-func')
                                .text(frame.func)
                            )
                            .appendTo(stackEl);
                    }
                }

                // TODO: Add Logs/Dump/Errors
                if (report.logs) {
                    for (let i = 0; i < report.logs.length; ++i) {
                        const log = report.logs[i];

                        if (!log) break; // Log buffer may have not been filled yet

                        $('<div/>')
                            .addClass('log')
                            .append(
                                $('<a/>')
                                .text(log.message)
                            )
                            .appendTo(context.logs);
                    }
                }
            }
        }
    };

    // ================================================================ //


    loadReports();

    window.loadReport = loadReport;
});
