				// TODO:
				//
				// 	> main.js (refactoring)
				// 		- remove try/catch; return error objects from functions
				// 		- client/resources.js: fetch (ajax/cache), load(resources.json, npc.json)
				// 		- debug.js, client/debug.js, server/debug.js: various debugging things,  window['TheOtherPlayer'] = ...
				// 		- pathfinding.js
				//
				// 	> server.js (refactoring)
				// 		- server/db.js: (create like client/serverHandler.js); connect, loadPlayer, savePlayer
				// 		- server/player.js: create/load/save, player.onDisconnected(..), player.onReconnected(..), player.onZoneOut(..), ...
				// 		- server/resources.js: read(resources.json, npc.json, world.json, maps); DONT add animations
				//
				//	> D/C queue; play player on D/C queue, D/C player when ready
				//	> CLEAN: plan out: sprite, animable, movable, entity  object heirarchy... server doesn't need animable? what about special NPC's? Player objects?  ---- Player, Character, NPC, Mob
				//	> CLEAN: clean up properties/method names...abstract ALL methods into units of code; the name of method describes precisely what its doing (without side effects) and the name of the property describes precisely what it is
				//	> Adopt Jasmine unit testing
				//	> server: abstract user & message queue as much as possible to allow for replays later on (saving batches of the message queue, reading it back in later); should also be able to load a debug client for viewing step-by-step operations during replay.. possible for doing this on client as well?
				//	> tools: fix + usage notes for tilesheet editor; use tilesheet editor for both animations + tiles; load resources.json on tilesheet editor to load all assets in list (easy access); npc tilesheets for maps; parse map spawns (find npc from npc tilesheets, then match to correct npc); automated updateAssets script
				//
				//
				//
				//
				//
				// 	> BAD COMBAT -- slow & buggy during circular attack and running off :: bad movement, player aggro without wait time after moving, NPC sits idle without chasing players (until player moves again to trigger them), if the wrong NPC attacks player and player can't reach their target then they don't switch to new NPC, I'm Attacking [X] shows different numbers for NPC's when they're both hitting same target
				// 		- look at ALL places outside of AI which may call AI listened events; keep track of these
				// 		- go through ALL core AI event handling; make necessary notes & comments
				// 		- test ONLY combat: check all event handling, make comments/notes
				// 		- test ONLY following: check all event handling, make comments/notes
				// 		- Recordable component: eventListening function which handles logging; keep track of ALL state changes, events handled; personal log function; allow enabling/disabling logging for each AI component; allow batching and serializing events, periodically add in a transaction to send to the DB; allow serializing a snapshot of the current component state (such that you can read the serialization and load it back to that exact state) - NOTE this needs to work with eventful component, AND needs to flush all Recordable components in order and in the same transactions since most will depend on each other.
				// 		- Set Recordable components: Movable, AI components, World, Map, Pages
				// 		- on D/C flush Recording
				// 		- Allow starting up from a Recording table (each table represents EITHER a date/startup_instance OR a snapshot/multiple_tables_per_game_startup); load everything in order, allow easy debugging (stopping at a certain point)
				//
				// 	> player D/C
				// 		EVT_PLAYER_DISCONNECTING, EVT_PLAYER_DISCONNECTED
				// 		- put on D/C queue; set lastActive property on player
				// 		- D/C queue checks lastActive property to determine if its okay to D/C (low priority check... every 50x gameLoops?)
				// 		- broadcast D/C_Initialized key; change opacity of player
				// 		- add AI to player on D/C_Initialized
				// 		- listen to player: move, attack; change lastActive
				// 		- on D/C save player to db, dc player, broadcast D/C
				// 		- on player logon: is he currently logged on?
				// 			- on D/C queue?
				// 				- check current AI status (for client-AI), send to client for initializing
				// 				- remove AI
				// 				- client setup local AI
				// 				- remove from D/C queue; remove lastActive
				// 			- ELSE
				// 				- send D/C to current client; close connection
				// 				- accept new connection
				// 		- on client receive D/C
				// 			- stop game; change opacity of canvas
				// 		- on client receive closed connection
				// 			- stop game; change opacity of canvas
				//
				//	> coreAI evt_target_zoned (but works with combat and following components too)
				//	> BUG: walk to new page (east), doesn't set zoning to false (cant walk to west and zone back)
				//	> BUG: when client spam clicks for a path and then enters debug mode, then leaving debug mode skips him to an illegal spot
				//	> BUG: both players attack NPC; NPC chases other player to next page; the remaining player doesn't receive page change of NPC and thinks its in the same page
				//	> BUG: player doesn't receive movement update of other player
				//	> BUG: in circle attack after 1 NPC dies, the other player can't choose to attack the previous NPC (already in attackList and not re-added?)
				//
				//
				//
				//	Bugs (cannot reproduce)
				// 	> BUG: multiplayer connect at different pages: doesn't show the other player, doesn't show NPC dying --- sees wrong player ID for other player
				// 	> BUG: multiplayer combat extremely slow (perhaps client side only w/ console open?)
				//
				//
				//
				//	> Loggable output to file
				//	> physical state machine
				//	> player dying: animation, corpse, respawn -- death message; respawn to safe spot, remove corpse after some time
				//	> experience, level up; level up notification
				//	> regenerate hp
				//	> experience relative to dmg done (what about regeneration? what about healing? what about hit & run? what about too high level?)
				//	> NO experience on kills during d/c; no experience on stairdancing
				//	> aggro K.O.S.
				//
				//
				//	> CLEAN: throw as much as possible; exception handling on ALL potential throwable statements
				//	> CLEAN: sometimes buggy path movement?
				//	> CLEAN: any chance of missing page events after zoning in?
				//	> CLEAN: spam clicking movement lags out the entire game (server should ignore noisy players; client should temporarily ignore input between processing)
				//	> CLEAN: sometimes bad rendering: the.camera.updated=true fixes it? ..render before loaded?
				//	> CLEAN: clicking to move while zoning (disallow)
				//	> CLEAN: movables not sent if 2 pages away (not in initial page neighbour)
				//	> CLEAN: on-zone displays other movables in bad position
				//	> CLEAN: high CPU usage
				//	> CLEAN: remove server animations; auto client animations (facing target, etc.)
				//	> CLEAN: requestAnimation for drawing; do step function outside of drawing (NOTE: requestAnimation WILL pause when inactive; hence do not allow core/networking functionality in the rendering)
				//	> CLEAN: try/catch (performance)
				//	> CLEAN: functions have to be object properties prototype functions kill performance
				//	> CLEAN: able to handle pauses from client (page not in focus -- delayed timeouts)
				//	> CLEAN: Movable setting params before/after Ext
				//	> CLEAN: multiple target types (NPC, Tile)
				//	> CLEAN: player/NPC moves to edge of new page; they are still able to attack across pages, but this may cause issues for other clients who don't have the other page/movables in memory
				//	> CLEAN: renderer.js, rendering page & sprites & movables; render only visible portion of pages
				//
				//
				//	
				//
				//
				//
				//
				//	> scripting language for combat, skills, interacting, UI, gameplay
				// 	> application (UI, login, etc.)
				// 	> combat; mob spawning; experience
				// 	> questing; dfa's
				// 	> loot; inv belt; usable items; armour, weapons; amulets/shoes/weapons/armour on sprite
				// 	> testing, logging, fault tolerance, testing server, auto bug reports, performance
				// 	> triggers, traps
				//
				// 	> animated static sprites (eg. fire)
				// 	> multi-tiled movables (eg. cthulu, boat) ;; ghost tiles which point to 1 entity, 1 visible sprite which takes up multiple tiles (like firefox)
				// 	> boat: walk on & off, can't get off on water, walk on boat while boat moving, walk on boat while boat zoning (pages, maps)
				// 	> dynamic collidables (drawbridge, shifting walls)
				//
				// 	> Env define / with(Env) ? use Env rather than 32
				// 	> draw tiles correctly (start/end) on camera update
				// 	> compress tiles w/ base tile
				// 	> better sprite representation
				// 	> abstract rendering
				// 	> cleanup main
				// 	> y direction protocol
				// 	> define direction (not "north" "east" etc) & allow (northeast == north | east)
				// 	> resource handling protocol (load everything at beginning - store locally if possible)
				// 	> awkward camera skiterring on zone
				// 	> improve messaging system between client/server
				// 	> A* pathfinding; maximum path length (server)
				// 	> pathfinding destination tile (for each walk)
				// 	> Error handling
				// 	> on zone-in, unload unecessary pages
				// 	> zone-in/out on map change, rename key for page change
				// 	> sleep/wake-up entities
				// 	> map pages -- allow empty pages (eg. U-shaped map, or map which doesn't take up whole area).. pages should be skipped (empty) and not set as neighbours to anything.. possibly affect map width/height
				// 	> save game state on server d/c
				//	> disallow same player id to connect twice
				//	> portals to different spots of the same map
				//	> entity idle
				//	> abstract custom cursors & hovering entities
				//	> EVT_MOVED_TILE, better than listening to EVT_STEP in some cases
				//	> NPC has base NPC to inherit; NPC has AI component list
				//	> death animation
				//	> debugging: monitor events -- in case the same object listens to the same event more than once
				//	> debugging: keep track of all events, and periodic snapshots of the game output to a logfile -- that logfile could be read back to re-animate the game and show step-by-step what happened and where things went wrong
				//
				//  > TODO: protocol for: archiving paths / events / requests / responses (push archives); map/zones; abstract pathfinding & tiles/positions/distances; efficient path confirmation / recalibration on server; dynamic sprites (path-blocking objects & pushing entities); server path follows player requested paths (eg. avoiding/walking through fire, server path should do the same)
				//
				// 	> testing (grunt/jasmine? simulated lag, simulated players)
				// 	> WebRTC UDP approach ( && archive events)
				// 	> Webworkers for maps/pages on server & Transferable objects
				// 	> Db sharding
				// 	> Caching techniques (hot/cold components; cache lines)

