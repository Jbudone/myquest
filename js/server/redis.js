define(['loggable'], function(Loggable){

	var Redis = function(){
		extendClass(this).with(Loggable);
		this.setLogGroup('Redis');
		this.setLogPrefix('(Redis) ');

		var redis = null,
			db    = null;

		this.initialize = function(){

            return new Promise((success, failed) => {
                redis = require('redis').createClient();
                redis.on('error', (e) => {
                    this.Log("Redis error: "+ e, LOG_ERROR);
                    failed(e);
                });

                success();
            });
		};

        this.disconnect = function(){
            if (redis) redis.quit();
        };

		// Get the value from the 'scriptID:playerID' key-pair
		//
		// NOTE: if key does not exist yet, null is returned
		this.getValue = function(scriptID, playerID){
			return new Promise(function(complete, failed){
				redis.hgetall(scriptID+':'+playerID, function(err, obj){
					if (err) {
						failed(err);
					} else {
						complete(obj);
					}
				});
			})
			.catch(Error, function(e){ errorInGame(e); })
			.error(function(e){ errorInGame(e); });
		};

		// Set the interaction value for a given (scriptID,playerID) pair
		//
		// options: { Expire: time_to_live }
		// 	- Expire: is useful for allowing an interaction to expire. eg. if you're talking to an NPC, but its
		// 			not a quest or anything important. The player would expect to talk to the NPC, then after
		// 			walking away and coming back later the conversation would be reset
		this.setValue = function(scriptID, playerID, key, value, options){
			return new Promise(function(complete, failed){
				var callback = function(err, value){
					if (err) {
						failed(err);
					} else {
						complete(value);
					}
				};
				redis.hset([scriptID+":"+playerID, key, value], callback);
			})
			.catch(Error, function(e){ errorInGame(e); })
			.error(function(e){ errorInGame(e); });
		};
	};

	return Redis;
});
