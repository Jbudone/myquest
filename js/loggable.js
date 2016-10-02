define(function(){

    var errorLog,
        warnLog,
        normLog,
        jsonRenderer;

    var minHeaderWidth = 10;
    
    var logColorTypes = {};

    const logDumpSize = 1000,
        logDump = new Array(logDumpSize);
    let logDumpIndex = 0;

    // TODO: Themed logging - Log("*Header*: (_something horrible happened_) details of what went down")
    if (Env.isServer || Env.isBot) {

        logColorTypes['default'] = chalk.white;
        logColorTypes['script'] = chalk.cyan;
    } else {

        logColorTypes['default'] = "color: blue; font-weight: normal;";
        logColorTypes['script'] = "color: cyan; font-weight: normal;";
    }

    if (Env.isServer || Env.isBot) {

        // TODO: Enable prettyjson when it allows maximum depth/recursion
        // jsonRenderer = prettyjson.render;
        jsonRenderer = function(obj){ return util.inspect( obj, { colors: true, depth: 6 } ) };

        errorLog = function(header, message){
            var log = "";

            if (header) {
                log += chalk.green.bold('[');
                log += chalk.red.bold(header);
                log += chalk.green.bold(']');
                log += ': ';

                log += "      ".slice(0, Math.max(0, minHeaderWidth - header.length));
            }

            if (typeof message == 'object') {
                log += jsonRenderer(message);
            } else {
                log += chalk.red(message);
            }

            console.error(log);
        };

        warnLog = function(header, message){
            var log = "";

            if (header) {
                log += chalk.green.bold('[');
                log += chalk.yellow.bold(header);
                log += chalk.green.bold(']');
                log += ': ';

                log += "      ".slice(0, Math.max(0, minHeaderWidth - header.length));
            }

            if (typeof message == 'object') {
                log += jsonRenderer(message);
            } else {
                log += chalk.yellow(message);
            }

            console.error(log);
        };

        normLog = function(header, message, color){
            var log = "";

            if (header) {
                log += chalk.green.bold('[');
                log += chalk.blue.bold(header);
                log += chalk.green.bold(']');
                log += ': ';

                log += "      ".slice(0, Math.max(0, minHeaderWidth - header.length));
            }

            if (typeof message == 'object') {
                log += jsonRenderer(message);
            } else {
                log += color(message);
            }

            console.log(log);
        };
    } else {

        jsonRenderer = function(obj){ return obj; };

        errorLog = function(header, message){

            if (header) {
                var log = `%c[%c${header}%c]: %c${message}`;

                const c1 = "color: green; font-weight: bold;",
                    c2 = "color: red; font-weight: bold;",
                    c3 = "color: red; font-weight: normal;";

                console.error(log, c1, c2, c1, c3);
            } else {
                var log = `%c${message}`;

                const c = "color: red; font-weight: normal;";
                console.error(log, c);
            }
        };

        warnLog = function(header, message){

            if (header) {
                var log = `%c[%c${header}%c]: %c${message}`;

                const c1 = "color: green; font-weight: bold;",
                    c2 = "color: orange; font-weight: bold;",
                    c3 = "color: orange; font-weight: normal;";

                console.warn(log, c1, c2, c1, c3);
            } else {
                var log = `%c${message}`;

                const c = "color: orange; font-weight: normal;";
                console.warn(log, c);
            }
        };

        normLog = function(header, message, color){

            if (header) {
                var log = `%c[%c${header}%c]: %c${message}`;

                const c1 = "color: green; font-weight: bold;",
                    c2 = "color: blue; font-weight: bold;",
                    c3 = "color: blue; font-weight: normal;";

                console.log(log, c1, c2, c1, c3);
            } else {
                var log = `%c${message}`;

                console.log(log, color);
            }
        };
    }

    suppressLogs = false;

	var Loggable = {

		logPrefix: "",
		logMask: Env.logmask['Default'],
        logColor: logColorTypes['default'],
		setLogGroup: function(group){
			if (group instanceof Array) {
				var isAGroup = false,
					newLogMask = 0;
				for (var i=0; i<group.length; ++i) {
					var subgroup = group[i];
					if (!Env.logmask[subgroup]) {
						this.Log("No log group found in Environment: ("+subgroup+")", LOG_CRITICAL);
					} else {
						newLogMask |= Env.logmask[subgroup];
						isAGroup = true;
					}
				}

				if (isAGroup) this.logMask = newLogMask;
			} else {
				if (!Env.logmask[group]) {
					this.Log("No log group found in Environment: ("+group+")", LOG_CRITICAL);
				} else {
					this.logMask = Env.logmask[group];
				}
			}
		},
		setLogPrefix: function(prefix){
			this.logPrefix = prefix;
		},
        setLogColor: function(type){
            this.logColor = logColorTypes[type] ? logColorTypes[type] : logColorTypes['default'];
        },
        addLogDump: function(message, type){
            if (++logDumpIndex > logDumpSize) logDumpIndex = 1;

            logDump[logDumpIndex - 1] = { message, type }; // FIXME: Preallocate these objects on init
        },
        SuppressLogs: function(b) { suppressLogs = b },
        DumpLog: function(){
            for (let i = 0; i < logDumpSize; ++i) {
                const log = logDump[(i + logDumpIndex) % logDumpSize];
                if (log && log.message && log.type) {
                    this._Log(log.message, log.type);
                }
            }
        },
		Log : function(message, type){

            this.addLogDump(message, type);

			type = type || LOG_INFO;
			if (this.logMask & type && !suppressLogs) {
                this._Log(message, type);
            }
        },
        _Log : function(message, type){

            if ((type & (LOG_CRITICAL | LOG_ERROR)) && console.error) {

                if (errorLog) {
                    errorLog(this.logPrefix, message);
                } else {
                    console.error(message);
                }

                if (console.trace) console.trace();
                if (message.stack) console.error(message.stack);
            } else if ((type & LOG_WARNING) && console.warn) {

                if (warnLog) {
                    warnLog(this.logPrefix, message);
                } else {
                    console.warn(message);
                }
            } else {

                if (normLog) {
                    normLog(this.logPrefix, message, this.logColor);
                } else {
                    console.log( message );
                }
            }

		}
	};


	return Loggable;
});
