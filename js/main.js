
define(['jquery','resources','entity','movable','map','page','client/camera','AI','client/serverHandler','loggable'], function($,Resources,Entity,Movable,Map,Page,Camera,AI,ServerHandler,Loggable) {
try{

	extendClass(this).with(Loggable);
	this.setLogPrefix('(main): ');


	// ----------------------------------------------------------------------------------------- //
	// ----------------------------------------------------------------------------------------- //
	// ----------------------------------------------------------------------------------------- //
	// ----------------------------------------------------------------------------------------- //

	var modulesToLoad={},
		ready=false,
		LOADING_RESOURCES=1,
		LOADING_CONNECTION=2,
		LOADING_INITIALIZATION=3,
		LOADING_FINISHED=4,
		loadingPhase=LOADING_RESOURCES,
		loading=function(module){ modulesToLoad[module]=false; },
		initializeGame=null,
		startGame=null,
		player = {},
		server = null,
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

			server.onLogin = function(player){

				console.log("Success logging in!");
				console.log(evt);
				player = evt.player;
				The.player = new Movable('player');
				The.player.id   = player.id;

				// Setup basic AI (following target)
				console.log("Giving AI to ME ("+player.id+")");
				The.player.brain = new AI.Core(The.player);
				The.player.brain.addComponent(AI.Components['Follow']);
				// The.player.brain.addComponent(AI.Components['Combat']);

				The.player.step=_.wrap(The.player.step,function(step,time){
					var stepResults = step.apply(this, [time]);
					this.brain.step(time);
				});

				loaded('player');

				var event = new Event((++requestsId), EVT_REQUEST_MAP, null, null);
				websocket.send(event.serialize());
				loading('map');
			};

			server.onLoginFailed = function(evt){
				console.log("Login failed");
				console.error(evt);
			};

			server.connect(link).then(function(){
				// Connected

				// Attempt to login under id from localStorage (if none then creates new character)
				var id = localStorage.getItem('id');
				server.login(id);
			}, function(evt){
				console.error(evt);
			}).

			websocket = {};
			websocket.onopen = function(evt) {
				console.log("Connected to server..");
				loaded('connection');
				console.log(evt);


				loading('player');


				var login = function(id) {

					var event;
					if (id) {
						event = new Event((++requestsId), EVT_LOGIN, { id: id }, null);
					} else {
						event = new Event((++requestsId), EVT_NEW_CHARACTER, {}, null);
					}
					websocket.send(event.serialize());
				}

				login(id);
			}
			websocket.onclose = function(evt) {
				console.log("Disconnected from server..");
				console.log(evt);
			}
			websocket.onerror = function(evt) {
				console.log("Server error..");
				console.log(evt);
			}
			websocket.onmessage = function(evt) {

					evt=JSON.parse(evt.data);
					if (!evt.hasOwnProperty('initialization')) {
						console.log("Message from server: ");
						console.log(evt);
					}
					if (typeof evt == "String") return;
					if (evt.newCharacter) {
						if (evt.success) {
							var id = evt.newCharacter.id;
							localStorage.setItem('id', id);
							event = new Event((++requestsId), EVT_LOGIN, { id: id }, null);
							websocket.send(event.serialize());
						} else {
							console.log("Error creating new character..??");
						}
					} else if (evt.login) {

						if (evt.success) {
							console.log("Success logging in!");
							console.log(evt);
							player = evt.player;
							The.player = new Movable('player');
							The.player.id   = player.id;

							// Setup basic AI (following target)
							console.log("Giving AI to ME ("+player.id+")");
							The.player.brain = new AI.Core(The.player);
							The.player.brain.addComponent(AI.Components['Follow']);
							// The.player.brain.addComponent(AI.Components['Combat']);

							The.player.step=_.wrap(The.player.step,function(step,time){
								var stepResults = step.apply(this, [time]);
								this.brain.step(time);
							});

							loaded('player');

							var event = new Event((++requestsId), EVT_REQUEST_MAP, null, null);
							websocket.send(event.serialize());
							loading('map');
						} else {
							console.log("Error logging in!");
							console.log(evt);
						}

					} else if (evt.initialization) {
						websocket.onmessage = null;

						var pagesPerRow = evt.map.pagesPerRow;

						The.map = new Map();
						The.map.id = evt.map.id;
						The.map.pagesPerRow = evt.map.pagesPerRow;
						The.map.mapWidth = evt.map.mapWidth;
						The.map.mapHeight = evt.map.mapHeight;
						The.map.sheet = Resources.findSheetFromFile(evt.map.tileset);


						for (var pageI in evt.pages) {
							var page = new Page(The.map),
								pageI = parseInt(pageI),
								evtPage = JSON.parse(evt.pages[pageI]);
							The.map.pages[pageI] = page;

							page.index = pageI;
							page.y = evtPage.y;
							page.x = evtPage.x;

							page.tiles = evtPage.tiles;
							page.sprites = evtPage.sprites;
							page.collidables = evtPage.collidables;

							if (evtPage.movables) {
								for (var entityID in evtPage.movables) {
									var movable = evtPage.movables[entityID];
									if (entityID == The.player.id) {

										console.log('creating firefox..');
										The.player.posY = movable.posY;
										The.player.posX = movable.posX;
										The.player.sprite.state = movable.state;

									} else {
										var entity = new Movable(movable.spriteID, page);
										console.log("ADDING Entity: "+entityID);
										entity.id           = movable.id;
										entity.posY         = movable.posY;
										entity.posX         = movable.posX;
										entity.sprite.state = movable.state;
										entity.zoning       = movable.zoning;

										if (movable.path) {
											var path = JSON.parse(movable.path);
											for (var j=0; j<path.walks.length; ++j) {
												var walk = path.walks[j];
												walk.started = false; // in case walk has already started on server
											}
											entity.addPath(path);
										}

										The.map.pages[pageI].addEntity(entity);
									}

								}
							}

							// figure out neighbours..
							if ((pageI%pagesPerRow)!=0 && The.map.pages[pageI-1]) { // West Neighbour
								page.neighbours.west = The.map.pages[pageI-1];
								page.neighbours.west.neighbours.east = page;
							}

							if (((pageI+1)%pagesPerRow)!=0 && The.map.pages[pageI+1]) { // East Neighbour
								page.neighbours.east = The.map.pages[pageI+1];
								page.neighbours.east.neighbours.west = page;
							}

							if ((pageI-pagesPerRow)>=0 && The.map.pages[pageI-pagesPerRow]) { // North Neighbour
								page.neighbours.north = The.map.pages[pageI-pagesPerRow];
								page.neighbours.north.neighbours.south = page;
							}

							if (The.map.pages[pageI+pagesPerRow]) { // South Neighbour
								page.neighbours.south = The.map.pages[pageI+pagesPerRow];
								page.neighbours.south.neighbours.north = page;
							}

							if (pageI%pagesPerRow!=0 && (pageI-pagesPerRow)>=0 && The.map.pages[pageI-1-pagesPerRow]) { // Northwest Neighbour
								page.neighbours.northwest = The.map.pages[pageI-1-pagesPerRow];
								page.neighbours.northwest.neighbours.southeast = page;
							}


							if (((pageI+1)%pagesPerRow)!=0 && (pageI-pagesPerRow)>=0 && The.map.pages[pageI+1-pagesPerRow]) { // Northeast Neighbour
								page.neighbours.northeast = The.map.pages[pageI+1-pagesPerRow];
								page.neighbours.northeast.neighbours.southwest = page;
							}

							if (((pageI+1)%pagesPerRow)!=0 && The.map.pages[pageI+1+pagesPerRow]) { // Southeast Neighbour
								page.neighbours.southeast = The.map.pages[pageI+1+pagesPerRow];
								page.neighbours.southeast.neighbours.northwest = page;
							}

							if ((pageI%pagesPerRow)!=0 && The.map.pages[pageI-1+pagesPerRow]) { // Southwest Neighbour
								page.neighbours.southwest = The.map.pages[pageI-1+pagesPerRow];
								page.neighbours.southwest.neighbours.northeast = page;
							}

								
						}

						The.camera = new Camera();
						camera=The.camera;
						map=The.map;

						window['map'] = map;
						window['Movable'] = Movable;
						window['Entity'] = Entity;
						window['resources'] = Resources;

						The.player.addEventListener(EVT_ZONE, The.map, function(player, newPage, direction){
							this.zone(direction);
						});

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


						// TODO:
						//
						// 	> main.js (refactoring)
						// 		- remove try/catch; return error objects from functions
						// 		- abstract server handling: serverHandler.js  - server object, connect/login/request, returns promises; hook various things: server.onDied(..).onZoned(..).on___(...)
						// 		- client/map.js: initialization, initalize page, add/remove entities/events; have a function for each well defined unit of operation (Map.entityAttacked(id, id, amount))
						// 		- client/resources.js: fetch (ajax/cache), load(resources.json, npc.json)
						// 		- client/renderer.js: init (pass canvases, camera, map/page, player, spritesheets; set canvas settings); render (render each individual thing); set tileHover, tilePathHighlight
						// 		- client/ui.js: init (canvas); set input handling (hover tile, click); hook events: UI.onHoverTile(..), 
						//
						//	> D/C queue; play player on D/C queue, D/C player when ready
						//	> CLEAN: plan out: sprite, animable, movable, entity  object heirarchy... server doesn't need animable? what about special NPC's? Player objects?  ---- Player, Character, NPC, Mob
						//	> CLEAN: clean up properties/method names...abstract ALL methods into units of code; the name of method describes precisely what its doing (without side effects) and the name of the property describes precisely what it is
						//	> Adopt Jasmine unit testing
						//	> server: abstract user & message queue as much as possible to allow for replays later on (saving batches of the message queue, reading it back in later); should also be able to load a debug client for viewing step-by-step operations during replay.. possible for doing this on client as well?
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
						//	> respawn on correct page
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
						loaded('map');

					}
			}
			window['websocket'] = websocket;

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

			var canvasEntities    = document.getElementById('entities'),
				canvasBackground  = document.getElementById('background'),
				ctxEntities       = canvasEntities.getContext('2d'),
				ctxBackground     = canvasBackground.getContext('2d'),
				tiles             = new Image(),
				sprite            = new Image(),
				tileSize          = Env.tileSize,
				tileHover         = null,
				hoveringEntity    = null,
				tilePathHighlight = null,
				activeX           = null,
				activeY           = null,
				walkToX           = null,
				walkToY           = null,
				lineWidth         = 3,
				map               = null,
				requestAnimationFrame = window.requestAnimationFrame || window.mozRequestAnimationFrame ||
                              window.webkitRequestAnimationFrame || window.msRequestAnimationFrame;

			camera=The.camera;
			var playerPosition = The.map.localFromGlobalCoordinates(player.position.y, player.position.x);
			The.map.curPage = playerPosition.page;
			The.player.page = The.map.curPage;
			// The.player.posY = playerPosition.y*Env.tileSize;
			// The.player.posX = playerPosition.x*Env.tileSize;

			The.map.curPage.addEntity( The.player );
			requestBuffer.pushArchive();

			// Canvas setup
			canvasEntities.width  = (Env.pageWidth+2*Env.pageBorder)*tileSize*Env.tileScale;
			canvasEntities.height = (Env.pageHeight+2*Env.pageBorder)*tileSize*Env.tileScale;
			canvasBackground.width  = (Env.pageWidth+2*Env.pageBorder)*tileSize*Env.tileScale;
			canvasBackground.height = (Env.pageHeight+2*Env.pageBorder)*tileSize*Env.tileScale;
			ctxEntities.mozImageSmoothingEnabled=false;
			ctxEntities.webkitImageSmoothingEnabled=false;
			ctxEntities.strokeStyle="#CCCCCC";
			ctxEntities.lineWidth=lineWidth;
			ctxBackground.mozImageSmoothingEnabled=false;
			ctxBackground.webkitImageSmoothingEnabled=false;
			ctxBackground.strokeStyle="#CCCCCC";
			ctxBackground.lineWidth=lineWidth;

			// TODO: store objects & sprites better; load from resources properly
			tiles = The.map.sheet.image;
			sprite = Resources.sheets['firefox'].image;

			startGame = function() {
				var speed = 30,
					gameLoop = function() {

						time = new Date().getTime();

						map=The.map;
						The.map.step(time);
						The.camera.step(time);


						// -------------------------------------------------------------------------- //
						// -------------------------------------------------------------------------- //
						//             Rendering
						//
						// -------------------------------------------------------------------------- //

						ctxEntities.clearRect(0, 0, canvasEntities.width, canvasEntities.height);
						var sheetData = The.map.sheet,
							sheet = sheetData.image;
						if (The.camera.updated) {
							ctxBackground.clearRect(0, 0, canvasBackground.width, canvasBackground.height);

							var tileSize=Env.tileSize,
								pageWidth=Env.pageWidth,
								pageHeight=Env.pageHeight,
								tilesPerRow=sheetData.tilesPerRow,
								offsetY=The.camera.offsetY,
								offsetX=The.camera.offsetX;



							// Draw Current Page
							// 	startY:
							// 		require  pt + size < page
							// 		starts @ max(floor(ipt) - 1, 0)
							var page = The.map.curPage,
								startY = Math.abs(parseInt(Math.min(0, The.camera.offsetY)/tileSize)),
								endY   = parseInt((Math.max(pageHeight*tileSize, pageHeight*tileSize - The.camera.offsetY))/tileSize),
								startX = Math.abs(parseInt(Math.min(0,  -The.camera.offsetX)/tileSize)),
								endX   = parseInt((Math.min(pageWidth*tileSize, pageWidth*tileSize + The.camera.offsetX))/tileSize);

							startY=0;
							endY=pageHeight;
							startX=0;
							endX=pageWidth;
							for(var iy=startY; iy<endY; ++iy) {
								for(var ix=startX; ix<endX; ++ix) {
									// TODO: abstract ty/tx and sy/sx fetch; use on all renders
									var tile=page.tiles[iy*pageWidth+ix]-1,
										spriteObj=page.sprites[iy*pageWidth+ix],
										sprite=(spriteObj?spriteObj.sprite-1:-1),
										ty=Math.max(-1,parseInt(tile/tilesPerRow)),
										tx=Math.max(-1,tile%tilesPerRow),
										sy=Math.max(-1,parseInt(sprite/tilesPerRow)),
										sx=Math.max(-1,sprite%tilesPerRow),
										scale=Env.tileScale,
										py=(iy*tileSize+The.camera.offsetY)*scale,
										px=(ix*tileSize-The.camera.offsetX)*scale;
									if (py+tileSize<=0 || py>=pageHeight*tileSize) {
										console.log("Bad spot!");
									}
									if (ty!=-1 && tx!=-1)
										ctxBackground.drawImage(sheet, tileSize*tx, tileSize*ty, tileSize, tileSize, px, py, scale*tileSize, scale*tileSize);
									// Draw sprite ONLY if its static
									if (sy!=-1 && sx!=-1 && sprite && spriteObj.hasOwnProperty('static'))
										ctxBackground.drawImage(sheet, tileSize*sx, tileSize*sy, tileSize, tileSize, px, py, scale*tileSize, scale*tileSize);
								}
							}

							// Draw border
							//	Camera width/height and offset (offset by -border)
							//	Draw ALL neighbours using this algorithm
							//	If no neighbour to left/top then leave offset as 0?
							var neighbours=[];
							for(var neighbourKey in The.map.curPage.neighbours) {
								var neighbour = The.map.curPage.neighbours[neighbourKey];
								if (!neighbour) continue;

								var neighbourInfo = {};
								neighbourInfo.neighbour = neighbour;
								neighbourInfo.name = neighbourKey;

								if (neighbourKey.indexOf('south')!=-1) {
									neighbourInfo.offsetY = pageHeight*Env.tileSize;
								} else if (neighbourKey.indexOf('north')!=-1) {
									neighbourInfo.offsetY = -pageHeight*Env.tileSize;
								} else {
									neighbourInfo.offsetY = 0;
								}

								if (neighbourKey.indexOf('west')!=-1) {
									neighbourInfo.offsetX = -pageWidth*Env.tileSize;
								} else if (neighbourKey.indexOf('east')!=-1) {
									neighbourInfo.offsetX = pageWidth*Env.tileSize;
								} else {
									neighbourInfo.offsetX = 0;
								}

								neighbours.push(neighbourInfo);
							}
							for(var neighbourKey in neighbours) {
								var neighbourInfo = neighbours[neighbourKey],
									neighbour = neighbourInfo.neighbour,
									offX = neighbourInfo.offsetX,
									offY = neighbourInfo.offsetY;
								for (var iy=0; iy<pageHeight; ++iy) {
									for (var ix=0; ix<pageWidth; ++ix) {
										var tile=neighbour.tiles[iy*pageWidth+ix]-1,
											spriteObj=neighbour.sprites[iy*pageWidth+ix],
											sprite=(spriteObj?spriteObj.sprite-1:-1),
											ty=Math.max(-1,parseInt(tile/tilesPerRow)),
											tx=Math.max(-1,tile%tilesPerRow),
											sy=Math.max(-1,parseInt(sprite/tilesPerRow)),
											sx=Math.max(-1,sprite%tilesPerRow),
											scale=Env.tileScale,
											py=(iy*tileSize+offsetY+offY)*scale,
											px=(ix*tileSize-offsetX+offX)*scale;

										// TODO: test routine to check that each tile rendered IS displayed (0<py,py+size<pageHeight)

										// NOTE: 0<py,py+tileSize<pageHeight --> render
										if (ty!=-1 && tx!=-1)
											ctxBackground.drawImage(sheet, tileSize*tx, tileSize*ty, tileSize, tileSize, px, py, scale*tileSize, scale*tileSize);
										if (sy!=-1 && sx!=-1 && sprite && spriteObj.hasOwnProperty('static'))
											ctxBackground.drawImage(sheet, tileSize*sx, tileSize*sy, tileSize, tileSize, px, py, scale*tileSize, scale*tileSize);
									}
								}
							}

							The.camera.updated = false;
						}


						// Draw tile highlights
						if (tileHover) {

							var scale = Env.tileScale,
								tileSize = Env.tileSize;
							ctxEntities.save();
							ctxEntities.globalAlpha = 0.4;
							ctxEntities.strokeRect(scale*tileSize*tileHover.x, scale*tileSize*tileHover.y, scale*tileSize-(lineWidth/2), scale*tileSize-(lineWidth/2));
							ctxEntities.restore();

						}

						if (tilePathHighlight) {

							if (!tilePathHighlight.hasOwnProperty('step')) tilePathHighlight.step=0;

							var scale = Env.tileScale,
								tileSize = Env.tileSize,
								y = (tilePathHighlight.y - The.map.curPage.y) * scale * tileSize + The.camera.offsetY * scale,
								x = (tilePathHighlight.x - The.map.curPage.x) * scale * tileSize - The.camera.offsetX * scale,
								width = scale*tileSize-(lineWidth/2),
								height = scale*tileSize-(lineWidth/2),
								step = ++tilePathHighlight.step,
								color = (step<5?'#88FF88':'#22DD22');

							if (step%10==0) {
								tilePathHighlight.step = 0;
							}
								

							ctxEntities.save();
							ctxEntities.strokeStyle='#669966';
							ctxEntities.globalAlpha = 0.4;
							ctxEntities.strokeRect(x, y, width, height);

							ctxEntities.globalAlpha = 0.8;
							ctxEntities.strokeStyle=color;
							ctxEntities.setLineDash([4*scale]);
							ctxEntities.strokeRect(x, y, width, height);
							ctxEntities.restore();

						}



						var floatingSprites = [];

						// TODO: draw neighbour sprites


						// Draw sprites
						var page = The.map.curPage;
						for (var coord in page.sprites) {
							var spriteObj=page.sprites[coord],
								sprite=(spriteObj?spriteObj.sprite-1:-1),
								tilesPerRow=sheetData.tilesPerRow,
								scale=Env.tileScale,
								iy = Math.floor(coord / Env.pageWidth),
								ix = coord % Env.pageWidth,
								sy=Math.max(-1,parseInt(sprite/tilesPerRow)),
								sx=Math.max(-1,sprite%tilesPerRow),
								tileSize = Env.tileSize,
								py=(iy*tileSize+The.camera.offsetY)*scale,
								px=(ix*tileSize-The.camera.offsetX)*scale;
							try {
								if (sy!=-1 && sx!=-1 && sprite && !spriteObj.hasOwnProperty('static')) {
									if (sheetData.floating !== 'undefined' &&
										sheetData.floating.indexOf(sprite) >= 0) {
										floatingSprites.push({
											sprite: sprite,
											sx: sx,
											sy: sy,
											px: px,
											py: py
										});
									} else {
										ctxEntities.drawImage(sheet, tileSize*sx, tileSize*sy, tileSize, tileSize, px, py, scale*tileSize, scale*tileSize);
									}
								}
							} catch(e) {
								console.log("Error!");
							}
						}

						// Draw border
						//	Camera width/height and offset (offset by -border)
						//	Draw ALL neighbours using this algorithm
						//	If no neighbour to left/top then leave offset as 0?
						var neighbours=[],
							tileSize=Env.tileSize,
							pageWidth=Env.pageWidth,
							pageHeight=Env.pageHeight,
							tilesPerRow=sheetData.tilesPerRow,
							offsetY=The.camera.offsetY,
							offsetX=The.camera.offsetX;
						for(var neighbourKey in The.map.curPage.neighbours) {
							var neighbour = The.map.curPage.neighbours[neighbourKey];
							if (!neighbour) continue;

							var neighbourInfo = {};
							neighbourInfo.neighbour = neighbour;
							neighbourInfo.name = neighbourKey;

							if (neighbourKey.indexOf('south')!=-1) {
								neighbourInfo.offsetY = pageHeight*Env.tileSize;
							} else if (neighbourKey.indexOf('north')!=-1) {
								neighbourInfo.offsetY = -pageHeight*Env.tileSize;
							} else {
								neighbourInfo.offsetY = 0;
							}

							if (neighbourKey.indexOf('west')!=-1) {
								neighbourInfo.offsetX = -pageWidth*Env.tileSize;
							} else if (neighbourKey.indexOf('east')!=-1) {
								neighbourInfo.offsetX = pageWidth*Env.tileSize;
							} else {
								neighbourInfo.offsetX = 0;
							}

							neighbours.push(neighbourInfo);
						}


						// Draw sprites
						for(var i=0; i<neighbours.length; ++i) {
							var neighbourInfo = neighbours[i],
								neighbour = neighbourInfo.neighbour,
								offX = neighbourInfo.offsetX,
								offY = neighbourInfo.offsetY;

							for (var coord in neighbour.sprites) {
								var spriteObj=neighbour.sprites[coord],
									sprite=(spriteObj?spriteObj.sprite-1:-1),
									tilesPerRow=20, // TODO: find this: Spritesheet tiles per row
									scale=Env.tileScale,
									iy = Math.floor(coord / Env.pageWidth),
									ix = coord % Env.pageWidth,
									sy=Math.max(-1,parseInt(sprite/tilesPerRow)),
									sx=Math.max(-1,sprite%tilesPerRow),
									tileSize = Env.tileSize,
									py=(iy*tileSize+The.camera.offsetY+offY)*scale,
									px=(ix*tileSize-The.camera.offsetX+offX)*scale;

								try {
									if (sy!=-1 && sx!=-1 && sprite && !spriteObj.hasOwnProperty('static')) {
										if (sheetData.floating !== 'undefined' &&
											sheetData.floating.indexOf(sprite) >= 0) {

											floatingSprites.push({
												sprite: sprite,
												sx: sx,
												sy: sy,
												px: px,
												py: py
											});
										} else {
											ctxEntities.drawImage(sheet, tileSize*sx, tileSize*sy, tileSize, tileSize, px, py, scale*tileSize, scale*tileSize);
										}
									}
								} catch(e) {
									console.log("Error!");
								}
							}

						}

						// Draw Movables
						{
							for (var id in page.movables) {
								var movable = page.movables[id],
									tileSize = movable.sprite.tileSize,
									movableSheet = movable.sprite.sheet.image,
									customSheet = false,
									scale=Env.tileScale,
									offsetY = The.camera.offsetY,
									offsetX = The.camera.offsetX,
									// TODO: fix sprite centering with sheet offset
									movableOffX = movable.sprite.tileSize/4,// - movable.sprite.offset_x, //movable.sprite.tileSize/4, // Center the entity
									movableOffY = movable.sprite.tileSize/2;// - movable.sprite.offset_y; //movable.sprite.tileSize/2;
								if (movable.sprite.state.sheet) {
									customSheet = true;
									movableSheet = movable.sprite.state.sheet.image; // Specific state/animation may require a separate sheet
								}

								ctxEntities.drawImage(
										movableSheet, movable.sprite.state.x, movable.sprite.state.y, movable.sprite.tileSize, movable.sprite.tileSize, scale*(movable.posX-offsetX-movableOffX), scale*(movable.posY+offsetY-movableOffY), scale*movable.sprite.tileSize, scale*movable.sprite.tileSize);
							}
						}


						// draw floating sprites
						for (var i=0; i<floatingSprites.length; ++i) {
							var floatingSprite = floatingSprites[i],
								tileSize = Env.tileSize,
								scale = Env.tileScale,
								sx = floatingSprite.sx,
								sy = floatingSprite.sy,
								px = floatingSprite.px,
								py = floatingSprite.py;
							ctxEntities.drawImage(sheet, tileSize*sx, tileSize*sy, tileSize, tileSize, px, py, scale*tileSize, scale*tileSize);
						}

						// -------------------------------------------------------------------------- //
						// -------------------------------------------------------------------------- //

						// requestAnimationFrame(gameLoop);
						setTimeout(gameLoop, speed);
				};



				// -------------------------------------------------------------------------- //
				// -------------------------------------------------------------------------- //
				//             Server Messaging
				//
				// -------------------------------------------------------------------------- //

				websocket.onmessage = function(evt) {

					// console.log("Message from server: " + evt.data);
					evt=JSON.parse(evt.data);
					if (typeof evt == "String") return;
					if (evt.events) {
						// Received page events from server

						var page = evt.page,
							buffer = JSON.parse(evt.events),
							events = buffer.events;
						console.log("Received events from server..");
						for (var i=0; i<events.length; ++i) {
							var event = JSON.parse(events[i]),
								evtType = event.evtType;
							console.log(event);

							if (evtType == EVT_ADDED_ENTITY) {
								if (event.entity.id == The.player.id) {

								} else {
									var entity = new Movable(event.entity.spriteID, The.map.pages[page]);
									console.log("ADDING Entity: "+event.entity.id);
									entity.id = event.entity.id;
									entity.posY = event.entity.posY;
									entity.posX = event.entity.posX;
									entity.sprite.state = event.entity.state;
									entity.zoning = event.entity.zoning;

									if (event.entity.path) {
										var path = JSON.parse(event.entity.path);
										entity.addPath(path);
									}

									The.map.pages[page].addEntity(entity);
								}
							} else if (evtType == EVT_REMOVED_ENTITY) {
								console.log("REMOVING Entity: "+event.entity.id);

								var page = The.map.pages[page],
									entity = page.movables[event.entity.id];
								delete page.movables[event.entity.id];
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
							} else if (evtType == EVT_PREPARING_WALK) {
								if (event.data.id == The.player.id) {
								} else {
									var entPage = The.map.pages[page],
										entity = entPage.movables[event.data.id],
									    reqState = event.data.state;
									console.log("("+now()+") MOVING ENTITY: "+entity.id);
									console.log(event.data.state);
									console.log(event.data.path);

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

									walk.fromJSON(event.data.path);
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

										console.warn("COULD NOT MOVE ENTITY THROUGH PATH!! Jump entity directly to end");

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
							} else if (evtType == EVT_ATTACKED) {
								var entPage = The.map.pages[event.data.entity.page],
									tarPage = The.map.pages[event.data.target.page],
									entity  = null,
									target  = null;
								if (!entPage) throw UnexpectedError("Could not find page of entity being attack!?");
								entity = entPage.movables[event.data.entity.id];
								if (tarPage) target = tarPage.movables[event.data.target.id];

								// abstract better
								if (entity) entity.hurt(event.data.amount, target);
							} else if (evtType == EVT_ATTACKED_ENTITY) {
								var entPage = The.map.pages[event.data.entity.page],
									tarPage = The.map.pages[event.data.target.page],
									entity  = null,
									target  = null;
								if (!entPage) throw UnexpectedError("Could not find page of entity throwing attack!?");
								entity = entPage.movables[event.data.entity.id];
								if (tarPage) target = tarPage.movables[event.data.target.id];

								// TODO: abstract better

								if (entity && target) {
									// entity.faceDirection(direction);
									var direction = entity.directionOfTarget(target);
									entity.sprite.dirAnimate('atk', direction);
									// entity.sprite.animate('atk_right');
								}
							} else if (evtType == EVT_NEW_TARGET) {
								var entPage = The.map.pages[event.data.entity.page],
									tarPage = The.map.pages[event.data.target.page],
									entity  = null,
									target  = null;
								if (!entPage) throw UnexpectedError("Could not find page of entity in new target!?");
								if (!tarPage) throw UnexpectedError("Could not find page of target in new target!?");
								entity = entPage.movables[event.data.entity.id];
								target = tarPage.movables[event.data.target.id];

								// set core target
								if (entity && target) entity.brain.setTarget(target); // TODO: target could be in another page, when we set new target then this won't actually set; when the target moves to same page as entity then we won't have them as the current target
							} else if (evtType == EVT_REMOVED_TARGET) {
								console.log("Removing target for ["+event.data.entity.id+"]");
								// NOTE: do not select the target since the target may have died and been
								// removed locally
								var entPage = The.map.pages[event.data.entity.page],
									// tarPage = The.map.pages[event.data.target.page],
									entity  = null,
									target  = null;
								if (!entPage) throw UnexpectedError("Could not find page of entity in remove target!?");
								// if (!tarPage) throw UnexpectedError("Could not find page of target in remove target!?");
								if (entity) {
									entity = entPage.movables[event.data.entity.id];
									// target = tarPage.movables[event.data.target.id];

									// remove core target
									if (entity.brain.target && entity.brain.target.id == event.data.target.id) { 
										console.log("	Target to remove ["+event.data.target.id+"] currently targeting: ("+entity.brain.target.id+")");
										entity.brain.setTarget(null);
									}
								}
							} else if (evtType == EVT_DIED) {
								// TODO: set die physical state, die animation, remove entity
								var entity = The.map.pages[page].movables[event.data.entity];
								// NOTE: the entity may have already died if we've already received the killing blow event (client side noticed their health went below 0)
								// TODO: will this ever occur? Do we need to set the dying process somewhere else?
								if (entity) {
									console.error("EVT_DIED OCCURRED!! Make note that this actually happened in main.js");
									console.log(entity);
									entity.triggerEvent(EVT_DIED);
								}
							} else { 
								console.error("	NOT SURE WHAT evt IS!?");
								console.error(evt);
							}
						}

					} else if (evt.id) {
						// Received response from server

						// TODO: if request is not at [0] then check server for responses on earlier requests
						var eventsNode = requestBuffer.archives[0];
						for (var i=0; i<eventsNode.archive.length; ++i) {
							var reqEvent = eventsNode.archive[i];
							if (reqEvent.id == evt.id) {
								if (reqEvent.callback) reqEvent.callback(evt);
								break;
							}
						}
					} else if (evt.zone) {
						// Zoning information (new pages)

						// unload previous pages which are NOT neighbours to this page
						var existingPages = {};
						for (var pageI in The.map.pages) {
							existingPages[pageI] = true;
						}

						for (var pageI in evt.pages) {
							delete existingPages[pageI];

							// TODO: is neighbour?
						}

						for (var pageI in existingPages) {
							// The.map.pages[pageI].unload();
							// delete The.map.pages[pageI];
						}


						for (var pageI in evt.pages) {
							var page = null,
								pageI = parseInt(pageI),
								evtPage = JSON.parse(evt.pages[pageI]),
								pagesPerRow = The.map.pagesPerRow;
							if (!The.map.pages[pageI]) The.map.pages[pageI] = new Page(The.map);
							page = The.map.pages[pageI];

							page.index = pageI;
							if (!isNaN(evtPage.y)) page.y = evtPage.y;
							if (!isNaN(evtPage.x)) page.x = evtPage.x;

							page.tiles = evtPage.tiles;
							page.sprites = evtPage.sprites;
							page.collidables = evtPage.collidables;

							
							if (evtPage.movables) {
								for (var entityID in page.movables) {
									if (entityID == The.player.id) continue;
									page.stopListeningTo(page.movables[entityID]);
									delete page.movables[entityID];
								}

								for (var entityID in evtPage.movables) {
									var movable = evtPage.movables[entityID];
									if (The.map.pages[pageI].movables[entityID]) continue; // incase zoned in as we received this
									if (entityID == The.player.id) {
										// NOTE: we keep track of ourselves locally
									} else {
										var entity = new Movable(movable.spriteID, page);
										console.log("ADDING Entity: "+entityID);
										entity.id           = movable.id;
										entity.posY         = movable.posY;
										entity.posX         = movable.posX;
										entity.sprite.state = movable.state;
										entity.zoning       = movable.zoning;

										if (movable.path) {
											var path = JSON.parse(movable.path);
											entity.addPath(path);
										}

										The.map.pages[pageI].addEntity(entity);
									}

								}
							}


							// figure out neighbours..
							if ((pageI%pagesPerRow)!=0 && The.map.pages[pageI-1]) { // West Neighbour
								page.neighbours.west = The.map.pages[pageI-1];
								page.neighbours.west.neighbours.east = page;
							}

							if (((pageI+1)%pagesPerRow)!=0 && The.map.pages[pageI+1]) { // East Neighbour
								page.neighbours.east = The.map.pages[pageI+1];
								page.neighbours.east.neighbours.west = page;
							}

							if ((pageI-pagesPerRow)>=0 && The.map.pages[pageI-pagesPerRow]) { // North Neighbour
								page.neighbours.north = The.map.pages[pageI-pagesPerRow];
								page.neighbours.north.neighbours.south = page;
							}

							if (The.map.pages[pageI+pagesPerRow]) { // South Neighbour
								page.neighbours.south = The.map.pages[pageI+pagesPerRow];
								page.neighbours.south.neighbours.north = page;
							}

							if (pageI%pagesPerRow!=0 && (pageI-pagesPerRow)>=0 && The.map.pages[pageI-1-pagesPerRow]) { // Northwest Neighbour
								page.neighbours.northwest = The.map.pages[pageI-1-pagesPerRow];
								page.neighbours.northwest.neighbours.southeast = page;
							}

							if (((pageI+1)%pagesPerRow)!=0 && (pageI-pagesPerRow)>=0 && The.map.pages[pageI+1-pagesPerRow]) { // Northeast Neighbour
								page.neighbours.northeast = The.map.pages[pageI+1-pagesPerRow];
								page.neighbours.northeast.neighbours.southwest = page;
							}

							if (((pageI+1)%pagesPerRow)!=0 && The.map.pages[pageI+1+pagesPerRow]) { // Southeast Neighbour
								page.neighbours.southeast = The.map.pages[pageI+1+pagesPerRow];
								page.neighbours.southeast.neighbours.northwest = page;
							}

							if ((pageI%pagesPerRow)!=0 && The.map.pages[pageI-1+pagesPerRow]) { // Southwest Neighbour
								page.neighbours.southwest = The.map.pages[pageI-1+pagesPerRow];
								page.neighbours.southwest.neighbours.northeast = page;
							}


						}
					} else if (evt.zoneMap) {

						var pagesPerRow = evt.map.pagesPerRow;


						The.map = new Map();
						The.map.id = evt.map.id;
						The.map.pagesPerRow = evt.map.pagesPerRow;
						The.map.mapWidth = evt.map.mapWidth;
						The.map.mapHeight = evt.map.mapHeight;
						The.map.sheet = Resources.findSheetFromFile(evt.map.tileset);

						map.copyEventsAndListeners(The.map);
						map.stopAllEventsAndListeners();
						The.player.changeListeners(map, The.map);

						The.player.posY = evt.player.posY;
						The.player.posX = evt.player.posX;

						for (var pageI in evt.pages) {
							var page = new Page(The.map),
								pageI = parseInt(pageI),
								evtPage = JSON.parse(evt.pages[pageI]);
							The.map.pages[pageI] = page;

							page.index = pageI;
							page.y = evtPage.y;
							page.x = evtPage.x;

							page.tiles = evtPage.tiles;
							page.sprites = evtPage.sprites;
							page.collidables = evtPage.collidables;

							if (evtPage.movables) {
								for (var entityID in evtPage.movables) {
									var movable = evtPage.movables[entityID];
									if (The.map.pages[pageI].movables[entityID]) continue; // incase zoned in as we received this
									if (entityID == The.player.id) {

										console.log('creating firefox..');
										The.player.sprite.state = movable.state;
										The.player.posY         = movable.posY;
										The.player.posX         = movable.posX;
										The.player.zoning       = false;
										The.map.pages[pageI].addEntity(The.player);

									} else {
										var entity = new Movable(movable.spriteID, page);
										console.log("ADDING Entity: "+entityID);
										entity.id           = movable.id;
										entity.posY         = movable.posY;
										entity.posX         = movable.posX;
										entity.sprite.state = movable.state;
										entity.zoning       = movable.zoning;

										if (movable.path) {
											var path = JSON.parse(movable.path);
											entity.addPath(path);
										}

										The.map.pages[pageI].addEntity(entity);
									}

								}
							}

							// figure out neighbours..
							if ((pageI%pagesPerRow)!=0 && The.map.pages[pageI-1]) { // West Neighbour
								page.neighbours.west = The.map.pages[pageI-1];
								page.neighbours.west.neighbours.east = page;
							}

							if (((pageI+1)%pagesPerRow)!=0 && The.map.pages[pageI+1]) { // East Neighbour
								page.neighbours.east = The.map.pages[pageI+1];
								page.neighbours.east.neighbours.west = page;
							}

							if ((pageI-pagesPerRow)>=0 && The.map.pages[pageI-pagesPerRow]) { // North Neighbour
								page.neighbours.north = The.map.pages[pageI-pagesPerRow];
								page.neighbours.north.neighbours.south = page;
							}

							if (The.map.pages[pageI+pagesPerRow]) { // South Neighbour
								page.neighbours.south = The.map.pages[pageI+pagesPerRow];
								page.neighbours.south.neighbours.north = page;
							}

							if (pageI%pagesPerRow!=0 && (pageI-pagesPerRow)>=0 && The.map.pages[pageI-1-pagesPerRow]) { // Northwest Neighbour
								page.neighbours.northwest = The.map.pages[pageI-1-pagesPerRow];
								page.neighbours.northwest.neighbours.southeast = page;
							}


							if (((pageI+1)%pagesPerRow)!=0 && (pageI-pagesPerRow)>=0 && The.map.pages[pageI+1-pagesPerRow]) { // Northeast Neighbour
								page.neighbours.northeast = The.map.pages[pageI+1-pagesPerRow];
								page.neighbours.northeast.neighbours.southwest = page;
							}

							if (((pageI+1)%pagesPerRow)!=0 && The.map.pages[pageI+1+pagesPerRow]) { // Southeast Neighbour
								page.neighbours.southeast = The.map.pages[pageI+1+pagesPerRow];
								page.neighbours.southeast.neighbours.northwest = page;
							}

							if ((pageI%pagesPerRow)!=0 && The.map.pages[pageI-1+pagesPerRow]) { // Southwest Neighbour
								page.neighbours.southwest = The.map.pages[pageI-1+pagesPerRow];
								page.neighbours.southwest.neighbours.northeast = page;
							}

								
						}

						The.map.curPage = The.map.pages[evt.player.page];
						map=The.map;
						The.camera.updated=true;
						window['map'] = map;

					}
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

			canvasEntities.addEventListener('mousemove', function(evt) {
				bounds = canvasEntities.getBoundingClientRect();
				var scale = Env.tileScale,
					x     = (evt.clientX - bounds.left)/scale,
					y     = (evt.clientY - bounds.top)/scale,
					xTile = parseInt(x/tileSize),
					yTile = parseInt(y/tileSize);
				activeX = xTile;
				activeY = yTile;

				try {
					tileHover = new Tile(activeY, activeX);

					hoveringEntity = false;
					for (var movableID in The.map.curPage.movables) {
						var movable = The.map.curPage.movables[movableID];
						if (movable.npc.killable) {
							if (movable.playerID) continue;
							if (x >= movable.posX && x <= movable.posX + 32 &&
								y >= movable.posY && y <= movable.posY + 32) {
									// Hovering movable
									hoveringEntity = movable;
									break;
							}
						}
					}

					if (hoveringEntity) {
						canvasEntities.style.cursor = 'crosshair'; // TODO: custom cursors
					} else {
						canvasEntities.style.cursor = '';
					}
				} catch(e) {
					tileHover = null;
				}
			});

			canvasEntities.addEventListener('mousedown', function(evt) {


				if (hoveringEntity) {

					var event = new Event((++requestsId), EVT_ATTACKED, {id:hoveringEntity.id});
					console.log("Sending attack request ["+hoveringEntity.id+"]..");
					serverRequest(event).then(function(){ });
					The.player.brain.setTarget(hoveringEntity);

					return;
				}

				walkToX = activeX + (The.camera.offsetX/tileSize);
				walkToY = activeY - (The.camera.offsetY/tileSize);

				console.log("Mouse clicked (move): ("+walkToY+","+walkToX+")");

				// 	click to move player creates path for player
				var playerY      = The.map.curPage.y * Env.tileSize + The.player.posY,
					playerX      = The.map.curPage.x * Env.tileSize + The.player.posX,
					nearestTiles = The.map.findNearestTiles(playerY, playerX),
					toTile       = The.map.tileFromLocalCoordinates(walkToY, walkToX),
					time         = now(),
					path         = The.map.findPath(nearestTiles, [toTile]);

				if (path) {
					console.log("Path TO: ("+walkToY+","+walkToX+") FROM ("+(The.player.posY/Env.tileSize)+","+(The.player.posX/Env.tileSize)+") / ("+path.start.tile.y+","+path.start.tile.x+")");
					console.group();
					console.log(path);
					if (The.player.brain.target) {
						var event = new Event((++requestsId), EVT_DISTRACTED, {});
						serverRequest(event).then(function(){ });
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

					tilePathHighlight = toTile;

					The.player.addEventListener(EVT_FINISHED_PATH, this, function(player, walk){
						tilePathHighlight = null;
					});
				} else {
					console.log("Bad path :(");
				}
			});

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

			var serverRequest = function(request) {
				return new Promise(function(allow, disallow){
					request.callback = function(response){
						if (response) {
							if (response.success) {
								allow(response);
							} else {
								disallow(response);
							}
						} else {
							// TODO: error?
						}
					};

					websocket.send(request.serialize());
					requestBuffer.addEvent(request);

				});
			};

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
				event = new Event((++requestsId), EVT_PREPARING_WALK, walk.toJSON(), state);
				if (walk.time) event.time = walk.time;
				console.log("Sending path request..");
				console.group();
				console.log(event);
				console.groupEnd();
				serverRequest(event).then(function(){
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
				});

			});

		};
}catch(e){
	printStackTrace();
}
});
