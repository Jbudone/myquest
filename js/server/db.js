define(['loggable'], function(Loggable){

	var DB = function(){
		extendClass(this).with(Loggable);
		this.setLogGroup('DB');
		this.setLogPrefix('(DB) ');

		var mongo = null,
			db    = null;

		this.connect = function(){

			var me = this;
			return new Promise(function(loaded, failed) {

				// Setup our mongo connection
				mongo = require('mongodb').MongoClient;
				mongo.connect('mongodb://127.0.0.1:27017/myquest', function(err, _db){
					db = _db;
					if (err) {
						this.Log("Failed to connect", LOG_ERROR);
						this.Log(err, LOG_ERROR);
						failed(err);
					}

					this.Log("Connected and ready to go");
					loaded();
				});

			});
		};
		

		this.disconnect = function(){
			db.close();
		};


		this.loginPlayer = function(loginID){

			return new Promise((function(resolved, failed){

				db
				.collection('players')
				.findOne({id:loginID}, (function(err, player) {

					if (err || !player) {
						this.Log("Could not find player ("+loginID+")", LOG_ERROR);
						failed();
					}  else {
						this.Log("Found player ("+loginID+")");
						this.Log(player);
						resolved(player);
					}
				}).bind(this));


			}).bind(this));
		};



		// Attempt to create a new player in the db
		this.createNewPlayer = function(playerAttributes){

			return new Promise((function(succeeded, failed){
				db
				.collection('players')
				.find({}, {sort:{'id':-1}, limit:1}).toArray((function(err, res){
					if (err) {
						this.Log("Error retrieving player ID's", LOG_ERROR);
						this.Log(err, LOG_ERROR);
					} else {
						var maxID = res[0].id,
							id    = maxID + 1;
						if (isNaN(id)) {
							this.Log("Bad id ("+id+") retrieved..", LOG_ERROR);
							failed();
						}


						// TODO: check if this works for certain cases (eg.  player.position.x=20 (but not
						// setting defaults.position.y) will this still set default position.y but replace
						// position.x?)
						var player = _.defaults(playerAttributes, {
							// Default player values
							id: id,
							position: {
								y: 20, x: 14
							},
							map: "main"
						});

						db
						.collection('players')
						.insert([ player ], (function(err, res){
							this.Log("Created new character ["+id+"] for user..");
							succeeded( id );
						}).bind(this));
					}
				}).bind(this));

			}).bind(this));
		};

		this.savePlayer = function(player){

		   var y     = Math.round((player.posY + player.page.y*Env.tileSize)/Env.tileSize),
			   x     = Math.round((player.posX + player.page.x*Env.tileSize)/Env.tileSize),
			   mapID = player.page.map.id;

			db
			.collection('players')
			.update({id:player.playerID}, {"$set": {position:{y:y,x:x}, map:mapID}}, function(err){
				if (err) Log(err, LOG_ERROR);
				Log("Successfully updated player ("+player.playerID+") position.. ("+y+","+x+") in map("+mapID+")");
			});
		};

	};

	return DB;
});