define(['jquery','resources','entity','movable','map','page','client/camera','AI','client/serverHandler','loggable','client/renderer','client/ui'], function($,Resources,Entity,Movable,Map,Page,Camera,AI,ServerHandler,Loggable,Renderer,UI) {
try{

	extendClass(this).with(Loggable);
	this.setLogPrefix('(main) ');


	// ----------------------------------------------------------------------------------------- //
	// ----------------------------------------------------------------------------------------- //
	// ----------------------------------------------------------------------------------------- //
	// ----------------------------------------------------------------------------------------- //

	var modulesToLoad          = {},
		ready                  = false,
		LOADING_RESOURCES      = 1,
		LOADING_CONNECTION     = 2,
		LOADING_INITIALIZATION = 3,
		LOADING_FINISHED       = 4,
		loadingPhase           = LOADING_RESOURCES,
		loading                = function(module){ modulesToLoad[module] = false; },
		initializeGame         = null,
		startGame              = null,
		player                 = {},
		server                 = null,
		renderer               = null,
		ui                     = null,
		loaded=function(module){
			if (module) {
				console.log("Loaded: "+module);
				delete modulesToLoad[module];
			}
			if (ready && _.size(modulesToLoad)==0) {
				++loadingPhase;
				if (loadingPhase==LOADING_CONNECTION) connectToServer();
				else if (loadingPhase==LOADING_INITIALIZATION) initializeGame();
				else if (loadingPhase==LOADING_FINISHED) startGame();
			}
		}, connectToServer=function(){
			// Connect to the server

			server = new ServerHandler();
			var testingLocal = true,
				link = null;
			if (testingLocal) {
				link = 'ws://127.0.0.1:1338/';
			} else {
				link = 'ws://54.86.213.238:1338/';
			}



			server.onDisconnect = function(){
				Log("Disconnected from server..");
			};

			server.onNewCharacter = function(player){
				Log("Created new character "+player.id);
				var id = player.id;
				localStorage.setItem('id', id);
				server.login(id);
			};

			server.onLogin = function(player){

				Log("Logged in as player "+player.id);
				The.player      = new Movable('player');
				The.player.id   = player.id;
				The.player.position = player.position; // TODO: remove this quickfix

				// Setup basic AI (following target)
				Log("Giving AI to player", LOG_DEBUG);
				The.player.brain = new AI.Core(The.player);
				The.player.brain.addComponent(AI.Components['Follow']);
				// The.player.brain.addComponent(AI.Components['Combat']);

				The.player.step=_.wrap(The.player.step,function(step,time){
					var stepResults = step.apply(this, [time]);
					this.brain.step(time);
				});

				ready = false;
				loaded('player');

				Log("Requesting map..");
				server.requestMap();
				loading('map');
				ready = true;
			};

			server.onLoginFailed = function(evt){
				Log("Login failed", LOG_ERROR);
				Log(evt, LOG_ERROR);
			};
			
			server.onInitialization = function(evt){

				Log("Initializing map");
				The.map = new Map();
				The.map.loadMap(evt.map);
				The.map.addPages(evt.pages);


				The.camera = new Camera();
				camera     = The.camera;

				window['Movable'] = Movable;
				window['Entity'] = Entity;
				window['resources'] = Resources;

				The.player.addEventListener(EVT_ZONE, The.map, function(player, newPage, direction){
					this.zone(direction);
				});

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


				loaded('map');


			};

			server.connect(link).then(function(){
				// Connected

				// Attempt to login under id from localStorage (if none then creates new character)
				var id = localStorage.getItem('id');
				server.login(id);
			}, function(evt){
				console.error(evt);
			});

		};

		// Load game resources
		/////////////////////////

		loading('resources');
		$.ajax('data/resources.json', {
			cache: false,
			dataType: 'text'
		}).done(function(res){
			res = JSON.parse(res);

			// Load Sheets
			for (i=0; i<res.sheets.length; ++i) {
				var sheet = res.sheets[i];
				Resources.addSheet(sheet);
			}

			// Load Sprites
			for (i=0; i<res.sprites.length; ++i) {
				var sprite = res.sprites[i];
				Resources.addSprite(sprite);
				if (sprite.animations) {
					Resources.addAnimation({
						id:sprite.id,
						sheet:sprite.sheet,
						animations:sprite.animations
					});
				}
			}

			loaded('resources');
		}).fail(function(reason){
			console.log(reason);
		});

		loading('npc_list');
		$.ajax('data/npc.json', {
			cache: false,
			dataType: 'text'
		}).done(function(res){
		
			res = JSON.parse(res).npcs;

			// Load NPC's
			for (var i=0; i<res.length; ++i) {
				var npc = res[i];
				Resources.addNPC(npc);
			}

			loaded('npc_list');
		}).fail(function(reason){
			console.log(reason);
		});


		loading('extensions');
		Ext.ready(Ext.CLIENT).then(function(){
			console.log("Loaded extensions..");
			loaded('extensions');
		}, function(){
			// TODO: error loading extensions..
		});


		ready=true;
		loaded(); // In case tiles somehow loaded INSTANTLY fast



		// ----------------------------------------------------------------- //
		// ----------------------------------------------------------------- //
		// Game Initialization
		initializeGame = function(){

			var playerPosition = The.map.localFromGlobalCoordinates(The.player.position.y, The.player.position.x);
			The.map.curPage = playerPosition.page;
			The.player.page = The.map.curPage;
			// The.player.posY = playerPosition.y*Env.tileSize;
			// The.player.posX = playerPosition.x*Env.tileSize;

			The.map.curPage.addEntity( The.player );

			Log("Initializing UI");
			ui = new UI();
			ui.initialize( document.getElementById('entities') );
			ui.postMessage("Initializing game..", MESSAGE_PROGRAM);
			ui.setPage( The.map.curPage );
			The.player.addEventListener(EVT_ZONE, ui, function(player, newPage, direction){
				this.setPage( newPage );
			});


			renderer = new Renderer();
			renderer.canvasEntities    = document.getElementById('entities');
			renderer.canvasBackground  = document.getElementById('background');
			renderer.ctxEntities       = renderer.canvasEntities.getContext('2d');
			renderer.ctxBackground     = renderer.canvasBackground.getContext('2d');
			renderer.camera            = The.camera;
			renderer.ui                = ui;
			renderer.setMap( The.map );
			renderer.initialize();


			var requestAnimationFrame = window.requestAnimationFrame || window.mozRequestAnimationFrame ||
                              window.webkitRequestAnimationFrame || window.msRequestAnimationFrame;



			startGame = function() {
				var speed = 30,
					gameLoop = function() {

						time = new Date().getTime();

						The.map.step(time);
						The.camera.step(time);
						renderer.ui.step(time);
						renderer.render();
						

						// requestAnimationFrame(gameLoop);
						setTimeout(gameLoop, speed);
				};



				// -------------------------------------------------------------------------- //
				// -------------------------------------------------------------------------- //
				//             Server Messaging
				//
				// -------------------------------------------------------------------------- //

				server.onEntityAdded = function(page, addedEntity){

					if (addedEntity.id == The.player.id) {

					} else {
						var entity = new Movable(addedEntity.spriteID, The.map.pages[page]);
						Log("Adding Entity: "+addedEntity.id);
						entity.id           = addedEntity.id;
						entity.posY         = addedEntity.posY;
						entity.posX         = addedEntity.posX;
						entity.sprite.state = addedEntity.state;
						entity.zoning       = addedEntity.zoning;

						if (addedEntity.path) {
							var path = JSON.parse(addedEntity.path);
							entity.addPath(path);
						}

						The.map.pages[page].addEntity(entity);
					}

				};

				server.onEntityRemoved = function(page, removedEntity){

					Log("Removing Entity: "+removedEntity.id);

					var page   = The.map.pages[page],
						entity = page.movables[removedEntity.id];
					delete page.movables[removedEntity.id];
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
								y: entity.posY + entPage.y * Env.tileSize,
								x: entity.posX + entPage.x * Env.tileSize,
								localY: entity.posY,
								localX: entity.posX,
								globalY: Math.floor(entity.posY/Env.tileSize) + entPage.y,
								globalX: Math.floor(entity.posX/Env.tileSize) + entPage.x },
							pathState = {
								y: reqState.y,
								x: reqState.x,
								localY: reqState.posY,
								localX: reqState.posX,
								globalY: reqState.globalY,
								globalX: reqState.globalX
							},
							path = new Path(),
							walk = new Walk(),
							maxWalk = 1500 / entity.moveSpeed, // 5*Env.tileSize,
							adjustY = 0, // NOTE: in case walk already started and we need to adjust the 
							adjustX = 0; // 	 path state

						walk.fromJSON(event.path);
						walk.walked = 0;
						path.walks.push(walk);


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

							var localCoordinates = The.map.localFromGlobalCoordinates(pathState.globalY, pathState.globalX),
								page = The.map.pages[page];
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

								entity.posY = y;
								entity.posX = x;
								entity.sprite.idle();
							}

						}
					}

				};

				server.onEntityHurt = function(page, hurtEntity, targetEntity, amount){

					var entity = The.map.getEntityFromPage(hurtEntity.page, hurtEntity.id),
						target = The.map.getEntityFromPage(targetEntity.page, targetEntity.id);
					if (entity && target) entity.hurt(amount, target);

				};

				server.onEntityAttackedTarget = function(page, attackerEntity, targetEntity){

					var entity = The.map.getEntityFromPage(attackerEntity.page, attackerEntity.id),
						target = The.map.getEntityFromPage(targetEntity.page, targetEntity.id);

					if (entity && target) {
						// entity.faceDirection(direction);
						var direction = entity.directionOfTarget(target);
						entity.sprite.dirAnimate('atk', direction);
					}

				};

				server.onEntityNewTarget = function(page, eventEntity, targetEntity){

					var entity = The.map.getEntityFromPage(eventEntity.page, eventEntity.id),
						target = The.map.getEntityFromPage(targetEntity.page, targetEntity.id);

					if (entity && target) entity.brain.setTarget(target); // TODO: target could be in another page, when we set new target then this won't actually set; when the target moves to same page as entity then we won't have them as the current target

				};

				server.onEntityRemovedTarget = function(page, eventEntity, targetEntity){


					Log("Removing target for ["+eventEntity.id+"]");
					var entity = The.map.getEntityFromPage(eventEntity.page, eventEntity.id);

					// NOTE: do not select the target since the target may have died and been
					// removed locally
					if (entity) {

						// remove core target
						if (entity.brain.target && entity.brain.target.id == targetEntity.id) { 
							console.log("	Target to remove ["+eventEntity.id+"] currently targeting: ("+entity.brain.target.id+")");
							entity.brain.setTarget(null);
						}
					}

				};

				server.onEntityDied = function(page, deadEntity){

					// TODO: set die physical state, die animation, remove entity
					Log("Entity "+deadEntity+" died");
					var entity = The.map.curPage.movables[deadEntity];
					// NOTE: the entity may have already died if we've already received the killing blow event (client side noticed their health went below 0)
					// NOTE: This may mean that our entity health/hurt is out of sync with the server; we should
					// have seen them die locally before receiving this (unless attacked/dead were both apart
					// of the same page event buffer)
					if (entity) {
						entity.triggerEvent(EVT_DIED);
					}

				};

				server.onZone = function(pages){

					// Zoning information (new pages)

					// unload previous pages which are NOT neighbours to this page
					var existingPages = {};
					for (var pageI in The.map.pages) {
						existingPages[pageI] = true;
					}

					for (var pageI in pages) {
						delete existingPages[pageI];

						// TODO: is neighbour?
					}

					for (var pageI in existingPages) {
						// The.map.pages[pageI].unload();
						// delete The.map.pages[pageI];
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
					ui.setPage( The.map.curPage );

					The.player.posY = player.posY;
					The.player.posX = player.posX;
					The.camera.updated = true;

					renderer.setMap( The.map );

				};


				// Start gameloop
				gameLoop();
			}

			ready=true;
			loaded();


			// -------------------------------------------------------
			// -------------------------------------------------------
			// Event Listeners
			// TODO: abstract event listeners to call "tryPath" or "hoverMap"

			ui.onMouseMove = function(mouse){

				try {

					ui.tileHover = new Tile(mouse.y, mouse.x);

					ui.hoveringEntity = false;
					for (var movableID in The.map.curPage.movables) {
						var movable = The.map.curPage.movables[movableID];
						if (movable.npc.killable) {
							if (movable.playerID) continue;
							if (mouse.canvasX >= movable.posX && mouse.canvasX <= movable.posX + 32 &&
								mouse.canvasY >= movable.posY && mouse.canvasY <= movable.posY + 32) {
									// Hovering movable
									ui.hoveringEntity = movable;
									break;
							}
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
					server.attackEntity(ui.hoveringEntity)
						  .then(function(){
							  The.player.brain.setTarget(ui.hoveringEntity);
						  });
					return;
				}

				// 	click to move player creates path for player
				var walkTo       = { x: mouse.x + parseInt(The.camera.offsetX/Env.tileSize),
									 y: mouse.y - parseInt(The.camera.offsetY/Env.tileSize) },
					playerY      = The.map.curPage.y * Env.tileSize + The.player.posY,
					playerX      = The.map.curPage.x * Env.tileSize + The.player.posX,
					nearestTiles = The.map.findNearestTiles(playerY, playerX),
					toTile       = The.map.tileFromLocalCoordinates(walkTo.y, walkTo.x),
					time         = now(),
					path         = The.map.findPath(nearestTiles, [toTile]);

				if (path) {
					console.log("Path TO: ("+walkTo.y+","+walkTo.x+") FROM ("+(The.player.posY/Env.tileSize)+","+(The.player.posX/Env.tileSize)+") / ("+path.start.tile.y+","+path.start.tile.x+")");
					console.group();
					console.log(path);
					if (The.player.brain.target) {
						server.playerDistracted();
						The.player.triggerEvent(EVT_DISTRACTED);
					}


					// inject walk to beginning of path depending on where player is relative to start tile
					var startTile = path.start.tile,
						recalibrateY = false,
						recalibrateX = false,
						path = path.path,
						playerPosition = { y: The.player.posY + The.map.curPage.y * Env.tileSize,
										   x: The.player.posX + The.map.curPage.x * Env.tileSize };
					if (The.player.posY / Env.tileSize - startTile.y >= 1) throw "BAD Y assumption";
					if (The.player.posX / Env.tileSize - startTile.x >= 1) throw "BAD X assumption";
					if (playerPosition.y - startTile.y * Env.tileSize != 0) recalibrateY = true;
					if (playerPosition.x - startTile.x * Env.tileSize != 0) recalibrateX = true;

					path.splitWalks();

					if (recalibrateY) {
						// Inject walk to this tile
						var distance    = -1*(playerPosition.y - startTile.y * Env.tileSize),
							walk        = new Walk((distance<0?NORTH:SOUTH), Math.abs(distance), startTile.offset(0, 0));
						console.log("Recalibrating Walk (Y): ");
						console.log("	steps: "+distance);
						path.walks.unshift(walk);
					}
					if (recalibrateX) {
						// Inject walk to this tile
						var distance    = -1*(playerPosition.x - startTile.x * Env.tileSize),
							walk        = new Walk((distance<0?WEST:EAST), Math.abs(distance), startTile.offset(0, 0));
						console.log("Recalibrating Walk (X): ");
						console.log("	steps: "+distance+" FROM ("+The.player.posX+") TO ("+startTile.x*Env.tileSize+")");
						path.walks.unshift(walk);
					}
					path.walks[0].time = time;

					for (i=0; i<path.walks.length; ++i) {
						var walk = path.walks[i];
						console.log("Walk: ("+walk.direction+", "+walk.distance+", "+walk.steps+")");
					}
					console.groupEnd();

					if (path.walks.length) {
						The.player.addPath(path, true);
					}

					ui.tilePathHighlight = toTile;

					The.player.addEventListener(EVT_FINISHED_PATH, this, function(player, walk){
						ui.tilePathHighlight = null;
					});
				} else {
					console.log("Bad path :(");
				}

			};

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


			The.player.addEventListener(EVT_PREPARING_WALK, this, function(player, walk){

				var playerPosition = { y: The.player.posY + The.map.curPage.y * Env.tileSize,
									   x: The.player.posX + The.map.curPage.x * Env.tileSize,
									   globalY: Math.floor(The.player.posY / Env.tileSize) + The.map.curPage.y,
									   globalX: Math.floor(The.player.posX / Env.tileSize) + The.map.curPage.x },
					state = {
						page: The.map.curPage.index,
						posY: The.player.posY,
						posX: The.player.posX,
						y: playerPosition.y,
						x: playerPosition.x,
						globalY: playerPosition.globalY,
						globalX: playerPosition.globalX
					};
				
				server.walkTo(walk, state).then(function(){
				}, function(response){
					// not allowed...go back to state
					console.error("Going back to state..");
					console.error(state);
					console.error(event);

					tilePathHighlight=null;

					The.map.curPage = The.map.pages[state.page];
					if (response.state) {
						The.player.posY = response.state.posY;
						The.player.posX = response.state.posX;
					} else {
						The.player.posY = state.posY;
						The.player.posX = state.posX;
					}
					The.player.path = null;
					// The.player.lastMoved = null;
					The.player.sprite.idle();
					ui.setPage( The.map.curPage );
				});

			});

		};
}catch(e){
	printStackTrace();
}
});
