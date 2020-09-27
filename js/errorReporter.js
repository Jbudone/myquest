
// Error Reporting
define(() => {

    // Common: setup JSON format report -- log, error, dump
    // Server: on request also setup JSON, pair with client's
    // External script to build html out of JSON file(s)

    const ErrorReporter = function() {

        Ext.extend(this, 'errorReporter');

        this.parseError = (e) => {

            const parsedError = {
                error: e,
                description: "",
                stack: [],
                reportDir: ""
            };

            try {
                let level = 0;

                const reportDir = this.reportDir();
                parsedError.reportDir = reportDir;

                let frames = [];

                e.stack.split('\n').forEach((s) => {
                    //let frame = /\s*at\s*(\w+\.?\w*(\(.+\))?).+\(([^\:]+)\:(\d*)\:(\d*)/g.exec(s.trim());

                    // ====== Client ======
                    // 
                    // Crashing the game from script
                    // Error
                    //     at ErrorMessage (http://myquest.local/dist/errors.js:67:17)
                    //     at Chatter.handleCommand (http://myquest.local/dist/scripts/game.chat.js:325:31)
                    //     at Chatter.UI.hook.before.after (http://myquest.local/dist/scripts/game.chat.js:223:31)
                    //     at Hook.post (http://myquest.local/dist/hookable.js:113:50)
                    //     at Object.callPostHook [as post] (http://myquest.local/dist/hookable.js:303:35)
                    //     at HTMLFormElement.<anonymous> (http://myquest.local/dist/client/ui.js:331:47)
                    //     at HTMLFormElement.dispatch (http://myquest.local/dist/lib/jquery-2.1.1.min.js:3:6404)
                    //     at HTMLFormElement.r.handle (http://myquest.local/dist/lib/jquery-2.1.1.min.js:3:3179)
                    //
                    // ===== Server ======
                    //
                    // Crashing the game from script
                    // Error
                    //     at ErrorMessage (/home/jbud/jdrive/jstuff/work/personal/jbud/summit/playground/myquest/dist/errors.js:67:17)
                    //     at Player.<anonymous> (/home/jbud/jdrive/jstuff/work/personal/jbud/summit/playground/myquest/dist/scripts/game.chat.js:188:31)
                    //     at Object.handler [as call] (/home/jbud/jdrive/jstuff/work/personal/jbud/summit/playground/myquest/dist/dynamic.js:27:72)
                    //     at WebSocket.Player.client.on (/home/jbud/jdrive/jstuff/work/personal/jbud/summit/playground/myquest/dist/server/player.js:572:40)
                    //     at emitTwo (events.js:106:13)
                    //     at WebSocket.emit (events.js:194:7)
                    //     at Receiver.ontext (/home/jbud/jdrive/jstuff/work/personal/jbud/summit/playground/myquest/node_modules/ws/lib/WebSocket.js:841:10)
                    //     at /home/jbud/jdrive/jstuff/work/personal/jbud/summit/playground/myquest/node_modules/ws/lib/Receiver.js:536:18
                    //     at /home/jbud/jdrive/jstuff/work/personal/jbud/summit/playground/myquest/node_modules/ws/lib/Receiver.js:368:7
                    //     at /home/jbud/jdrive/jstuff/work/personal/jbud/summit/playground/myquest/node_modules/ws/lib/PerMessageDeflate.js:249:5
                    //     at afterWrite (_stream_writable.js:383:3)
                    //     at onwrite (_stream_writable.js:374:7)
                    //     at afterTransform (_stream_transform.js:79:3)
                    //     at TransformState.afterTransform (_stream_transform.js:54:12)
                    //     at Zlib.callback (zlib.js:625:5)
                    //
                    // ===== Anonymous Frames ======
                    //
                    //
                    // at Player.<anonymous> (/home/jbud/jdrive/jstuff/work/personal/jbud/summit/playground/myquest/dist/scripts/game.chat.js:188:31)
                    //
                    // at BuffMgr.(anonymous function) [as initialize] 
                    //
                    //
                    //
                    // ============ Parsing ============
                    //
                    // at FUNCTION [as thing] (FILE:LINE:COL)
                    //
                    // at FUNCTION [as initialize]
                    //
                    //  at ([^\s]+)\s*(\[as [^\]]+)?\s*(\(([^\:]+)\:(\d*)\:(\d*)\))?
                    //
                    let revisedFrameString = s.trim(); // FIXME: Client remove http://.... stuff to only show root folder (mostly necessary for getting rid of : in http://)
                    if (!Env.isServer && !Env.isBot) {
                        revisedFrameString = revisedFrameString.replace(new RegExp("\\(.*"+ window.location.hostname), "(")
                    }

                    // This has troubles with the following parses:
                    //      at BuffMgr.(anonymous function) [as initialize] 
                    //      at /home/jbud/jdrive/jstuff/work/personal/jbud/summit/playground/myquest/node_modules/ws/lib/Receiver.js:536:18
                    let frame = /\s*at\s*(.*)? (\[[^\]]+\])?\s*(\(([^\:]+)\:(\d*)\:(\d*)\))?/g.exec(revisedFrameString);

                    //let frame = /\s*at\s*(\w+\.?\w*(\(.+\))?).+\(([^\:]+)\:(\d*)\:(\d*)/g.exec(s.trim());



                    // FIXME: Get rid of anonymous function technique below (should have been added above)
                    //let frame = /\s*at\s*([^\(]+)\(([^\:]+)\:(\d*)\:(\d*)/g.exec(s.trim());

                    //if (!frame || frame.length !== 5) {
                    //    // This may or may not be an anonymous function
                    //    if (s.indexOf(parentDirectory) >= 0) {
                    //        frame = /\s*at\s*([^\:]+)\:(\d+)\:(\d+)/g.exec(s.trim());

                    //        if (frame && frame.length === 4) {
                    //            frame.splice(1, 0, ".<anonymous>");
                    //        }
                    //    }
                    //}

                    if (frame && frame.length === 7) {
                        let file   = frame[4],
                            func   = frame[1],
                            line   = parseInt(frame[5], 10),
                            col    = parseInt(frame[6], 10);

                        let inWorkingDir = false;
                        
                        let source = "", sourceLine = "";
                        let sourceMapper = null, rawSource = "";
                        if (file) {
                            inWorkingDir = file.indexOf(reportDir) >= 0;

                            try {
                                source = fs.readFileSync(file) || "";
                                sourceLine = "";

                                // Read sourcemap and original file, and link
                                //# sourceMappingURL=character.ai.combat.strategy.basic_melee.js.map
                                
                                let sourceMapComment = source.slice(-1024).toString(),
                                    sourceMapPrefix = "\/\/# sourceMappingURL=";
                                if (sourceMapComment.indexOf(sourceMapPrefix) >= 0) {
                                    const mappingURL = sourceMapComment.substr(sourceMapComment.indexOf(sourceMapPrefix) + sourceMapPrefix.length),
                                        rawSourceMap = fs.readFileSync(file.substr(0, file.lastIndexOf('/') + 1) + mappingURL) || "";

                                    if (rawSourceMap) {
                                        sourceMapper = SourceMap.SourceMapConsumer(rawSourceMap.toString()); // FIXME: Cache per file
                                    }

                                    if (sourceMapper) {
                                        const rawSourceFile = file.substr(0, file.length - 2) + 'pre.js';
                                        rawSource = fs.readFileSync(rawSourceFile);
                                        if (rawSource) {
                                            rawSource = rawSource.toString();
                                        }
                                    }
                                }
                            } catch(e) {
                                // Silently do nothing, probably an invalid file (which is okay)
                                //return;
                            }
                        }

                        if (source) {

                            let sourceIndex = -1;
                            for (let i = 0; i < (line-1); ++i) {
                                sourceIndex = source.indexOf('\n', sourceIndex + 1);
                            }
                            let sourceEnd = source.indexOf('\n', sourceIndex + 1);

                            sourceLine = source.toString('utf8', sourceIndex, sourceEnd).trim();
                        }

                        let stackPoint = {
                            file, func, line, col, inWorkingDir,
                            source: sourceLine,
                            rawFrame: s.trim()
                        };

                        if (sourceMapper && rawSource) {

                            let mapping = sourceMapper.originalPositionFor({ line: line, column: col });
                            if (mapping.line) {

                                let sourceIndex = -1;
                                for (let i = 0; i < (line-1); ++i) {
                                    sourceIndex = source.indexOf('\n', sourceIndex + 1);
                                }
                                let sourceEnd = source.indexOf('\n', sourceIndex + 1);

                                let rawSourceLine = source.toString('utf8', sourceIndex, sourceEnd).trim();

                                stackPoint.original = {
                                    line: mapping.line - 1,
                                    col: mapping.column - 1,
                                    source: rawSourceLine
                                };
                            }
                        }

                        parsedError.stack.push(stackPoint);
                    } else {

                        parsedError.stack.push({
                            rawFrame: s.trim()
                        });
                    }
                });
            } catch(err) {
                console.error(err);
                console.error(e);
            }

            return parsedError;
        };

        this.printStack = (e) => {

            const parsedError = this.parseError(e);

            const reportDir = parsedError.reportDir; // FIXME: Maybe this should be parentDirectory instead?

            console.log(`${chalk.bold.red(parsedError.error)}`);

            console.log(parsedError);

            let level = 0;
            for (let i = 0; i < parsedError.stack.length; ++i) {

                const frame = parsedError.stack[i];

                if (!frame.inWorkingDir) continue;

                if (frame.source) {
                    let file       = frame.file,
                        func       = frame.func,
                        line       = frame.line,
                        col        = frame.col,
                        source     = frame.source;

                    if (frame.original) {
                        line   = frame.original.line;
                        col    = frame.original.col;
                        //source = frame.original.source;
                    }

                    let spacer = "    ";
                    for (let i = 1; i < level; ++i) {
                        spacer += "   ";
                    }

                    let treeLine = (level > 0 ? "   " : "") + "│  ",
                        treeExpand = level > 0 ? "└─ " : "";

                    console.log(`${spacer}${chalk.white(treeExpand)}${chalk.yellow(file.substr(reportDir.length + 1))}${chalk.dim(":")}${chalk.yellow(line)}   ${chalk.white(func)}`);
                    console.log(`${spacer}${chalk.white(treeLine)}         ${chalk.green(source)}`);
                    ++level;
                } else {

                    console.log(`    ${chalk.bgRed.white(frame.rawFrame)}`);
                    console.log("");
                }


            }
            console.log("");

            /*
            console.error(e.stack);
            if (GLOBAL.Log) {
                Log(e, LOG_ERROR);
            } else {
                console.log(util.inspect(e, { showHidden: true, depth: 4 }));
            }
            */

        };
    };

    return new ErrorReporter();
});
