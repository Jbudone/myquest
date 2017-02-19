define(() => {

    const ErrorReporter = {
        _init() {

        },

        save(report) {

            const url = Env.connection.http,
                json = JSON.stringify(report);
            

            $.getJSON(`${url}:8125`, {
                report: json
            }, (reply) => {
                console.log(reply);
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
                    dump.dump[dumpObj] = dumpObjects[dumpObj].dump();
                }
            }

            this.save(dump);
        }
    };

    return ErrorReporter;
});
