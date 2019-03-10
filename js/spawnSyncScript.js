
const fs = require('fs');

// Passthru arguments
const args = [];
for (let i=2; i<process.argv.length; ++i) {
    args.push(process.argv[i]);
}

// Spawn script
const { spawn } = require('child_process');
const killProc = spawn('node', args, {
    stdio: ['inherit', 'ignore', 'ignore'],
    detached: true
});

killProc.unref();
process.exit();
