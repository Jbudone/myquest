
// Determine our environment
let serverSide = null;
if (typeof window !== "undefined") {
    window._global = window;
    serverSide = false;
} else if (typeof self !== "undefined") {
    self._global = self;
    serverSide = false;
} else if (typeof global !== "undefined") {
    global._global = global;
    serverSide = true;
}

if (serverSide) {

    const DEBUGGER = (msg) => {
        const e = (new Error());
        if (!msg) msg = 'Debug: ' + e.stack.split('\n')[2];
        console.log(msg);

        // Print out line for error (for quick reference)
        if (typeof ErrorReporter !== 'undefined') {
            const stackFrame = ErrorReporter.parseError(e),
                source       = stackFrame.stack[2].source;

            let failedCheckSource = "";
            let startIdx = source.indexOf(msg);
            let mapSource = null;
            if (startIdx >= 0) {

                // OBJECT_TYPES.includes(typeof path.destination) || DEBUGGER("ERROR MESSAGE HERE: 359 (dist/js/server/player.js)");
                // (OBJECT_TYPES.includes(typeof The.player.cancelPath) || DEBUGGER("ERROR MESSAGE HERE: 363 (dist/js/scripts/game.js)")) && "The.player.cancelPath();";
                let idx = 0, starts = [];
                if (source[0] === '(') {
                    for (let i = 0; i < startIdx; ++i) {
                        if (source[i] === '(') starts.unshift(i);
                        else if (source[i] === ')') starts.shift();
                    }
                    idx = starts[starts.length - 1] + 1;
                }
                failedCheckSource = source.substr(idx, startIdx - idx - " || DEBUGGER(".length);

                console.log(`${chalk.bold.red(failedCheckSource)}`);

                // FIXME: This is working BUT source appended to DEBUGGER is probably wrong (loc isn't accurate in preproAST)
                console.log(`${chalk.bold.red("WARNING WARNING WARNING: SOURCE PROBABLY INACCURATE -- PLEASE FIX LOC IN preprocessAST.js")}`);
                mapSource = source.match(/&&\s*"(?<src>((\\")*|[^"])*)"\s*;\s*$/)
                if (mapSource && mapSource.groups && mapSource.groups.src) {
                    console.log(`${chalk.bold.red(mapSource.groups.src)}`);
                }
            } else {
                // Natural error
                ErrorReporter.printStack(e);
            }
        } else {
            // FIXME: If this is in worker then ErrorReporter isn't loaded ever
            if (global.IS_WORKER) {
                console.log(e);
                worker.postMessage({
                    error: msg
                });
            } else {
                console.log("Debugger hit before ErrorReporter started. Stackframe parse not available yet");
                console.log(`${chalk.bold.red(e)}`);
            }
        }


        waitForInspector();
    };

    const assert = (expr, message) => {
        if (!expr) {
            console.log(message);
            DEBUGGER();
            throw Err(message);
        }
    };


    const waitForInspector = () => {

        const prompt = () => {

            const fd = fs.openSync('/dev/tty', 'rs');

            const wasRaw = process.stdin.isRaw;
            if (!wasRaw) { process.stdin.setRawMode(true); }

            let char = null;
            while (true) {
                const buf = Buffer.alloc(3);
                const read = fs.readSync(fd, buf, 0, 3);

                // if it is not a control character seq, assume only one character is read
                char = buf[read-1];

                // catch a ^C and return null
                if (char == 3){
                    process.stdout.write('^C\n');

                    char = null;
                    break;
                }

                if (read > 1) { // received a control sequence
                    continue; // any other 3 character sequence is ignored
                }

                break;
            }

            fs.closeSync(fd);
            process.stdin.setRawMode(wasRaw);
            return char;
        };

        // Check for an existing connection for the inspector
        const { spawnSync } = require('child_process');
        const checkInspectorProc = spawnSync('node', ['./dist/js/checkForInspector.js', '--port', process.debugPort], {
            cwd: process.cwd(),
            env: process.env,
            encoding: 'utf-8'
        });

        if (checkInspectorProc.status === 2) {
            // There's already an open connection for the inspector
            debugger;
        } else {

            let wantToInspect = true;

            if (!global.IS_WORKER) {
                Log(chalk.red.bold("Hit any key to open the inspector"));
                const n = prompt();
                if (n === null) wantToInspect = false;
            }

            if (wantToInspect) {

                // Spawn a script that can listen for ctrl-c to kill the inspector if we don't want to start the inspector
                // NOTE: We have to spawnSync otherwise the spawn will wait until after this function to spawn the script.
                // Consequently we need the spawned script to exit so that we can continue to spark the inspector. That's why we
                // need to spawnSync a script who's sole purpose is to spawn another script
                const killProc = spawnSync('node', ['./dist/js/spawnSyncScript.js', './dist/js/killInspector.js', '--master-id', process.pid], {
                    stdio: ['inherit', 'ignore', 'ignore'], // stdin -> child process
                    cwd: process.cwd(),
                    env: process.env,
                    encoding: 'utf-8'
                });

                if (global.IS_WORKER) {

                    // Tell main process to pause until we've finished debugging the worker
                    worker.postMessage({
                        debugging: true
                    });
                }

                if (!global.IS_WORKER) Log(chalk.red.bold("Waiting for inspector.."));
                const inspector = require('inspector');
                inspector.open(process.debugPort, "127.0.0.1", true); // port, host, block
                debugger;
            }
        }
    };

    const waitInspectorClosed = () => {
        const { spawnSync } = require('child_process');
        const checkInspectorProc = spawnSync('node', ['./dist/js/checkForInspector.js', '--port', process.debugPort, '--waitClosed'], {
            cwd: process.cwd(),
            env: process.env,
            encoding: 'utf-8'
        });
    };

    _global.DEBUGGER = DEBUGGER;
    _global.assert = assert;
    _global.waitForInspector = waitForInspector;
    _global.waitInspectorClosed = waitInspectorClosed;

} else {

    const DEBUGGER = (msg) => {
        debugger;
    };

    _global.DEBUGGER = DEBUGGER;
}


_global.OBJECT = 'OBJECT';
_global.FUNCTION = 'FUNCTION';
_global.HAS_KEY = 'HAS_KEY';
_global.IS_TYPE = 'IS_TYPE';

_global.OBJECT_TYPES = ['object', 'function', 'string', 'number'];


const CHECK = (stuffToCheck) => {

    stuffToCheck.forEach((check) => {

        if (check.checker === IS_TYPE) {
            if (check.typeCmp === OBJECT) {
                if (typeof check.node !== "object" && typeof check.node !== "function" && typeof check.node !== "string") DEBUGGER("TYPE EXEPCTED TO BE OBJECT", check);
            } else if (check.typeCmp === FUNCTION) {
                if (typeof check.node !== "function") DEBUGGER("TYPE EXEPCTED TO BE FUNCTION", check);
            } else { 
                DEBUGGER("Unexpected type comparison", check);
            }
        } else if (check.checker === HAS_KEY) {
            if (!(check.property in check.object)) DEBUGGER("OBJECT EXPECTED TO HAVE KEY", check);
        } else {
            DEBUGGER("Unexpected check", check);
        }
    });
};

_global.CHECK = CHECK;
