define(['loggable'], function(Loggable){

	var DB = function(){
		extendClass(this).with(Loggable);
		this.setLogGroup('DB');
		this.setLogPrefix('(DB) ');

		var db = null;

		this.connect = function(){

			return new Promise(function(loaded, failed) {

				// Setup our mongo connection
				db = require('mongodb').MongoClient;
				db.connect('mongodb://127.0.0.1:27017/myquest', function(err, db){
					if (err) {
						Log("Failed to connect", LOG_ERROR);
						Log(err, LOG_ERROR);
						failed(err);
					}

					Log("Connected and ready to go");
					loaded();
				});

			});
		};

		this.disconnect = function(){
			db.close();
		};

		/*

		this.loginPlayer = function(loginID){

			return new Promise(succeeded, failed){

			   db
				.collection('players')
				.findOne({id:id}, function(err, player) {

					if (err || !player) {
						Log("Could not login player", LOG_ERROR);
						failed();
					}  else {
						succeeded(player);
					}
				});

			};
		};



		// Attempt to create a new player in the db
		this.createNewPlayer = function(playerAttributes){

			return new Promise(succeeded, failed){
				db
				.collection('players')
				.find({}, {sort:{'id':-1}, limit:1}).toArray(function(err, res){
					if (err) {
						Log("Error retrieving player ID's", LOG_ERROR);
						Log(err, LOG_ERROR);
					} else {
						var maxID = res[0].id,
							id    = maxID + 1;
						if (isNaN(id)) {
							Log("Bad id ("+id+") retrieved..", LOG_ERROR);
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
						.insert([ player ], function(err, res){
							Log("Created new character ["+id+"] for user..");
							succeeded( id );
						});
					}
				});

			};
		};

	*/

	};

	return DB;
});
