
define(['jquery','resources','movable','map','page','client/camera','keys'], function($,Resources,Movable,Map,Page,Camera,Keys) {


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
		requestBuffer     = new EventsArchive(),
		requestsId        = 0,
		requests          = [], // Requests sent to server
		player = {},
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


			var websocket=null;
			ready=false;
			loading('connection');
			loading('map');
			ready=true;
			loaded();

			//
			websocket = new WebSocket('ws://127.0.0.1:1338/');
			websocket.onopen = function(evt) {
				console.log("Connected to server..");
				loaded('connection');
				console.log(evt);


				loading('player');


				var login = function(id) {
					var event = new Event((++requestsId), EVT_LOGIN, { id: id }, null);
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
					if (evt.login) {

						if (evt.success) {
							console.log("Success logging in!");
							console.log(evt);
							player = evt.player;
							The.player = new Movable('firefox');
							The.player.id   = player.id;

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
							var page = new Page(),
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
										var entity = new Movable(movable.spriteID);
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


						// TODO:
						//
						//
						//	> hover over movable & change icon depending on attributes (killable?)
						//	> click -> move to npc -> kill -> respawn
						//	> state machine (normal -> attacking[target] ;; idle -> walking -> dying -> dead) state manager to manage multiple state machines
						//	> movable attacks when being attacked; follow if not in attack range (across pages, check max. distance [chase range])
						//	> movable dying: animation, corpse, disappear, respawn
						//	> player dying: animation, corpse, respawn -- death message; respawn to safe spot, remove corpse after some time
						//	> movable idle on player zone or die; eventually move back to spawn spot
						//	> experience, level up; level up notification
						//	> regenerate hp
						//	> d/c during combat -- player auto attacks whomever attacks him; wait X time to d/c; on reconnect allow player to connect, already in attack mode
						//	> experience relative to dmg done (what about regeneration? what about healing? what about hit & run? what about too high level?)
						//	> NO experience on kills during d/c; no experience on stairdancing
						//	> aggro K.O.S.
						//
						//
						//	> CLEAN: throw as much as possible; exception handling on ALL potential throwable statements
						//	> CLEAN: sometimes buggy path movement?
						//	> CLEAN: any chance of missing page events after zoning in?
						//	> CLEAN: spam clicking movement lags out the entire game (server should ignore noisy players; client should temporarily ignore input between processing)
						//
						//
						//	
						//
						//
						//
						//
						// 	> application (UI, login, etc.)
						// 	> combat; mob spawning; experience
						// 	> questing; dfa's
						// 	> loot; inv belt; usable items; armour, weapons; amulets/shoes/weapons/armour on sprite
						// 	> testing, logging, fault tolerance, testing server, auto bug reports
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
						//
						//  > TODO: protocol for: archiving paths / events / requests / responses (push archives); map/zones; abstract pathfinding & tiles/positions/distances; efficient path confirmation / recalibration on server; dynamic sprites (path-blocking objects & pushing entities); server path follows player requested paths (eg. avoiding/walking through fire, server path should do the same)
						//
						// 	> testing (grunt/jasmine? simulated lag, simulated players)
						// 	> WebRTC UDP approach ( && archive events)
						// 	> Webworkers for maps/pages on server & Transferable objects
						// 	> Db sharding
						// 	> Caching techniques
						loaded('map');

					}
			}
			window['websocket'] = websocket;

		};

		// Load game resources
		/////////////////////////

		loading('resources');
		$.get('data/resources.json', function(res){
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
		}, 'text').fail(function(reason){
			console.log(reason);
		});

		loading('npc_list');
		$.get('data/npc.json', function(res){
			res = JSON.parse(res).npcs;

			// Load NPC's
			for (var i=0; i<res.length; ++i) {
				var npc = res[i];
				Resources.addNPC(npc);
			}

			loaded('npc_list');
		}, 'text').fail(function(reason){
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
				tilePathHighlight = null,
				activeX           = null,
				activeY           = null,
				walkToX           = null,
				walkToY           = null,
				lineWidth         = 3,
				map               = null;

			camera=The.camera;
			var playerPosition = The.map.localFromGlobalCoordinates(player.position.y, player.position.x);
			The.map.curPage = playerPosition.page;
			// The.player.posY = playerPosition.y*Env.tileSize;
			// The.player.posX = playerPosition.x*Env.tileSize;

			The.map.curPage.addEntity( The.player );
			requestBuffer.pushArchive();

			// Canvas setup
			canvasEntities.width  = (Env.pageWidth+2*Env.pageBorder)*tileSize*Env.tileScale;
			canvasEntities.height = (Env.pageHeight+2*Env.pageBorder)*tileSize*Env.tileScale;
			canvasBackground.width  = (Env.pageWidth+2*Env.pageBorder)*tileSize*Env.tileScale;
			canvasBackground.height = (Env.pageHeight+2*Env.pageBorder)*tileSize*Env.tileScale;
			ctxEntities.webkitImageSmoothingEnabled=false;
			ctxEntities.strokeStyle="#CCCCCC";
			ctxEntities.lineWidth=lineWidth;
			ctxBackground.webkitImageSmoothingEnabled=false;
			ctxBackground.strokeStyle="#CCCCCC";
			ctxBackground.lineWidth=lineWidth;

			// TODO: store objects & sprites better; load from resources properly
			tiles = The.map.sheet.image;
			sprite = Resources.sheets['firefox'].image;

			startGame = function() {
				var speed = 20,
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
									movableOffX = movable.sprite.tileSize/4, // Center the entity
									movableOffY = movable.sprite.tileSize/2;
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
									var entity = new Movable(event.entity.spriteID);
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

								page.stopListeningTo(entity, EVT_FINISHED_WALK);
								page.stopListeningTo(entity, EVT_STEP);
								page.stopListeningTo(entity, EVT_PREPARING_WALK);
							} else if (evtType == EVT_PREPARING_WALK) {
								if (event.data.id == The.player.id) {
								} else {
									var entPage = The.map.pages[page],
										entity = entPage.movables[event.data.id],
									    reqState = event.data.state;
									console.log("MOVING ENTITY: "+entity.id);
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
										maxWalk = 10*Env.tileSize;

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
							if (!The.map.pages[pageI]) The.map.pages[pageI] = new Page();
							page = The.map.pages[pageI];

							page.index = pageI;
							if (!isNaN(evtPage.y)) page.y = evtPage.y;
							if (!isNaN(evtPage.x)) page.x = evtPage.x;

							page.tiles = evtPage.tiles;
							page.sprites = evtPage.sprites;
							page.collidables = evtPage.collidables;

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
							var page = new Page(),
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
										var entity = new Movable(movable.spriteID);
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
					xTile = parseInt((evt.clientX - bounds.left)/(tileSize*scale)),
					yTile = parseInt((evt.clientY - bounds.top) /(tileSize*scale));
				activeX = xTile;
				activeY = yTile;

				try {
					tileHover = new Tile(activeY, activeX);
				} catch(e) {
					tileHover = null;
				}

			});

			canvasEntities.addEventListener('mousedown', function(evt) {
				walkToX = activeX + (The.camera.offsetX/tileSize);
				walkToY = activeY - (The.camera.offsetY/tileSize);

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
});
