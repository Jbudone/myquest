define(() => {

    const http = require('http');

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
