
const fs = require('fs'),
    { exec } = require('child_process');

// Read arguments
let masterId = -1;
for (let i=0; i<process.argv.length; ++i) {

    const arg = process.argv[i];

    if (arg === "--master-id") {
        masterId = parseInt(process.argv[++i], 10);
    }
}

if (masterId === -1) {
    console.error("No provided master id. We cannot go killing all willy nilly");
    process.exit();
}

// TODO: Can't open /dev/tty from a disconnected grandchild script since it doesn't have a reference to the terminal.
// Would be nicer to use prompt than read from stdin
const prompt = () => {

    const fd = fs.openSync('/dev/tty', 'rs');

    //const wasRaw = process.stdin.isRaw;
    //if (!wasRaw) { process.stdin.setRawMode(true); }

    let char = null;
    while (true) {
        const buf = Buffer.alloc(3);
        const read = fs.readSync(fd, buf, 0, 3);

        // if it is not a control character seq, assume only one character is read
        char = buf[read-1];

        // catch a ^C and return null
        if (char == 3){
            process.stdout.write('^C\n');
            console.log('^C');

            char = null;
            break;
        }

        if (read > 1) { // received a control sequence
            continue; // any other 3 character sequence is ignored
        }

        //break;
    }
    console.log("Finished prompt");
    console.log(char);

    fs.closeSync(fd);
    //process.stdin.setRawMode(wasRaw);
    return char;
};

let killInspector = () => {
    console.log("Oh boy, its time to go killing again!");

    //const { execSync } = require('child_process');
    //let syncRes = execSync('kill -s HUP ' + masterId);

    const { exec } = require('child_process');
    const result = exec('kill -s HUP ' + masterId, (error, stdout, stderr) => {

        console.log("Killed inspector?");

        if (error) {
            console.error(`exec error: ${error}`);
            process.exit();
        }

        console.log(`stdout: ${stdout}`);
        console.log(`stderr: ${stderr}`);

        process.exit();
    });
};

const onMasterDied = () => {
    console.log("Damn! The master has died already");
    process.stdin.destroy(); // Restore stdin to terminal
    process.exit();
};

const checkMasterAlive = () => {

    exec
    (
        `ps --pid ${masterId} h -o comm`,
        {
            encoding: 'utf-8'
        },
        (err, stdout, stderr) => {

            if (err) {
                onMasterDied();
                return;
            }

            if (!stdout) {
                onMasterDied();
                return;
            }

            setTimeout(checkMasterAlive, 1000);
    });
};

//process.stdin.setRawMode(true);


// Wait for ctrl-c, or for master process to die
//process.on('exit', () => { killInspector(); });
process.stdin.setRawMode(true);
process.stdin.on('readable', () => {
    let chunk;
    while ((chunk = process.stdin.read()) !== null) {

        // ctrl-c
        if (chunk[0] == 3) {
            killInspector();
        }
    }
});

process.on('SIGINT', () => { killInspector(); });
process.on('uncaughtException', (e) => { console.log('uncaughtException'); console.log(e); killInspector(); });

checkMasterAlive();

//const input = prompt();
