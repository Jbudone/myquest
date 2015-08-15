define(['eventful', 'dynamic', 'loggable', 'movable', 'event'], function(Eventful, Dynamic, Loggable, Movable, Event){

	var Player = function(client){
		extendClass(this).with(Loggable);
		extendClass(this).with(Eventful);
		extendClass(this).with(Dynamic);
		this.setLogGroup('Player');
		this.setLogPrefix('(Player)[null] ');

		this.id                    = null;
		this.movable               = null;
		this.lastActionId          = 0;
		this.client                = client;

		this.onDisconnected        = new Function();
		this.onRequestNewCharacter = new Function();
		this.onLogin               = new Function();

		this.onPreparingToWalk     = new Function();
		this.onSomeEvent           = new Function();

		this.pages                 = { }; // Visible pages


		this.setPlayer = function(player){

			this.id = player.id;
			this.setLogPrefix('(Player)['+player.id+'] ');
			this.Log("Logged in player ["+player.id+"]");
			this.Log(player, LOG_DEBUG);

			var err = null;

			// Set players position
			if (!The.world.maps[player.map]) {
				err = new GameError("Map ("+player.map+") not found in world!");
				err.reason = BAD_POSITION;
				err.becauseOf = 'map';
				return err;
			}

			var map            = The.world.maps[player.map],
				playerPosition = map.localFromGlobalCoordinates(player.position.tile.x, player.position.tile.y),
				respawnPoint   = null;

			if (_.isError(playerPosition)) {
				this.Log("Could not get correct position for player..", LOG_ERROR);
				playerPosition.print();
				err = new GameError("Could not get correct position for player..");
				err.reason = BAD_POSITION;
				err.becauseOf = 'position';
				return err;
			}

			respawnPoint = The.world.maps[player.respawn.map].localFromGlobalCoordinates(player.respawn.position.tile.x, player.respawn.position.tile.y);

			if (_.isError(respawnPoint)) {
				this.Log("Could not get local coordinates for respawn point", LOG_ERROR);
				err = new GameError("Could not get local coordinates for respawn point..");
				err.reason = BAD_POSITION;
				err.becauseOf = 'respawn';
			}

			this.movable          = new Movable('player', playerPosition.page, {
												position: {
													tile: {
														x: player.position.tile.x,
														y: player.position.tile.y },
													global: {
														x: player.position.tile.x*Env.tileSize,
														y: player.position.tile.y*Env.tileSize }
												},
												respawnPoint: {
													tile: {
														x: player.respawn.position.tile.x,
														y: player.respawn.position.tile.y
													},
													page: respawnPoint.page.index,
													map: respawnPoint.page.map.id
												} });
			this.movable.name = player.username;
			this.movable.playerID = player.id;
			this.movable.player = this;

			var result = null;
			result = this.movable.page.addEntity(this.movable);
			if (_.isError(result)) return result;
			result = map.watchEntity(this.movable);
			if (_.isError(result)) return result;

			this.pages = { };
			this.pages[this.movable.page.index] = this.movable.page;
			for (var neighbour in this.movable.page.neighbours) {
				var npage = this.movable.page.neighbours[neighbour];
				if (npage) this.pages[npage.index] = npage;
			}


			


			this.movable.addEventListener(EVT_ZONE, this, function(player, oldPage, page){
				this.Log("Zoned player from ("+ this.movable.page.index +") to ("+ page.index +")");
				var oldPage       = oldPage,
					oldNeighbours = {};

				if (!oldPage) throw new Error("No oldPage defined");
				oldNeighbours[oldPage.index] = oldPage;
				for (var neighbour in oldPage.neighbours) {
					if (oldPage.neighbours[neighbour]) {
						oldNeighbours[oldPage.neighbours[neighbour].index] = oldPage.neighbours[neighbour];
					}
				}

				this.movable.page      = page;
				this.pages             = {};
				this.pages[page.index] = page;



				// Send new page & neighbours as necessary
				// If neighbour page was sent previously then don't send again
				var initialization = {
					zone:true,
					pages:{}
				}, result = null;

				if (!oldNeighbours[page.index]) {
					result = page.serialize(PAGE_SERIALIZE_BASE | PAGE_SERIALIZE_MOVABLES);
					if (_.isError(result)) throw result;
					initialization.pages[page.index] = result;
				}
				for (var neighbour in page.neighbours) {
					var npage = page.neighbours[neighbour];
					if (npage) this.pages[npage.index] = npage;
					if (npage && !oldNeighbours[npage.index] && npage.index != oldPage.index) {
						result = npage.serialize(PAGE_SERIALIZE_BASE | PAGE_SERIALIZE_MOVABLES);
						if (_.isError(result)) throw result;
						initialization.pages[npage.index] = result;
					}
				}

				this.client.send(JSON.stringify(initialization));
			});

			this.movable.addEventListener(EVT_ZONE_OUT, this, function(player, oldMap, oldPage, map, page, zone) {
				this.Log("Zoned player from ("+oldMap.id+")["+oldPage.index+"] to ("+map.id+")["+page.index+"]");

				// NOTE: the actual zoning process is already handled in world.js
				// map.zoneIn(player, zone);

				player.page = page;
				this.pages = { };
				this.pages[page.index] = page;

				var initialization = {
						zoneMap:true,
						map:{
							id: map.id,
							pagesPerRow: map.pagesPerRow,
							mapWidth: map.map.properties.width,
							mapHeight: map.map.properties.height,
							tilesets: map.map.properties.tilesets,
						},
						player:{
							position: this.movable.position,
							page: this.movable.page.index
						},
						pages:{}
					}, result = null;

				result = page.serialize(PAGE_SERIALIZE_BASE | PAGE_SERIALIZE_MOVABLES);
				if (_.isError(result)) throw result;
				initialization.pages[page.index] = result;
				for (var neighbour in page.neighbours) {
					var npage = page.neighbours[neighbour];
					if (npage) {
						this.pages[npage.index] = npage;
						result = npage.serialize(PAGE_SERIALIZE_BASE | PAGE_SERIALIZE_MOVABLES);
						if (_.isError(result)) throw result;
						initialization.pages[npage.index] = result;
					}
				}

				this.client.send(JSON.stringify(initialization));
			});

			return true;
		};

		this.respawn = function(){

			this.pages = {};
			this.pages[this.movable.page.index] = this.movable.page;
			var page = this.movable.page,
				map = page.map,
				initialization = {
					respawn:true,
					map:{
						id: map.id,
						pagesPerRow: map.pagesPerRow,
						mapWidth: map.map.properties.width,
						mapHeight: map.map.properties.height,
						tilesets: map.map.properties.tilesets,
					},
					player:{
						position: {
							tile: {
								x: this.movable.position.tile.x,
								y: this.movable.position.tile.y },
							global: {
								x: this.movable.position.global.x,
								y: this.movable.position.global.y }
						},
						page: this.movable.page.index,
						_character: {
							health: this.movable.character.health
						}
					},
					pages:{}
			}, result = null;

			result = page.serialize(PAGE_SERIALIZE_BASE | PAGE_SERIALIZE_MOVABLES);
			if (_.isError(result)) return result;
			initialization.pages[page.index] = result;
			for (var neighbour in page.neighbours) {
				var npage = page.neighbours[neighbour];
				if (npage) {
					this.pages[npage.index] = npage;
					result = npage.serialize(PAGE_SERIALIZE_BASE | PAGE_SERIALIZE_MOVABLES);
					initialization.pages[npage.index] = result;
				}
			}

			this.client.send(JSON.stringify(initialization));
		};

		this.handleWalkRequest = function(action){

			// 	Create path from request
			////////////////////////////////////

			var path     = new Path(),
				walk     = new Walk(),
				player   = this.movable,
				your     = player,
				map      = player.page.map,
				reqState = action.state,
				maxWalk  = 1500/player.moveSpeed, // maximum delay of 1.5s (1500/(moveSpeed*tileSize))
				err      = null,
				result   = null;

			result = walk.fromJSON(action.data);
			if (_.isError(result)) {
				err = new GameError(result.message);
				return err;
			}
			walk.walked = 0;
			path.walks.push(walk);

			if (path.length() > maxWalk) {
				this.Log("Path longer than maxwalk..", LOG_ERROR);
				this.Log(path, LOG_ERROR);
				err = new GameError("Path longer than maxwalk");
				return err;
			}

			// 
			// Check path is safe (no collisions)
			//
			//	This works by essentially finding the starting point for the path and walking along that path
			//	to check if each tile is open.
			//	NOTE: currently we're only processing this on a per-walk basis (ie. this path consists of only
			//	1 walk)
			////////////////////////////////////////
			var safePath = map.pathfinding.checkSafeWalk(reqState, walk);


			var movableState = {
					position: {
						global: {
							x: player.position.global.x,
							y: player.position.global.y },
						tile: {
							x: player.position.tile.x,
							y: player.position.tile.y }
					}
				},
				pathState = {
					position: {
						global: {
							x: reqState.global.x,
							y: reqState.global.y
						},
						tile: {
							x: reqState.tile.x,
							y: reqState.tile.y }
					}
				};

			if (!safePath) {
				this.Log("Path is not safe for user... cancelling!");

				var response     = new Response(action.id);
				response.success = false;
				response.state   = { position: {
										global: {
											x: movableState.position.global.x,
											y: movableState.position.global.y },
										tile: {
											x: movableState.position.tile.x,
											y: movableState.position.tile.y }
										}
									};
				this.client.send(response.serialize());
				return;
			}

			
			// Are we close enough to recalibrate to the starting point of the path?
			if (Math.abs(pathState.position.tile.x - movableState.position.tile.x) + Math.abs(pathState.position.tile.y - movableState.position.tile.y) > 8) {
				var response = new Response(action.id);
				response.success = false;
				response.state   = { position: {
										global: {
											x: movableState.position.global.x,
											y: movableState.position.global.y },
										tile: {
											x: movableState.position.tile.x,
											y: movableState.position.tile.y }
										}
									};
				this.client.send(response.serialize());
				return;
			}

var prePath = JSON.stringify(path);
			var success = map.recalibratePath(movableState, pathState, path, maxWalk);

			if (success) {

				// var pathCpy = extendClass({}).with(path);
				// pathCpy.time = action.time;
				// pathCpy.state = action.state;
				// you.pathArchive.addEvent(pathCpy); // TODO: need to pushArchive for path sometimes

				player.path=null;
// var postPath = JSON.stringify(path);
// console.log(chalk.bold.magenta(prePath) + " RECALIBRATED TO " + chalk.bold.yellow(postPath));
				player.addPath(path);

				var response = new Response(action.id);
				response.success = true;
				this.client.send(response.serialize());
				return;
			} else {

				var response = new Response(action.id);
				response.success = false;
				response.state   = { position: {
										global: {
											x: movableState.position.global.x,
											y: movableState.position.global.y },
										tile: {
											x: movableState.position.tile.x,
											y: movableState.position.tile.y }
										}
									};
				this.client.send(response.serialize());
				return;
			}


			var response = new Response(action.id);
			response.success = false;
			this.client.send(response.serialize());
			return;
		};

		this.disconnectPlayer = function(){
			this.Log("Disconnecting player..");
			this.movable.unload();
		};

		this.attackTarget = function(targetID){
			this.Log("Player requesting to attack entity["+targetID+"]..");
			var target = this.movable.page.movables[targetID];
			if (target && target.playerID) {
				return; // NO player killing!
			}
			this.movable.triggerEvent(EVT_AGGRO, this.movable.page.map.movables[targetID]);
		};

		client.on('close', (function() {
			this.onDisconnected();
			this.Log('websocket connection close ['+ this.id +']');
		}).bind(this));

		// FIXME: do we need to disconnect them from all errors ??
		client.on('error', (function() {
			this.onDisconnected();
			this.Log('websocket connection error.. disconnecting user ['+this.id+']');
		}).bind(this));

		client.on('message', (function(evt) {
			this.Log(evt, LOG_DEBUG);
			var evt = JSON.parse(evt);
			if (!evt || _.isError(evt)) {
				this.Log("			BAD MESSAGE!? Weird..", LOG_ERROR);
				// TODO: tell client that the message was misunderstood?
				return;
			}
			if (evt.id!=this.lastActionId+1) {
				this.Log("			Sorry user("+this.id+")..we may have missed some of your messages..  "+evt.id+"!="+(this.lastActionId+1), LOG_ERROR);
				// TODO: tell client we're missing some messages..
				return;
			}

			this.lastActionId++; // note: this may be safer (async) than lastActionId=evt.id


			if (this.id==null) {
				if (evt.evtType==EVT_NEW_CHARACTER) {
					this.Log("User requesting a new character..");
					this.onRequestNewCharacter().then((function(newID){
						this.Log("Created new character for player ["+newID+"]", LOG_ERROR);
						var response          = new Response(evt.id);
						response.success      = true;
						response.newCharacter = { id: newID, };
						this.client.send(response.serialize());
					}).bind(this), (function(){
						this.Log("Could not create new player..", LOG_ERROR);
						// TODO: tell user
					}).bind(this))
					.catch(Error, function(e){ errorInGame(e); })
					.error(function(e){ errorInGame(e); });
				} else if (evt.evtType==EVT_LOGIN) {
					var username = evt.data.username,
						password = evt.data.password;
					this.Log("User logging in as ["+username+"]");
					this.onLogin(username, password).then((function(details){
						var savedState = details.savedState,
							callback   = details.callback,
							succeeded  = this.setPlayer(savedState);
						if (!succeeded) {
							var response     = new Response(evt.id);
							response.success = false;
							this.client.send(response.serialize());
							return;
						}

						var response     = new Response(evt.id);
						response.success = true;
						response.login   = true;
						response.player  = {
							position: savedState.position,
							playerID: this.movable.playerID,
							id: this.movable.id,
							name: this.movable.name,
						};
						this.client.send(response.serialize());

						callback();
					}).bind(this), (function(err){
					   this.Log("Could not login player..");
					   var response     = new Response(evt.id);
					   response.success = false;
					   response.reason  = err;
					   this.client.send(response.serialize());
					}).bind(this))
					.catch(Error, function(e){ errorInGame(e); })
					.error(function(e){ errorInGame(e); });
				}

				return;
			}


			if (evt.evtType==EVT_REQUEST_MAP) {

				this.Log("Sending requested map..");
				var page           = this.movable.page,
					map            = page.map,
					initialization = {
						initialization:true,
						map:{
							id: map.id,
							pagesPerRow: map.pagesPerRow,
							mapWidth: map.map.properties.width,
							mapHeight: map.map.properties.height,
							tilesets: map.map.properties.tilesets,
						},
						pages:{}
					};

				initialization.pages[page.index] = page.serialize(PAGE_SERIALIZE_BASE | PAGE_SERIALIZE_MOVABLES);
				for (var neighbour in page.neighbours) {
					var npage = page.neighbours[neighbour];
					if (npage) initialization.pages[npage.index] = npage.serialize(PAGE_SERIALIZE_BASE | PAGE_SERIALIZE_MOVABLES);
				}

				this.client.send(JSON.stringify(initialization));

			} else if (evt.evtType==EVT_PREPARING_WALK) {
				//this.Log("new message from user.. FROM ("+evt.state.localY+", "+evt.state.localX+") ----> "+evt.data.distance, LOG_DEBUG);
				this.onPreparingToWalk(evt);
			} else if (evt.evtType==TEST_CHECKJPS) {
				// FIXME: should move this into dynamic handler for a debugging-specific script

				var map              = The.world.maps[evt.data.mapID],
					differences      = {},
					i                = 0,
					clientJumpPoints = evt.data.JPS;
				for (var y=evt.data.y; y<Env.pageHeight; ++y) {
					for (var x=evt.data.x; x<Env.pageWidth; ++x) {
						for (var d=0; d<4; ++d) {
							if (map.jumpPoints[4*(y*map.mapWidth+x)+d] != clientJumpPoints[i]) {
								var tileID = 4*(y*map.mapWidth+x)+d;
								differences[tileID] = map.jumpPoints[4*(y*map.mapWidth+x)+d];
							}

							++i;
						}
					}
				}

				this.respond(evt.id, _.isEmpty(differences), {
					differences: differences
				});

			} else {
				var dynamicHandler = this.handler(evt.evtType);
				if (dynamicHandler) {
					dynamicHandler.call(evt, evt.data);
				} else {
					this.onSomeEvent(evt);
				}
			}
		}).bind(this));

		this.respond = function(id, success, args){
			var response = new Response(id);
			response.success = success;
			if (args) {
				_.extend(response, args);
			}
			this.client.send(response.serialize());
		};

		this.send = function(evt, args){
			this.client.send(JSON.stringify({
				evtType: evt,
				data: args
			}));
		};

		this.step = function(time) {
			this.handlePendingEvents();
		};
	};

	return Player;
});
