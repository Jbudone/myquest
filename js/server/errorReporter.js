define(() => {

    const filepath = require('path'),
        fs = require('fs');

    const ErrorReporter = {
        _init() {

        },

        onErrorReportRequest() {},

        initListener(http) {

            var url = require('url');

            http.createServer((req, res) => {

                var request = url.parse(req.url, true).query; // request from user

                res.writeHead(200, {'Content-Type': 'text/json', 'Access-Control-Allow-Origin' : '*'}); // FIXME: shouldn't need to do this

                console.log(util.inspect(request));

                this.onErrorReportRequest(request);
                /*
                console.log(util.inspect(req));


  if (req.method === 'GET') {
    var body = [];
    req.on('data', function(chunk) {
      body.push(chunk);
      console.log(chunk);
    }).on('end', function() {
      body = Buffer.concat(body).toString();
      res.end(body);

      console.log(body);
    });
  } else {
    res.statusCode = 404;
    res.end();
  }
  */

            }).listen(8125);

        },

        reportDir() {
            return global.__dirname;  // FIXME: For some reason   require('path').dirname('')  returns an empty string when called from here (as opposed to from bot.js or server.js)

        },

        report(e, dumpObjects, clientReport) {

            let logDump = null;
            if (global['GetLogDump']) logDump = GetLogDump();

            let err = false;

            if (e) {
                const parsedError = this.parseError(e);
                err = {
                    name: e.name,
                    message: e.message,
                    stack: e.stack,
                    parsed: parsedError
                };
            }

            let dump = {
                server: {
                    error: err,
                    logs: logDump,
                    dump: {}
                }
            }

            if (clientReport) {
                dump.client = clientReport;
            }

            for (const dumpObj in dumpObjects) {
                const objToDump = dumpObjects[dumpObj];

                if (objToDump && objToDump.dump) {
                    dump.server.dump[dumpObj] = dumpObjects[dumpObj].dump();
                }
            }

            this.save(dump);
        },

        save(dump) {

            const dirname            = global.__dirname, // FIXME: For some reason   require('path').dirname('')  returns an empty string when called from here (as opposed to from server.js)

                parentDirectory      = filepath.dirname(dirname);

            // FIXME: Use temporary file name
            let time = (new Date()).getTime(),
                fn = `report-${time}.json`;

            // FIXME: Currently need to writeFileSync since if we're on the server we'll continue running until we
            // finish writing. This sucks, however, if only the client/bot is crashing and the server has to block until
            // its finished writing
            const json = JSON.stringify(dump);
            fs.writeFileSync(`reports/${fn}`, json);
            console.log(`Saved error report: reports/${fn}`);
        }

    };

    return ErrorReporter;
});
