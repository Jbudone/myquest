
const net = require('net');


// Read arguments
let debugPort = -1;
for (let i=0; i<process.argv.length; ++i) {

    const arg = process.argv[i];

    if (arg === "--port") {
        debugPort = parseInt(process.argv[++i], 10);
    }
}

if (debugPort === -1) {
    console.error("No provided port for inspector");
    process.exit();
}

net.createServer().on('error', function(err) {
    if (err.code === 'EADDRINUSE')
        process.exit(2);
    else
        process.exit();
}).listen(process.debugPort, function() {
    this.close();
    process.exit();
});

