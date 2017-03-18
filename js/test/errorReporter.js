define(() => {

    const http = require('http'),
        filepath = require('path');

    const ErrorReporter = {
        _init() {

        },

        save() {

			var url = Env.connection.http;


            var options = {
                hostname: 'url',
                port: 8125,
                //path: '/',
                method: 'POST',
                json: {"name":"John", "lastname":"Doe"}
            }

            http.request(options, function(error, response, body){
                if(error) console.log(error);
                else console.log(body);
            });
        },

        reportDir() {
            const dirname = global.__dirname;  // FIXME: For some reason   require('path').dirname('')  returns an empty string when called from here (as opposed to from bot.js or server.js)
            return filepath.dirname(dirname);
        },

        report(e, dumpObjects) {

            let logDump = null;
            if (global['GetLogDump']) logDump = GetLogDump();

            let dump = {
                error: e,
                logs: logDump,
                dump: {}
            };

            for (const dumpObj in dumpObjects) {
                const objToDump = dumpObjects[dumpObj];

                if (objToDump && objToDump.dump) {
                    dump[dumpObj] = dumpObjects[dumpObj].dump();
                }
            }

            this.save(dump);
        }
    };

    return ErrorReporter;
});
