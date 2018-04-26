define(['loggable'], function(Loggable){

    // TODO: Look into Mongoose
	var DB = function(){
		extendClass(this).with(Loggable);
		this.setLogGroup('DB');
		this.setLogPrefix('(DB) ');

		var mongo = null,
			db    = null;

		var crypto = require('crypto');

        var queuedRegistrations = [];

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
				}.bind(this));

			}.bind(this));
		};
		

		this.disconnect = function(){
			db.close();
		};


		this.loginPlayer = function(username, password){

			return new Promise((function(resolved, failed){

				if (!_.isString(username) || !_.isString(password)) {
					failed('Invalid username/password');
					return;
				}

				var shasum = crypto.createHash('sha1');
				shasum.update('SALTY'+password);

				var usernameUpper = username.toUpperCase();

				db
				.collection('players')
				.findOne({'$and':[{usernameUpper:usernameUpper}, {password: shasum.digest('hex')}]}, (function(err, player) {

					if (err || !player) {
						this.Log("Could not find player ("+username+")");
						failed("Bad username/password");
					}  else {
						this.Log("Found player ("+username+")");
						this.Log(player);
						resolved(player);
					}
				}).bind(this));


			}).bind(this));
		};

		this.registerUser = function(username, password, email, overrideSpawn){

            //let spawnArea = 'main';
            //let spawnPosition = { x: 53, y: 60 };
            let spawnArea = 'largemap';
            let spawnPosition = { x: 774, y: 333 };

            // FIXME: Only allow this on test, and need to double check valid spawn
            if (overrideSpawn) {
                spawnArea = overrideSpawn.spawnArea || spawnArea;
                spawnPosition = overrideSpawn.spawnPosition || spawnPosition;
            }

            const spawn = {
                area: spawnArea,
                position: {
                    tile: spawnPosition
                },
                respawn: {
                    area: spawnArea,
                    position: {
                        tile: spawnPosition
                    },
                }
            };

            const registerDetails = {
                username: username,
                password: password,
                email: email,
                spawn: spawn,
                attempts: 0
            };

            const register = function(finished, failed){

                // Are we currently the next in line to register?
                let nextInLine = queuedRegistrations[0];
                if (nextInLine !== registerDetails) {
                    // We are not currently the next in line. We need to give the other registerer time to find the next
                    // sequential id and insert their document into the collection
                    // This is necessary since the sequential id fetcher and insertion transactions together do not form
                    // an atomic operation, so two people registering at the same time do not receive the same
                    // sequential id

                    // Have we exceeded the maximum number of attempts? Its possible that there's some other issue going
                    // on that will prevent registering at all. Instead of making the user wait, lets assume something
                    // has gone wrong and inform them
                    ++registerDetails.attempts;
                    if (registerDetails.attempts >= 10) {
                        queuedRegistrations.shift();
                        failed("Too many attempts");
                        this.Log(`Error registering user: too many attempts (${registerDetails.attempts})`, LOG_ERROR);
                        return;
                    }

                    setTimeout(function(){
                        register(finished, failed);
                    }, 100);
                    return;
                }

				var usernameUpper = username.toUpperCase();

				db
				.collection('players')
				.findOne({usernameUpper:usernameUpper}, function(err, player){

					// Player already exists?
					if (err) {
						this.Log("Error finding player");
						this.Log(username);
                        queuedRegistrations.shift();

						finished(err);
                        return;
					} else if (player) {
                        queuedRegistrations.shift();

						finished('Player already exists');
						return;
					}

					this.Log("No player ("+username+") found..creating new user", LOG_DEBUG);
					var shasum = crypto.createHash('sha1');
					shasum.update('SALTY'+password);

                    const spawn = registerDetails.spawn;

					// No player exists with these credentials.. register new user
					this.createNewPlayer(spawn, username, shasum.digest('hex'), email).then(function(newID){
                        queuedRegistrations.shift();
						finished(null, newID);
					}, function(err){
                        queuedRegistrations.shift();
						failed(err);
					}).catch(Error, function(err){
						console.error(err);
                        queuedRegistrations.shift();
						failed(err);
					});

				}.bind(this));
            }.bind(this);

            queuedRegistrations.push(registerDetails);

			return new Promise(register);
		};


		// Attempt to create a new player in the db
		this.createNewPlayer = function(playerAttributes, username, password, email){

			return new Promise((function(succeeded, failed){

				var usernameUpper = username.toUpperCase();

				db
				.collection('players')
				.find({}, {sort:{'id':-1}, limit:1}).toArray((function(err, res){
					if (err) {
						this.Log("Error retrieving player ID's", LOG_ERROR);
						this.Log(err, LOG_ERROR);
					} else {
						var id;
						if (res.length) {
							var maxID = res[0].id;
							id = maxID + 1;
						} else {
							id = 1;
						}
						if (isNaN(id)) {
							this.Log("Bad id ("+id+") retrieved..", LOG_ERROR);
							failed();
						}


						// TODO: check if this works for certain cases (eg.  player.position.x=20 (but not
						// setting defaults.position.y) will this still set default position.y but replace
						// position.x?)
                        let starterInventory = [];
                        for (let i = 0; i < 4; ++i) {
                            starterInventory.push({
                                item: "itm_potion",
                                stack: 1,
                                active: false
                            });
                        }

                        starterInventory.push({
                            item: null,
                            stack: 0,
                            active: false
                        });

                        const npc = Resources.npcs.player;

                        const components = {};
                        for (let i = 0; i < npc.components.length; ++i) {
                            const componentName = npc.components[i],
                                componentInitialState = Resources.components[componentName].initialState;

                            components[componentName] = componentInitialState;
                        }

                        const character = {
                            stats: {},
                            inventory: starterInventory,
                            components: components
                        };

                        for (const statName in npc.stats) {
                            const stat = npc.stats[statName];
                            character.stats[statName] = {
                                cur: stat,
                                curMax: stat,
                                max: stat
                            };
                        }

						var player = _.defaults(playerAttributes, {
							id: id,
							usernameUpper: usernameUpper,
							username: username,
							password: password,
							email: email,
							position: {
								tile: {
									y: 60, x: 53
								}
							},
							respawn: {
								area: "main",
								position: {
									tile: {
										y: 60, x: 53
									}
								},
							},
                            character: character,
							area: "main"
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

			var y     = player.position.tile.y,
				x     = player.position.tile.x,
				areaID = player.page.area.id;

			if (!_.isFinite(y) || !_.isFinite(x)) {
				this.Log(player.position, LOG_ERROR);
				throw new Error("Cannot save player with bad position!");
			}

            const serializedChar = player.character.serialize();

			db
			.collection('players')
            .update({id:player.playerID}, {
                "$set": {
                    position: {
                        tile: { y: y, x: x }
                    },
                    area: areaID,
                    character: serializedChar
                }
            }, function(err){
				if (err) Log(err, LOG_ERROR);
				Log(`Successfully updated player (${player.playerID}) position.. (${x}, ${y}) in area(${areaID})`);
			});
		};

	};

	return DB;
});
