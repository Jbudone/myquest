
// Error Reporting
define(() => {

    // Common: setup JSON format report -- log, error, dump
    // Server: on request also setup JSON, pair with client's
    // External script to build html out of JSON file(s)

    const ErrorReporter = function() {

        Ext.extend(this, 'errorReporter');

        // FIXME: Merge with server.js
        // FIXME: This is specific to bots/server, should not be exposed to client
        this.printStack = (e) => {

            // TODO: Organize source printing?
            const filepath = require('path');

            try {
                console.log("");
                let level = 0;

                const dirname            = global.__dirname, // FIXME: For some reason   require('path').dirname('')  returns an empty string when called from here (as opposed to from bot.js or server.js)

                    parentDirectory      = filepath.dirname(dirname),
                    grandparentDirectory = filepath.dirname(parentDirectory);

                let reportDir = parentDirectory; // Bot needs parent dir
                if (Env.isServer) {
                    reportDir = dirname;
                }

                console.log(`You are in ${dirname}, child of ${parentDirectory}, child of ${grandparentDirectory}`);

                let frames = [];

                e.stack.split('\n').forEach((s) => {
                    let frame = /\s*at\s*(\w+\.?\w*(\(.+\))?).+\(([^\:]+)\:(\d*)\:(\d*)/g.exec(s.trim());
                    // at BuffMgr.(anonymous function) [as initialize] 


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

                    if (frame && frame.length === 6) {
                        let file   = frame[3],
                            func   = frame[1],
                            line   = frame[4],
                            col    = frame[5];

                        if (file.indexOf(reportDir) >= 0) {
                            // We're in the same path as the server.. include this frame
                        } else {
                            // Hide this frame (note; should have a "...." or something to convey that we're hiding outside of
                            // scope frames)
                            return;
                        }

                        let source = "", sourceLine = "";
                        try {
                            source = fs.readFileSync(file) || "";
                            sourceLine = "";
                        } catch(e) {
                            return;
                        }

                        if (source) {

                            let sourceIndex = -1;
                            for (let i = 0; i < (line-1); ++i) {
                                sourceIndex = source.indexOf('\n', sourceIndex + 1);
                            }
                            let sourceEnd = source.indexOf('\n', sourceIndex + 1);

                            sourceLine = source.toString('utf8', sourceIndex, sourceEnd).trim();
                        }

                        let spacer = "    ";
                        for (let i = 1; i < level; ++i) {
                            spacer += "   ";
                        }

                        let treeLine = (level > 0 ? "   " : "") + "│  ",
                            treeExpand = level > 0 ? "└─ " : "";

                        console.log(`${spacer}${chalk.white(treeExpand)}${chalk.yellow(file.substr(parentDirectory.length + 1))}${chalk.dim(":")}${chalk.yellow(line)}   ${chalk.white(func)}`);
                        console.log(`${spacer}${chalk.white(treeLine)}         ${chalk.green(sourceLine)}`);
                        ++level;
                    } else {

                        console.log(`    ${chalk.bgRed.white(s.trim())}`);
                        console.log("");
                    }
                });



                console.log("");
            } catch(err) {
                console.error(err);
                console.error(e);
            }

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
