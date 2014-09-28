define(['eventful', 'loggable', 'movable', 'event'], function(Eventful, Loggable, Movable, Event){

	var Player = function(client){
		extendClass(this).with(Loggable);
		extendClass(this).with(Eventful);
		this.setLogGroup('Player');
		this.setLogPrefix('(Player)[null] ');

		this.id           = null;
		this.movable      = null;
		this.lastActionId = 0;
		this.client       = client;

		this.onDisconnected = new Function();
		this.onRequestNewCharacter = new Function();
		this.onLogin = new Function();

		this.onPreparingToWalk = new Function();
		this.onSomeEvent = new Function();

		// TODO: add archiving later?
		// this.responseArchive = new EventsArchive();
		// this.pathArchive = new EventsArchive();
		// you.responseArchive.pushArchive();
		// you.pathArchive.pushArchive();


		this.setPlayer = function(player){

			this.id = player.id;
			this.setLogPrefix('(Player)['+player.id+'] ');
			this.Log("Logged in player ["+player.id+"]");
			this.Log(player, LOG_DEBUG);

			// Set players position
			if (!The.world.maps[player.map]) {
				this.Log("Map ("+player.map+") not found in world!", LOG_ERROR);
				return false;
			}
			var map            = The.world.maps[player.map],
				playerPosition = map.localFromGlobalCoordinates(player.position.y, player.position.x),
				respawnPoint   = The.world.maps[player.respawn.map].localFromGlobalCoordinates(player.respawn.position.y, player.respawn.position.x);

			this.movable          = new Movable('player', playerPosition.page, {
												posY: playerPosition.y * Env.tileSize,
												posX: playerPosition.x * Env.tileSize,
												respawnPoint: new Tile( respawnPoint.y + respawnPoint.page.y,
																		respawnPoint.x + respawnPoint.page.x,
																		respawnPoint.page.map ) });
			this.movable.playerID = player.id;

			this.movable.page.addEntity(this.movable);


			this.movable.addEventListener(EVT_ZONE, this, function(player, page){
				this.Log("Zoned player from ("+ this.movable.page.index +") to ("+ page.index +")");
				var oldPage       = this.movable.page,
					oldNeighbours = {};

				for (var neighbour in oldPage.neighbours) {
					if (oldPage.neighbours[neighbour]) {
						oldNeighbours[oldPage.neighbours[neighbour].index]  = oldPage.neighbours[neighbour];
					}
				}

				this.movable.page = page;



				// Send new page & neighbours as necessary
				// If neighbour page was sent previously then don't send again
				var initialization = {
					zone:true,
					pages:{}
				};

				initialization.pages[page.index] = page.serialize(PAGE_SERIALIZE_BASE | PAGE_SERIALIZE_MOVABLES);
				for (var neighbour in page.neighbours) {
					var npage = page.neighbours[neighbour];
					if (npage && !oldNeighbours[npage.index] && npage.index != oldPage.index) {
						initialization.pages[npage.index] = npage.serialize(PAGE_SERIALIZE_BASE);
					}
				}

				this.client.send(JSON.stringify(initialization));
			});

			this.movable.addEventListener(EVT_ZONE_OUT, this, function(player, map, page) {
				this.Log("Zoned player from ("+this.movable.page.map.id+") to ["+map.id+"]");
				this.movable.page = page;

				var oldMap = this.movable.page.map,
					initialization = {
					zoneMap:true,
					map:{
						id: oldMap.id,
						pagesPerRow: oldMap.pagesPerRow,
						mapWidth: oldMap.map.properties.width,
						mapHeight: oldMap.map.properties.height,
						tileset: oldMap.map.properties.tileset,
					},
					player:{
						posY: this.movable.posY,
						posX: this.movable.posX,
						page: this.movable.page.index
					},
					pages:{}
				};

				initialization.pages[page.index] = page.serialize(PAGE_SERIALIZE_BASE | PAGE_SERIALIZE_MOVABLES);
				for (var neighbour in page.neighbours) {
					var npage = page.neighbours[neighbour];
					if (npage) initialization.pages[npage.index] = npage.serialize(PAGE_SERIALIZE_BASE);
				}

				this.client.send(JSON.stringify(initialization));
			});

			this.movable.brain.addEventListener(EVT_RESPAWNED, this, function(player){
				this.Log("Player respawned");

				var page = this.movable.page,
					map = page.map,
					initialization = {
						respawn:true,
						map:{
							id: map.id,
							pagesPerRow: map.pagesPerRow,
							mapWidth: map.map.properties.width,
							mapHeight: map.map.properties.height,
							tileset: map.map.properties.tileset,
						},
						player:{
							posY: this.movable.posY,
							posX: this.movable.posX,
							page: this.movable.page.index,
							health: this.movable.health
						},
						pages:{}
				};

				initialization.pages[page.index] = page.serialize(PAGE_SERIALIZE_BASE | PAGE_SERIALIZE_MOVABLES);
				for (var neighbour in page.neighbours) {
					var npage = page.neighbours[neighbour];
					if (npage) initialization.pages[npage.index] = npage.serialize(PAGE_SERIALIZE_BASE);
				}

				this.client.send(JSON.stringify(initialization));
			}, HIGH_PRIORITY);

			return true;
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
				maxWalk  = 1500/player.moveSpeed; // 5*Env.tileSize; // maximum delay of 1.5s (1500/(moveSpeed*tileSize))

			walk.fromJSON(action.data);
			walk.walked = 0;
			path.walks.push(walk);

			if (path.length() > maxWalk) {
				this.Log("Path longer than maxwalk..", LOG_ERROR);
				this.Log(path, LOG_ERROR);
				return;
			}


			// 
			// Check path is safe (no collisions)
			//
			////////////////////////////////////////

			var start     = new Tile(reqState.globalY, reqState.globalX),
				vert      = (walk.direction == NORTH || walk.direction == SOUTH),
				positive  = (walk.direction == SOUTH || walk.direction == EAST),
				walked    = 0,
				tiles     = [],
				k         = (vert ? player.posY : player.posX),
				kT        = (vert ? start.globalY : start.globalX),
				dist      = walk.distance,
				safePath  = true,
				nextTile  = start;


			if (!map.isTileInRange(start)) {
				this.Log("Bad start of path! ("+start.y+","+start.x+")", LOG_ERROR);
				return;
			}

			k += (vert?your.page.y:your.page.x)*16;
			// this.Log("	Checking tile ("+nextTile.y+","+nextTile.x+")");
			var localCoordinates = map.localFromGlobalCoordinates(nextTile.y, nextTile.x),
				index            = localCoordinates.y*Env.pageWidth + localCoordinates.x,
				isSafe           = (localCoordinates.page.collidables[localCoordinates.y] & (1<<localCoordinates.x) ? false : true);
			if (!isSafe) safePath = false;
			if (isSafe) {
				while (walked<walk.distance) {
					var distanceToTile = (positive? (kT+1)*16 - k : k - ((kT)*16 - 1));
					try {
						if (vert) {
							nextTile = nextTile.offset((positive?1:-1), 0);
						}  else {
							nextTile = nextTile.offset(0, (positive?1:-1));
						}

						// check tile
						// console.log("	Checking tile ("+nextTile.y+","+nextTile.x+")");

						if (!map.isTileInRange(nextTile)) {
							throw new RangeError("Bad start of path! ("+start.y+","+start.x+")");
						}

						var localCoordinates = map.localFromGlobalCoordinates(nextTile.y, nextTile.x),
							index            = localCoordinates.y*Env.pageWidth + localCoordinates.x,
							isSafe           = (localCoordinates.page.collidables[localCoordinates.y] & (1<<localCoordinates.x) ? false : true);
						if (!isSafe) {
							safePath = false;
							break;
						}

						walked += distanceToTile;
						k += distanceToTile;
						kT += (positive?1:-1);
					} catch(e) {
						safePath = false;
						break;
					}
				}

			}

			var movableState = {
					y: player.posY + player.page.y * Env.tileSize, // NOTE: global real coordinates
					x: player.posX + player.page.x * Env.tileSize,
					localY: player.posY,
					localX: player.posX,
					globalY: Math.floor(player.posY/Env.tileSize) + player.page.y,
					globalX: Math.floor(player.posX/Env.tileSize) + player.page.x },
				pathState = {
					y: reqState.y,
					x: reqState.x,
					localY: reqState.posY,
					localX: reqState.posX,
					globalY: reqState.globalY,
					globalX: reqState.globalX
				};

			if (!safePath) {
				this.Log("Path is not safe for user... cancelling!");

				var response     = new Response(action.id);
				response.success = false;
				response.state   = { x: movableState.x, y: movableState.y, posX: movableState.localX, posY: movableState.localY };
				this.client.send(response.serialize());
				return;
			}

			var success = map.recalibratePath(movableState, pathState, path, maxWalk);

			if (success) {

				// var pathCpy = extendClass({}).with(path);
				// pathCpy.time = action.time;
				// pathCpy.state = action.state;
				// you.pathArchive.addEvent(pathCpy); // TODO: need to pushArchive for path sometimes

				player.path=null;
				player.addPath(path);

				// TODO: Clean try/catch
				try {
					var response = new Response(action.id);
					response.success = true;
					this.client.send(response.serialize());
				} catch(e) {
					console.log("Player not even here..");
				}
				return;
			} else {

				// TODO: Clean try/catch
				try {
					var response = new Response(action.id);
					response.success = false;
					response.state = { x: movableState.x, y: movableState.y };
					this.client.send(response.serialize());
				} catch(e) {
					console.log("Player not even here..");
				}
				return;
			}


			var response = new Response(action.id);
			response.success = false;
			this.client.send(response.serialize());
			return;
		};

		this.disconnectPlayer = function(){
			this.Log("Disconnecting player..");
			this.movable.stopAllEventsAndListeners();

			// TODO: find better way to remove movable from page
			var page = this.movable.page;
			delete page.movables[this.movable.id];
			for (var i=0; i<page.updateList.length; ++i) {
				if (page.updateList[i].id == this.movable.id) {
					page.updateList.splice(i,1);
					break;
				}
			}
		};

		this.attackTarget = function(targetID){
			this.Log("Player requesting to attack entity["+targetID+"]..");
			var target = this.movable.page.movables[targetID];
			if (target && target.playerID) {
				console.log('	NO Player Killing!!');
				return; // NO player killing!
			}
			this.movable.triggerEvent(EVT_AGGRO, this.movable.page.movables[targetID]);
		};

		client.on('close', (function() {
			this.onDisconnected();
			this.Log('websocket connection close ['+this.id+']');
		}).bind(this));

		client.on('message', (function(evt) {
			this.Log(evt, LOG_DEBUG);
			var evt = JSON.parse(evt);
			if (!evt) {
				Log("			BAD MESSAGE!? Weird..", LOG_ERROR);
				// TODO: tell client that the message was misunderstood?
				return;
			}
			if (evt.id!=this.lastActionId+1) {
				Log("			Sorry user("+this.id+")..we may have missed some of your messages..  "+evt.id+"!="+(this.lastActionId+1), LOG_ERROR);
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
					}).bind(this));
				} else if (evt.evtType==EVT_LOGIN) {
					var id = parseInt(evt.data.id);
					if (isNaN(id)) {
						this.Log("User attempting to login under a bad id ("+id+")", LOG_ERROR);
						// TODO: tell the user they're being bad
						return;
					}
					this.Log("User logging in as ["+id+"]");
					this.onLogin(id).then((function(details){
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
						};
						this.client.send(response.serialize());

						callback();
					}).bind(this), (function(){
					   this.Log("Could not login player..", LOG_ERROR);
					   var response     = new Response(evt.id);
					   response.success = false;
					   this.client.send(response.serialize());
					}).bind(this));
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
							tileset: map.map.properties.tileset,
						},
						pages:{}
					};

				initialization.pages[page.index] = page.serialize(PAGE_SERIALIZE_BASE | PAGE_SERIALIZE_MOVABLES);
				for (var neighbour in page.neighbours) {
					var npage = page.neighbours[neighbour];
					if (npage) initialization.pages[npage.index] = npage.serialize(PAGE_SERIALIZE_BASE);
				}

				this.client.send(JSON.stringify(initialization));

			} else if (evt.evtType==EVT_PREPARING_WALK) {
				this.Log("new message from user.. FROM ("+evt.state.posY+", "+evt.state.posX+") ----> "+evt.data.distance, LOG_DEBUG);
				this.onPreparingToWalk(evt);
			} else {
				this.onSomeEvent(evt);
			}
		}).bind(this));



		this.step = function(time) {
			this.handlePendingEvents();
		};
	};

	return Player;
});
