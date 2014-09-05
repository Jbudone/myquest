define(function(){


	var Loggable = {

		logPrefix: "",
		logMask: Env.logmask['Default'],
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
		Log : function(message, type){

			type = type || LOG_INFO;
			if (this.logMask & type) {
				if (typeof message == 'object') {
					this.Log(": ");
				} else {
					message = this.logPrefix + message;
				}


				if ((type & (LOG_CRITICAL | LOG_ERROR)) && console.error) {
					console.error( message );
					if (console.trace) console.trace();
				} else if ((type & LOG_WARNING) && console.warn) {
					console.warn( message );
				} else {
					console.log( message );
				}
			}

		}
	};


	return Loggable;
});
