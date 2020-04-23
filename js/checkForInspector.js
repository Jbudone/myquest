
const net = require('net');


// Read arguments
let debugPort = -1;
let waitClosed = false;
for (let i=0; i<process.argv.length; ++i) {

    const arg = process.argv[i];

    if (arg === "--port") {
        debugPort = parseInt(process.argv[++i], 10);
    } else if (arg === '--waitClosed') {
        // Return after the inspector has closed
        waitClosed = true;
    }
}

if (debugPort === -1) {
    console.error("No provided port for inspector");
    process.exit();
}

// Attempt to listen for connections on the inspector port. If there's already an inspector listening on that port then
// we'll get EADDRINUSE and return 2 to indicate its already open
const checkInspector = () => {
    net.createServer().on('error', function(err) {
        if (err.code === 'EADDRINUSE') {
            // Inspector open on this port
            if (waitClosed) {
                setTimeout(checkInspector, 500);
            } else {
                process.exit(2);
            }
        } else {
            process.exit();
        }
    }).listen(process.debugPort, function() {
        this.close();
        process.exit();
    });
};

checkInspector();
