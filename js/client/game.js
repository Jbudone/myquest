define(['loggable', 'entity', 'movable', 'map', 'page', 'scriptmgr'], function(Loggable, Entity, Movable, Map, Page, ScriptMgr){

	var Game = (new function(){
		extendClass(this).with(Loggable);
		this.setLogPrefix('(Game) ');

		this.onStarted = new Function();

		var server   = null,
			ui       = null,
			camera   = null,
			renderer = null;

		var listenToPlayer = function(){

			// The.player.addEventListener(EVT_ZONE, ui, function(player, oldPage, newPage, direction){

			// });

			// NOTE: need to reset map listeners since this was all cleared when reloading scripts
			The.player.addEventListener(EVT_ZONE, The.map, function(player, oldPage, newPage, direction){
				console.log("Zone to "+newPage.index);
				this.zone(newPage);
			});

			The.player.addEventListener(EVT_FINISHED_PATH, this, function(player, walk){
				ui.tilePathHighlight = null;
			});

			The.player.addEventListener(EVT_PREPARING_WALK, this, function(player, walk){

				Log("Preparing to walk..");
				var playerPosition = { y: The.player.position.global.y,
									   x: The.player.position.global.x,
									   globalY: The.player.position.tile.y,
									   globalX: The.player.position.tile.x },
					state = {
						page: The.map.curPage.index,
						localY: The.player.position.local.y,
						localX: The.player.position.local.x,
						y: playerPosition.y,
						x: playerPosition.x,
						globalY: playerPosition.globalY,
						globalX: playerPosition.globalX
					};

				var onTileY = state.y % 16 == 0,
					onTileX = state.x % 16 == 0;
				if (!onTileY && !onTileX) {
					debugger;
					console.error("BAD STATE FOR WALK!");
					return;
				}

				this.Log("Sending walkTo request", LOG_DEBUG);
				this.Log(state, LOG_DEBUG);



				var safePath = The.map.pathfinding.checkSafeWalk(state, walk);
				if (!safePath) {
					debugger;
					console.error("We created a path that wasn't safe...weird");
					return false;
				}

				
				server.walkTo(walk, state).then(function(){
				}, function(response){
					// not allowed...go back to state
					console.error("Going back to state..");
					console.error(state);
					console.error(event);

					ui.tilePathHighlight=null;

					The.map.curPage = The.map.pages[state.page];
					if (response.state) {
						The.player.position.local.y = response.state.localY;
						The.player.position.local.x = response.state.localX;
					} else {
						The.player.position.local.y = state.localY;
						The.player.position.local.x = state.localX;
					}
					The.player.updatePosition();
					The.player.path = null;
					// The.player.lastMoved = null;
					The.player.sprite.idle();
					ui.updatePages();
				})
				.catch(Error, function(e){ errorInGame(e); })
				.error(function(e){ errorInGame(e); });

			});
		};

		var ready = true,
			callbacksWhenReady = [],
			callbackWhenReady = function(callback){
				if (ready) callback();
				else callbacksWhenReady.push(callback);
			},
			callbacksReady = function(){
				ready = true;
				for (var i=0; i<callbacksWhenReady.length; ++i) {
					callbacksWhenReady[i]();
				}
				callbacksWhenReady = [];
			};

		this.connected = function(){
		};

		this.disconnected = function(){
			The.player.stopAllEventsAndListeners(The.map);
			The.scriptmgr.unload();
			if (this.hasOwnProperty('unhookAllHooks')) this.unhookAllHooks();

			window['isGameRunning'] = false;
		};

		this.loadedPlayer = function(player){
			The.player          = true; // NOTE: this is used to help the initiatilization of Movable below to determine that it is our player (The.player =  =  = true)
			The.player          = new Movable('player');
			The.player.id       = player.id;
			The.player.playerID = player.id;
			The.player.name     = player.name;

			The.player.position = {
				tile: new Tile(player.position.x, player.position.y),
				global: { y: player.position.y * Env.tileSize, x: player.position.x * Env.tileSize },
				local: null,
			};
		};

		this.initialize = function(evt, _server){


			window['isGameRunning'] = true;
			Log("Initializing map");
			The.map = new Map();
			The.map.loadMap(evt.map);
			The.map.addPages(evt.pages);


			server = _server;
			camera = The.camera;
			camera.initialize();

			window['Movable'] = Movable;
			window['Entity'] = Entity;
			window['resources'] = Resources;
			
			listenToPlayer();

			reloadScripts().then(callbacksReady);

			// TODO: debugging commands should be placed elsewhere
			window['TheOtherPlayer'] = function(){
				var otherPlayerID = null;
				for (var movableID in The.player.page.movables) {
					var movable = The.player.page.movables[movableID];
					if (movable.spriteID == 'player' &&
						movable.id != The.player.id) {

						if (otherPlayerID !== null) {
							console.error("Multiple other players on page!?");
						} else {
							otherPlayerID = movable.id;
						}
					}
				}

				if (otherPlayerID) {
					var exists = (The.player.page.movables[otherPlayerID]);
					if (exists) {
						console.log("Other player ["+otherPlayerID+"] exists");
					} else {
						console.error("Other player ["+otherPlayerID+"] does NOT exists!");
					}
				}
			};
		};

		this.start = function(_ui, _renderer){


			var playerPosition = The.map.coordinates.localFromGlobal(The.player.position.global.x, The.player.position.global.y, true);
			The.map.curPage = playerPosition.page;
			The.player.page = The.map.curPage;
			The.player.position.local = playerPosition;

			if (!The.map.curPage.movables[The.player.id]) throw new Error("Player has not yet been added to page!");

			Log("Initializing UI");
			ui = _ui;
			if (!Env.isBot) {
				ui.initialize( document.getElementById('entities') );
			}
			ui.postMessage("Initializing game..", MESSAGE_PROGRAM);
			ui.camera = The.camera;
			ui.updatePages();


			renderer = _renderer;
			if (!Env.isBot) {
				renderer.canvasEntities    = document.getElementById('entities');
				renderer.canvasBackground  = document.getElementById('background');
				renderer.ctxEntities       = renderer.canvasEntities.getContext('2d');
				renderer.ctxBackground     = renderer.canvasBackground.getContext('2d');
			}
			renderer.camera            = The.camera;
			renderer.ui                = ui;
			renderer.setMap( The.map );
			renderer.initialize();



			var requestAnimationFrame = window.requestAnimationFrame || window.mozRequestAnimationFrame ||
                              window.webkitRequestAnimationFrame || window.msRequestAnimationFrame;





			startGame = function(){
				var speed = 50,
					gameLoop = function() {

						if (!isGameRunning) return;

						time = new Date().getTime();

						The.map.step(time);
						The.scriptmgr.step(time);

						// requestAnimationFrame(gameLoop);
						setTimeout(gameLoop, speed);
					}, render = function(){

						if (!isGameRunning) return;

						var _time = new Date().getTime();
						The.camera.step(_time);
						renderer.ui.step(_time);
						renderer.render();
						requestAnimationFrame(render);
						// setTimeout(render, 20);
					};
				render();




				// -------------------------------------------------------------------------- //
				// -------------------------------------------------------------------------- //
				//             Server Messaging
				//
				// -------------------------------------------------------------------------- //

				server.onEntityAdded = function(page, addedEntity){

					if (The.map.movables[addedEntity.id]) {
						// NOTE: its possible that our local entity position
						// hasn't updated to the servers entity position, and
						// hence the entity is stuck in another page. As a just
						// in case, update this entity to the current
						// page/position
						if (addedEntity.id != The.player.id) {
							var entity = The.map.movables[addedEntity.id];
							entity.page.zoneEntity(The.map.pages[page], entity);
							entity.page = The.map.pages[page];
							if (entity.page) {
								// TODO: abstract pathfinding & recalibration to not have to do this..
								addedEntity.state = {
									globalY: entity.page.y + parseInt(addedEntity.localY/Env.tileSize),
									globalX: entity.page.x + parseInt(addedEntity.localX/Env.tileSize),
									localY: addedEntity.localY,
									localX: addedEntity.localX,
									y: entity.page.y*Env.tileSize + addedEntity.localY,
									x: entity.page.x*Env.tileSize + addedEntity.localX,
								};
								server.onEntityWalking(page, addedEntity);
							} else {
								entity.page.zoneEntity(null, entity);
								The.map.unwatchEntity(entity);
							}
						}
						return; // Already have this entity loaded
					}
					if (addedEntity.id == The.player.id) {

					} else {
						var entity = new Movable(addedEntity.spriteID, The.map.pages[page], { id: addedEntity.id });
						Log("Adding Entity: "+addedEntity.id);
						entity.id               = addedEntity.id;
						entity.position.local.y = addedEntity.localY;
						entity.position.local.x = addedEntity.localX;
						entity.sprite.state     = addedEntity.state;
						entity.zoning           = addedEntity.zoning;

						if (addedEntity.path) {
							var path = JSON.parse(addedEntity.path);
							entity.addPath(path);
						}

						The.map.watchEntity(entity);
						The.map.pages[page].addEntity(entity);
						entity.page = The.map.pages[page];
						entity.updatePosition();
					}

				};

				server.onEntityRemoved = function(page, removedEntity){

					if (removedEntity.id == The.player.id) return;
					Log("Removing Entity: "+removedEntity.id);

					var page   = The.map.pages[page],
						entity = page.movables[removedEntity.id];
					The.map.removeEntity(entity);
				};

				server.onEntityWalking = function(page, event){

					if (event.id == The.player.id) {

					} else {
						var entPage = The.map.pages[page],
							entity = entPage.movables[event.id],
							reqState = event.state;

						if (!entity) {
							Log("Event to move entity, but entity not on same page. Ignoring event");
							return;
						}

						Log("Moving entity: "+entity.id, LOG_DEBUG);
						Log(event.state, LOG_DEBUG);
						Log(event.path, LOG_DEBUG);

						var movableState = {
								y: entity.position.local.y + entPage.y * Env.tileSize,
								x: entity.position.local.x + entPage.x * Env.tileSize,
								localY: entity.position.local.y,
								localX: entity.position.local.x,
								globalY: Math.floor(entity.position.local.y/Env.tileSize) + entPage.y,
								globalX: Math.floor(entity.position.local.x/Env.tileSize) + entPage.x },
							pathState = {
								y: reqState.y,
								x: reqState.x,
								localY: reqState.localY,
								localX: reqState.localX,
								globalY: reqState.globalY,
								globalX: reqState.globalX
							},
							path = new Path(),
							walk = new Walk(),
							maxWalk = 1500 / entity.moveSpeed, // 5*Env.tileSize,
							adjustY = 0, // NOTE: in case walk already started and we need to adjust the 
							adjustX = 0; // 	 path state

						// walk.fromJSON(event.path);
						// walk.walked = 0;
						// path.walks.push(walk);
						path.fromJSON(event.path);
						if (!path.walks) debugger;
						if (path.walks && path.walks[0]) path.walks[0].walked = 0;

						// FIXME: USED FOR DEBUGGING PURPOSES
						var destination = null,
							dX = pathState.x,
							dY = pathState.y;
						for (var walkI=0; walkI<path.walks.length; ++walkI) {
							     if (walk.direction == NORTH) dY -= walk.distance;
							else if (walk.direction == SOUTH) dY += walk.distance;
							else if (walk.direction == WEST)  dX -= walk.distance;
							else if (walk.direction == EAST)  dX += walk.distance;
						}
						entity._serverPosition = {
							x: reqState.globalX,
							y: reqState.globalY,
							toX: dX / Env.tileSize,
							toY: dY / Env.tileSize,
						};


						var success = The.map.recalibratePath(movableState, pathState, path, maxWalk);
						if (success) {
							entity.path=null;
							entity.addPath(path);
						} else {
							// find end path and jump movable to there
							var y = pathState.y,
								x = pathState.x;
								 if (walk.direction == NORTH) y -= walk.distance;
							else if (walk.direction == SOUTH) y += walk.distance;
							else if (walk.direction == WEST)  x -= walk.distance;
							else if (walk.direction == EAST)  x += walk.distance;

							Log("COULD NOT MOVE ENTITY THROUGH PATH!! Jumping entity directly to end", LOG_WARNING);

							var localCoordinates = The.map.localFromGlobalCoordinates(pathState.globalX, pathState.globalY),
								page             = The.map.pages[page];

							if (localCoordinates instanceof Error) {
								Log("Could not find proper tile for entity..", LOG_ERROR);
								localCoordinates.print();
								return;
							}

							entity.path = null;
							if (localCoordinates.page.index != page.index) {

								delete page.movables[entity.id];
								for (var i=0; i<page.updateList.length; ++i) {
									if (page.updateList[i] == entity) {
										page.updateList.splice(i,1);
										break;
									}
								}

								// TODO: stopListeningTo everything?
								page.stopListeningTo(entity, EVT_FINISHED_WALK);
								page.stopListeningTo(entity, EVT_STEP);
								page.stopListeningTo(entity, EVT_PREPARING_WALK);

							} else {
								y -= page.y*Env.tileSize;
								x -= page.x*Env.tileSize;

								entity.position.local.y = y;
								entity.position.local.x = x;
								entity.updatePosition();
								entity.sprite.idle();
							}

						}

					}

				};

				server.onEntityHurt = function(page, hurtEntity, targetEntity, amount, health){

					console.log("ENTITY "+hurtEntity.id+" HURT BY "+targetEntity.id);
					var entity = The.map.movables[hurtEntity.id],
						target = The.map.movables[targetEntity.id];
					if (entity && target) {
						var styleType = MESSAGE_INFO;
						if (target == The.player) {
							styleType = MESSAGE_GOOD;
						} else if (entity == The.player) {
							styleType = MESSAGE_BAD;
						}
						ui.postMessage(target.npc.name + ' attacked ' + entity.npc.name + ' for ' + amount + ' damage', styleType);
						var direction = target.directionOfTarget(entity);
						target.sprite.dirAnimate('atk', direction);
						entity.character.hurt(amount, target.character, health);
					}

				};


				The.player.character.hook('die', this).after(function(){
					ui.fadeToBlack();
				});


				server.onZone = function(pages){
					// Zoning information (new pages)

					for (var pageI in pages) {
						if (The.map.pages[pageI]) {
							console.error("SERVER GAVE US A PAGE WHICH WE ALREADY HAVE!! WHAT A WASTE OF LATENCY");
							delete pages[pageI];
						}
					}

					// unload previous pages which are NOT neighbours to this page
					var existingPages = {};
					for (var pageI in The.map.pages) {
						existingPages[pageI] = true;
					}

					for (var pageI in pages) {
						delete existingPages[pageI];
					}

					delete existingPages[The.map.curPage.index];
					var neighbours = The.map.curPage.neighbours;
					for (var neighbourI in neighbours) {
						var neighbour = neighbours[neighbourI];
						if (neighbour && existingPages[neighbour.index]) {
							delete existingPages[neighbours[neighbourI].index];
						}
					}

					for (var pageI in existingPages) {
						The.map.pages[pageI].unload();
						delete The.map.pages[pageI];
					}

					The.map.addPages(pages, true); // Zoning into one of the new pages
				};

				server.onLoadedMap = function(newMap, pages, player){

					Log("Zoned to new map");
					var oldMap = The.map;

					The.map = new Map();
					The.map.loadMap(newMap);
					The.map.addPages(pages);

					oldMap.copyEventsAndListeners(The.map);
					oldMap.stopAllEventsAndListeners();
					The.player.changeListeners(oldMap, The.map);
					The.map.curPage    = The.map.pages[player.page];
					ui.clear();
					ui.updatePages();

					The.player.page = The.map.curPage;
					The.player.sprite.idle();


					The.player.position = {
						tile: new Tile( parseInt(player.position.local.x/Env.tileSize) + The.map.curPage.x, parseInt(player.position.local.y/Env.tileSize) + The.map.curPage.y ),
						global: { y: player.position.local.y + The.map.curPage.y * Env.tileSize, x: player.position.local.x + The.map.curPage.x * Env.tileSize },
						local: { y: player.position.local.y, x: player.position.local.x },
					};

					reloadScripts().then(callbacksReady);

					The.camera.updated = true;

					renderer.setMap( The.map );

				};

				server.onRespawn = function(map, pages, player){

					Log("Respawning..");
					The.player._character = player._character;
					The.player.physicalState.transition( STATE_ALIVE );

					var oldMap = The.map;

					The.map = new Map();
					The.map.loadMap(map);
					The.map.addPages(pages);

					oldMap.copyEventsAndListeners(The.map);
					oldMap.stopAllEventsAndListeners();
					The.player.changeListeners(oldMap, The.map);
					The.map.curPage    = The.map.pages[player.page];
					ui.clear();
					ui.updatePages();

					The.player.page = The.map.curPage;
					The.player.sprite.idle();

					listenToPlayer();


					The.player.position = {
						tile: new Tile( parseInt(player.localX/Env.tileSize) + The.map.curPage.x, parseInt(player.localY/Env.tileSize) + The.map.curPage.y ),
						global: { y: player.localY + The.map.curPage.y * Env.tileSize, x: player.localX + The.map.curPage.x * Env.tileSize },
						local: { y: player.localY, x: player.localX },
					};

					reloadScripts().then(callbacksReady);

					The.camera.updated = true;

					renderer.setMap( The.map );
					ui.updateAllMovables();
					ui.showMovable( The.player );
					ui.fadeIn();

				};



				// Start gameloop
				gameLoop();
				ui.postMessage("This game is under heavy development", MESSAGE_PROGRAM);
				ui.postMessage("Updates are committed regularly to Github but uploaded only occasionally", MESSAGE_PROGRAM);
				ui.postMessage("What's supported right now?", MESSAGE_PROGRAM);
				ui.postMessage("\t→ Zoning (pages/maps)", MESSAGE_PROGRAM);
				ui.postMessage("\t→ NPCs & AI", MESSAGE_PROGRAM);
				ui.postMessage("\t→ Combat (mostly working)", MESSAGE_PROGRAM);
				ui.postMessage("\t→ Items", MESSAGE_PROGRAM);
				ui.postMessage("\t→ Interaction (eg. clicking on king or TV)", MESSAGE_PROGRAM);
				ui.postMessage("What's on the TODO list?", MESSAGE_PROGRAM);
				ui.postMessage("\t→ Error handling", MESSAGE_PROGRAM);
				ui.postMessage("\t→ Bots", MESSAGE_PROGRAM);
				ui.postMessage("\t→ Periodic saving/backups", MESSAGE_PROGRAM);
				ui.postMessage("\t→ XP/Levelling", MESSAGE_PROGRAM);
				ui.postMessage("\t→ Character Inventory", MESSAGE_PROGRAM);
				ui.postMessage(" ", MESSAGE_PROGRAM);
				ui.postMessage(" ", MESSAGE_PROGRAM);
				ui.postMessage(" ", MESSAGE_PROGRAM);
				ui.postMessage("Game has started.. Welcome to MyQuest!..", MESSAGE_PROGRAM);
				ui.postMessage("\
             __  __        ____                  _   \n\
            |  \\/  |      / __ \\                | |  \n\
            | \\  / |_   _| |  | |_   _  ___  ___| |_ \n\
            | |\\/| | | | | |  | | | | |/ _ \\/ __| __|\n\
            | |  | | |_| | |__| | |_| |  __/\\__ \\ |_ \n\
            |_|  |_|\\__, |\\___\\_\\\\__,_|\\___||___/\__|\n\
                     __/ |                           \n\
                    |___/                            ", MESSAGE_PROGRAM);
				ui.postMessage("\t\t A simple web based multiplayer RPG game", MESSAGE_PROGRAM);


				this.onStarted();
			}.bind(this);



			// TODO: setup The.scripting interface
			The.scripting.player = The.player;
			The.scripting.UI = ui;
			The.scripting.user = The.user;
			The.scripting.server = {
				request: server.makeRequest.bind(server),
				registerHandler: server.registerHandler.bind(server),
				handler: server.handler.bind(server)
			};




			// -------------------------------------------------------
			// -------------------------------------------------------
			// Event Listeners
			// TODO: abstract event listeners to call "tryPath" or "hoverMap"

			ui.onMouseMove = function(mouse){

				try {

					ui.tileHover = new Tile(mouse.x, mouse.y);

					ui.hoveringEntity = false;
					for (var pageID in The.map.pages) {
						var page = The.map.pages[pageID],
							offY = (The.map.curPage.y - page.y)*Env.tileSize - The.camera.offsetY,
							offX = (The.map.curPage.x - page.x)*Env.tileSize + The.camera.offsetX;
						for (var movableID in page.movables) {
							var movable = page.movables[movableID],
								px      = movable.position.local.x - offX,
								py      = movable.position.local.y - offY;
							if (movable.npc.killable) {
								if (movable.playerID) continue;
								if (mouse.canvasX >= px && mouse.canvasX <= px + 16 &&
									mouse.canvasY >= py && mouse.canvasY <= py + 16) {
										// Hovering movable
										ui.hoveringEntity = movable;
										break;
								}
							}
						}
						if (ui.hoveringEntity) break;
					}

					ui.hoveringItem = false;
					for (var pageID in The.map.pages) {
						var page = The.map.pages[pageID],
							offY = (The.map.curPage.y - page.y)*Env.tileSize - The.camera.offsetY,
							offX = (The.map.curPage.x - page.x)*Env.tileSize + The.camera.offsetX;
						for (var itemCoord in page.items) {
							var item    = page.items[itemCoord],
								localY  = parseInt(itemCoord / Env.pageWidth),
								localX  = itemCoord - localY*Env.pageWidth,
								px      = localX * Env.tileSize - offX,
								py      = localY * Env.tileSize - offY;
							if (mouse.canvasX >= px && mouse.canvasX <= px + 16 &&
								mouse.canvasY >= py && mouse.canvasY <= py + 16) {
									// Hovering item
									ui.hoveringItem = item;
									break;
							}
						}
						if (ui.hoveringItem) break;
					}

					ui.hoveringInteractable = false;
					for (var pageID in The.map.pages) {
						var page = The.map.pages[pageID],
							offY = (The.map.curPage.y - page.y)*Env.tileSize - The.camera.offsetY,
							offX = (The.map.curPage.x - page.x)*Env.tileSize + The.camera.offsetX,
							localY = ui.tileHover.y + parseInt(offY/Env.tileSize),
							localX = ui.tileHover.x + parseInt(offX/Env.tileSize),
							localCoord = null;

						if (localY < 0 || localX < 0 || localY > Env.pageHeight || localX > Env.pageWidth) continue;
						localCoord = localY*Env.pageWidth + localX;

						if (page.interactables[localCoord]) {
							console.log("ZOMG: "+ page.interactables[localCoord]);
							ui.hoveringInteractable = page.interactables[localCoord];
							break;
						}
					}

					ui.updateCursor();

				} catch(e) {
					ui.tileHover = null;
				}

			};

			ui.onMouseDown = function(mouse){

				// Attack the enemy we're currently hovering
				if (ui.hoveringEntity) {
					The.user.clickedEntity( ui.hoveringEntity );
					return;
				}

				// Pickup item we're currently hovering
				if (ui.hoveringItem) {
					The.user.clickedItem( ui.hoveringItem );
					return;
				}

				// Pickup item we're currently hovering
				if (ui.hoveringInteractable) {
					The.user.clickedInteractable( ui.hoveringInteractable );
					return;
				}


				// 	click to move player creates path for player
				var walkTo       = { x: mouse.x + parseInt(The.camera.offsetX/Env.tileSize),
									 y: mouse.y - parseInt(The.camera.offsetY/Env.tileSize) },
					toTile       = The.map.tileFromLocalCoordinates(walkTo.x, walkTo.y);

				The.user.clickedTile( toTile );
			}.bind(this);

			// Load testing tools
			//////////////////////

			var randomMapPoint = function(attemptCount) {
				if (attemptCount > 100) return null;
				var randY     = Math.floor(Math.random()*13 + 1),
					randX     = Math.floor(Math.random()*29 + 1),
							  randIndex = randY*30 + randX;
				if ( The.map.curPage.collidables[randY] & (1<<randIndex) !== 0 ) {
					return randomMapPoint(attemptCount+1);
				}
				console.log("Random Map Point: {y: "+randY+", x: "+randX+"}   ("+attemptCount+" attempts)");
				return {y: randY, x: randX, index: randIndex};
			};

			var clickPoint = function(point){
				// var evt = document.createEvent("MouseEvents"); evt.initMouseEvent("mousemove", true, true, window, 0, 0, 0, (4)*Env.tileSize*Env.tileScale + 96, (3)*Env.tileSize*Env.tileScale + 8); document.getElementById('entities').dispatchEvent( evt )
				var evt = document.createEvent("MouseEvents"),
					bounds = document.getElementById('entities').getBoundingClientRect(),
					clientY = (point.y+1)*Env.tileSize*Env.tileScale + bounds.top,
					clientX = (point.x)*Env.tileSize*Env.tileScale + bounds.left;
				activeY = point.y;
				activeX = point.x;
				// evt.initMouseEvent("mousemove", true, true, window, 0, 0, 0, clientX, clientY);
				evt.initMouseEvent("mousedown", true, true, window, 0, 0, 0, clientX, clientY);
				document.getElementById('entities').dispatchEvent( evt );
			};

			window['randomMapPoint'] = randomMapPoint;
			window['clickPoint'] = clickPoint;


			callbackWhenReady( startGame );
		};


		var reloadScripts = function(){

			ready = false;
			return new Promise(function(loaded, failed){

				console.log("Reloading scripts..");
				The.scripting.map = The.map;

				if (The.scriptmgr) {
					The.scriptmgr.unload();
				}

				var loading = 2;

				Resources.loadScripts(Resources._scriptRes).then(function(){
					//delete Resources._scriptRes; // TODO: why delete them if this needs to be reloaded ???

					The.scriptmgr = new ScriptMgr();

					if (Resources.items.hasOwnProperty('items-not-loaded')) {
						delete Resources.items['items-not-loaded'];
						Resources.loadItemScripts().then(function(){
							if (--loading == 0) loaded();
						}, function(err){ errorInGame(err); })
						.catch(Error, errorInGame);
					} else {
						--loading;
					}

					if (Resources.interactables.hasOwnProperty('interactables-not-loaded')) {
						delete Resources.interactables['interactables-not-loaded'];
						Resources.loadInteractableScripts().then(function(){
							if (--loading == 0) loaded();
						}, function(err){ errorInGame(err); })
						.catch(Error, errorInGame);
					} else {
						--loading;
					}

					if (loading === 0) {
						loaded();
					}

				}, function(){
					console.error("Could not load scripts!");
				})
				.catch(Error, function(e){ errorInGame(e); })
				.error(function(e){ errorInGame(e); });

			});
		};

	}());

	return Game;
});
