
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

                        // Load source code for each frame on the stack
                        const reportContextList = [];
                        if (report.server) reportContextList.push(report.server);
                        if (report.client) reportContextList.push(report.client);

                        reportContextList.forEach((reportContext) => {
                            if
                            (
                                reportContext.error &&
                                reportContext.error.parsed &&
                                reportContext.error.parsed.stack // FIXME: Yuck!
                            )
                            {
                                const gitHead = report.gitHead,
                                    reportDir = reportContext.error.parsed.reportDir,
                                    stack     = reportContext.error.parsed.stack;

                                let loadingList = [];
                                for (let i = 0; i < stack.length; ++i) {
                                    let stackFrame = stack[i],
                                        file = stackFrame.file;

                                    if (!file || !stackFrame.inWorkingDir) continue;

                                    file = 'js' + file.replace(reportDir, ''); // Strip out the dir

                                    const loadFilePromise = new Promise((loadedFile, failedToLoadFile) => {

                                        $.post('reports.php', {
                                            request: "fetchSource",
                                            file: file,
                                            gitHead: gitHead
                                        }, (data) => {
                                            const json  = JSON.parse(data),
                                                success = !!json.success;

                                            if (success) {
                                                stackFrame.source = json.source.split('\n');
                                                loadedFile(stackFrame.source);
                                            } else {
                                                console.error(`Could not fetch source for file ${file}`);
                                                debugger;
                                                failedToLoadFile(json);
                                            }
                                        });
                                    });

                                    loadingList.push(loadFilePromise);
                                }

                                Promise.all(loadingList).then(files => {
                                    System.Report = report;
                                    setupReport(report);
                                });
                            }
                        });
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
                        frames = err.parsed.stack,
                        reportDir = err.parsed.reportDir,
                        stack = err.stack.split('\n');

                    const crashSiteEl = $('<pre/>')
                                        .addClass('prettyprint')
                                        .addClass('lang-js')
                                        .addClass('error-stack-site')
                                        .appendTo(context.error);

                    const stackEl = $('<div/>')
                                        .addClass('error-stack')
                                        .appendTo(context.error);

                    let activeFrame = null;
                    for (let i = 0; i < frames.length; ++i) {

                        let frame    = frames[i],
                            file     = frame.file,
                            fileType = "",
                            source   = frame.source,
                            sourceLine = "";

                        if (file) {
                            if (frame.inWorkingDir) {

                                file = file.replace(reportDir, "");
                                if (file.indexOf("scripts/") !== -1) {
                                    fileType = "script";
                                }
                            } else {

                                if (file.indexOf("node_modules") !== -1) {
                                    file = file.substr(file.indexOf("node_modules"));
                                }

                                fileType = "lib";
                            }
                        } else {
                            continue;
                        }

                        if (source) {
                            sourceLine = source[frame.line-1] || ".";
                            sourceLine = sourceLine.trim();
                        } else {
                            sourceLine = ".";
                        }

                        const stackframeLinkEl = $('<a/>')
                            .addClass('stackframe-link')
                            .attr('href', '#')
                            .click(() => {
                                highlightFrame();
                                return false;
                            })
                            .appendTo(stackEl);
                        const stackframeEl = $('<div/>')
                            .addClass('stackframe')
                            .append(
                                $('<a/>')
                                .addClass('stackframe-line')
                                .text(frame.line)
                            )
                            .append(
                                $('<a/>')
                                .addClass('stackframe-file')
                                .addClass('stackframe-file-'+fileType)
                                .text(file)
                            )
                            .append(
                                $('<a/>')
                                .addClass('stackframe-func')
                                .text(frame.func)
                            )
                            .append(
                                $('<pre/>')
                                .addClass('prettyprint')
                                .addClass('lang-js')
                                .addClass('stackframe-source')
                                .text(sourceLine)
                            )
                            .appendTo(stackframeLinkEl);


                        const highlightFrame = function(){

                            if (activeFrame) {
                                activeFrame.removeClass('active');
                            }
                            activeFrame = stackframeEl;
                            activeFrame.addClass('active');

                            const crashSite = [],
                                linesAbout = 3,
                                lineMin = Math.max(0, frame.line - 1 - linesAbout),
                                lineMax = Math.min(source.length - 1, frame.line - 1 + linesAbout);

                            crashSiteEl.html('');
                            for (let line = lineMin; line <= lineMax; ++line) {
                                const codeLine = frame.source[line];
                                crashSiteEl.text(crashSiteEl.text() + codeLine + '\n');
                            }

                            crashSiteEl.removeClass('prettyprinted');
                            PR.prettyPrint();
                        };

                        // Highlight the first available stackframe
                        if (!activeFrame) {
                            highlightFrame();
                            activeFrame = stackframeEl;
                        }
                    }

                    PR.prettyPrint();
                }

                // TODO: Add Logs/Dump/Errors
                if (report.logs) {
                    for (let i = report.logs.length - 1; i >= 0; --i) {
                        const log = report.logs[i];

                        if (!log) break; // Log buffer may have not been filled yet

                        let logType = "";
                             if (log.type === 1) logType = 'critical';
                        else if (log.type === 2) logType = 'error';
                        else if (log.type === 4) logType = 'warning';
                        else if (log.type === 8) logType = 'info';
                        else if (log.type === 16) logType = 'debug';
                        else logType = 'normal';

                        $('<div/>')
                            .addClass('log')
                            .addClass('log-type-'+logType)
                            .append(
                                $('<a/>')
                                .addClass('log-timestamp')
                                .text(log.timestamp)
                            )
                            .append(
                                $('<a/>')
                                .addClass('log-prefix')
                                .text(log.prefix)
                            )
                            .append(
                                $('<a/>')
                                .addClass('log-message')
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
