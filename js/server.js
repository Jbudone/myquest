	var requirejs = require('requirejs');

	requirejs.config({
		nodeRequire: require,
		baseUrl: "js",
		paths: {
			"jquery": "//ajax.googleapis.com/ajax/libs/jquery/2.1.0/jquery.min",
			"underscore": "http://underscorejs.org/underscore",
		},
	});

requirejs(['objectmgr','environment','utilities','extensions','keys','event','errors'],function(The,Env,Utils,Ext,Keys,Events,Errors){

	var _ = require('underscore'),
		$ = require('jquery'),
		fs=require('fs'),
		Promise = require('es6-promise').Promise,
		mongo=require('mongodb').MongoClient,
		http = require('http'), // TODO: need this?
		WebSocketServer = require('ws').Server;

	Env = (new Env());
	Env.isServer=true;

	GLOBAL['_']=_;
	GLOBAL['$']=$;
	GLOBAL['Ext']=Ext;
	GLOBAL['Env']=Env;
	GLOBAL['The']=The;
	GLOBAL['Promise']=Promise;

	for(var util in Utils) {
		GLOBAL[util]=Utils[util];
	}

	for(var evtObj in Events) {
		GLOBAL[evtObj]=Events[evtObj];
	}

	for(var err in Errors) {
		GLOBAL[err]=Errors[err];
	} 


	requirejs(['resources','movable','world','map'], function(Resources,Movable,World,Map) {

		var modulesToLoad={},
			ready=false,
			LOADING_RESOURCES=1,
			LOADING_WORLD=2,
			LOADING_FINISHED=3,
			loadingPhase=LOADING_RESOURCES,
			loading=function(module){ modulesToLoad[module]=false; },
			loadWorld=null,
			startGame=null,
			world=null,
			loaded=function(module){
				if (module) {
					console.log("Loaded: "+module);
					delete modulesToLoad[module];
				}
				if (ready && _.size(modulesToLoad)==0) {
					++loadingPhase;
					if (loadingPhase==LOADING_WORLD)    loadWorld();
					if (loadingPhase==LOADING_FINISHED) startGame();
				}
			};

		loading('database');
		mongo.connect('mongodb://127.0.0.1:27017/myquest', function(err, db){
			if (err) {
				console.log(err);
				throw new Error(err);
			}

			GLOBAL['db'] = db;
			loaded('database');
		});

		// Load game resources
		/////////////////////////

		loading('resources');
		fs.readFile('data/resources.json', function(err,res){
			if (err) {
				console.log(err);
				throw new Error("Could not load resources!");
			}
			res = JSON.parse(res);

			// Load Sheets
			for (i=0; i<res.sheets.length; ++i) {
				var sheet = res.sheets[i];
				Resources.addSheet(sheet);
			}

			// Load Sprites
			for (var i=0; i<res.sprites.length; ++i) {
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
		});

		loading('npc_list');
		fs.readFile('data/npc.json', function(err,res){
			if (err) {
				console.log(err);
				throw new Error("Could not load npc list!");
			}
			res = JSON.parse(res).npcs;

			// Load NPC's
			for (var i=0; i<res.length; ++i) {
				var npc = res[i];
				Resources.addNPC(npc);
			}

			loaded('npc_list');
		});


		loading('extensions');
		Ext.ready(Ext.SERVER).then(function(){
			console.log("Loaded extensions..");
			loaded('extensions');
		}, function(){
			// error loading extensions..
			console.log("Error loading extensions..");
			process.exit();
		});

		loadWorld = function() {
			loading('world');
			ready=false;
			fs.readFile('data/world.json', function(err, data){
				if (err) {
					console.log(err);
					process.exit();
					return;
				}

				var json = JSON.parse(data);
				world = new World();
				The.world = world;
				_.each(json.maps, function(mapFile, mapID) {
					loading('map ('+mapID+')');
					fs.readFile('data/'+mapFile, function(err, data) {
						if (err) {
							console.log(err);
							process.exit();
							return;
						}

						var json = JSON.parse(data);
						Resources.addMap(json.MapFile);
						world.addMap(mapID);
						loaded('map ('+mapID+')');
					});
				});
				loaded('world');
			});

			ready=true;
			loaded(); // In case world somehow loaded INSTANTLY fast
		};



	   startGame = function(){

		   var requestBuffer = new BufferQueue(),
			   eventsArchive = new EventsArchive();
			   clients = {},
			   Client=function(client){
				   this.id=null;
				   this.player=null;
				   this.lastActionId=0;
				   this.client=client;
				   this.responseArchive = new EventsArchive();
				   this.pathArchive = new EventsArchive();
				   this.map=null;
				   this.page=null;
			   };

		   console.log('creating firefox..');

		   var exitGame = function(e) {

			   console.log("Stopping Game, saving state");
			   if (e) console.log(e);
			   for (var clientID in clients) {

			   }

			   console.log("Closing database connection");
			   db.close();

			   console.log("Closing server, goodbye.");
			   process.exit();
		   };

		   process.on('exit', exitGame);
		   process.on('SIGINT', exitGame);
		   process.on('uncaughtException', exitGame);

		   http.createServer(function (req, res) {
			   res.setHeader('Content-Type','application/json');
			   res.setHeader('Access-Control-Allow-Origin', 'http://jbud.local');
			   res.setHeader('Access-Control-Allow-Methods','GET,PUT,POST,DELETE');
			   res.writeHead(200);
			   res.end(JSON.stringify({ message:"Hello World\n" }));

		   }).listen(1337, '127.0.0.1');
		   websocket = new WebSocketServer({port:1338});
		   websocket.on('connection', function(client){

			   console.log('websocket connection open');

			   var you = new Client(client),
			       your = you;
			   you.responseArchive.pushArchive();
			   you.pathArchive.pushArchive();

			   client.on('close', function() {

				   requestBuffer.queue({
					   you:you,
					   action: { evtType: EVT_DISCONNECTED }
				   });

				   console.log('websocket connection close');
			   });


			   client.on('message', function(evt) {
				   var evt=JSON.parse(evt);
				   if (!evt) {
					   console.log("			BAD MESSAGE!? Weird..");
					   // TODO: tell client that the message was misunderstood?
					   return;
				   }
				   if (evt.id!=you.lastActionId+1) {
					   console.log("			Sorry user("+you.id+")..we may have missed some of your messages..  "+evt.id+"!="+(you.lastActionId+1));
					   // TODO: tell client we're missing some messages..
					   return;
				   }
				   you.lastActionId++; // note: this may be safer (async) than lastActionId=evt.id


				   if (you.id==null) {
					   if (evt.evtType==EVT_LOGIN) {
						   var id = parseInt(evt.data.id);
						   console.log("User logging in as ["+id+"]");
						   db
							.collection('players')
							.findOne({id:id}, function(err, player) {
								if (err) {
									console.log(err);

									var response = new Response(evt.id);
									response.success = false;
									client.send(response.serialize());
									you.responseArchive.addEvent(response);
								}  else {
									console.log("Successfully found player: ");
									console.log(player);

									your.id = player.id;
									try {
										if (!The.world.maps[player.map]) throw UnexpectedError( "Map ("+player.map+") not found in world!" );
										your.map = The.world.maps[player.map];
									} catch(e) {
										console.log("ERROR! Cannot find map for player ("+player.map+")");
										console.log(e);

										var response = new Response(evt.id);
										response.success = false;
										client.send(response.serialize());
										your.responseArchive.addEvent(response);
										return;
									}
									var playerPosition = your.map.localFromGlobalCoordinates(player.position.y, player.position.x);
									
									your.page = playerPosition.page;
									your.player = new Movable('firefox');
									your.player.playerID = player.id;
									your.player.posY = playerPosition.y*Env.tileSize;
									your.player.posX = playerPosition.x*Env.tileSize;

									clients[your.id]=you;

									your.page.addEntity(your.player);
									your.player.addEventListener(EVT_ZONE, this, function(player, page) {
										console.log("Zoned player from ("+ your.page.index +") to ("+ page.index +")");
										var oldPage = you.page,
											oldNeighbours = {};

										for (var neighbour in oldPage.neighbours) {
											if (oldPage.neighbours[neighbour]) {
												oldNeighbours[oldPage.neighbours[neighbour].index]  = oldPage.neighbours[neighbour];
											}
										}

										your.page = page;
										console.log("	Sending zoned page..");
										var initialization = {
											zone:true,
											pages:{}
										};


										// Send new page & neighbours as necessary
										// If neighbour page was sent previously then don't send again
										initialization.pages[page.index] = page.serialize(PAGE_SERIALIZE_BASE | PAGE_SERIALIZE_MOVABLES);
										for (var neighbour in page.neighbours) {
											var npage = page.neighbours[neighbour];
											if (npage && !oldNeighbours[npage.index] && npage.index != oldPage.index) {
												initialization.pages[npage.index] = npage.serialize(PAGE_SERIALIZE_BASE);
											}
										}

										client.send(JSON.stringify(initialization));
									});
									your.player.addEventListener(EVT_ZONE_OUT, this, function(player, map, page) {
										console.log("Zoned player from ("+your.map.id+") to ["+map.id+"]");
										your.map  = map;
										your.page = page;

										console.log("	Sending zoned map..");
										var initialization = {
											zoneMap:true,
											map:{
												id: your.map.id,
												pagesPerRow: your.map.pagesPerRow,
												mapWidth: your.map.map.properties.width,
												mapHeight: your.map.map.properties.height,
												tileset: your.map.map.properties.tileset,
											},
											player:{
												posY: your.player.posY,
												posX: your.player.posX,
												page: your.page.index
											},
											pages:{}
										}, page = your.page;

										initialization.pages[page.index] = page.serialize(PAGE_SERIALIZE_BASE | PAGE_SERIALIZE_MOVABLES);
										for (var neighbour in page.neighbours) {
											var npage = page.neighbours[neighbour];
											if (npage) initialization.pages[npage.index] = npage.serialize(PAGE_SERIALIZE_BASE);
										}

										client.send(JSON.stringify(initialization));

									});

									var response = new Response(evt.id);
									response.success = true;
									response.login=true;
									response.player = {
										position: player.position,
										playerID: player.id,
										id: your.player.id,
									};
									client.send(response.serialize());
									your.responseArchive.addEvent(response);
								}
							});

					   }

					   return;
				   }


				   if (evt.evtType==EVT_REQUEST_MAP) {

					   console.log("Sending requested map..");
					   var initialization = {
						   initialization:true,
						   map:{
							   id: your.map.id,
							   pagesPerRow: your.map.pagesPerRow,
							   mapWidth: your.map.map.properties.width,
							   mapHeight: your.map.map.properties.height,
							   tileset: your.map.map.properties.tileset,
						   },
						   pages:{}
					   }, page = your.page;

					   initialization.pages[page.index] = page.serialize(PAGE_SERIALIZE_BASE | PAGE_SERIALIZE_MOVABLES);
					   for (var neighbour in page.neighbours) {
						   var npage = page.neighbours[neighbour];
						   if (npage) initialization.pages[npage.index] = npage.serialize(PAGE_SERIALIZE_BASE);
					   }

					   client.send(JSON.stringify(initialization));


				   } else if (evt.evtType==EVT_PREPARING_WALK) {
					   console.log("new message from user.. FROM ("+evt.state.posY+", "+evt.state.posX+") ----> "+evt.data.distance);
					   requestBuffer.queue({
						   you:you,
						   action:evt
					   });
				   }
			   });

		   });
		   console.log('Server running at http://127.0.0.1:1337/');

		   var stepTimer=100,
		   step=function(){
			   time=now();


			   requestBuffer.switch();
			   eventsArchive.pushArchive();

			   var buffer=requestBuffer.read();
			   for (i=0; i<buffer.length; ++i) {

				   console.log("New request");
				   // Check if request & client still here
				   var request=buffer[i];
				   if (!request) continue; 
				   if (!clients[request.you.player.playerID]) continue;

				   // TODO: handle events through a better abstraction structure
				   var you = request.you,
					   your=you,
					   action=null;
				   if (!request) { 
					   console.log("			BAD REQUEST!? Weirdness..");
					   continue;
				   }
				   action=request.action;
				   // console.log("Handling action: ");
				   // console.log(action);

				   if (action.evtType==EVT_PREPARING_WALK) {
					   // New path
					   console.log("EVT_PREPARING_WALK");



					   // 	> create path from request
					   ////////////////////////////////////

					   var path = new Path(),
						   walk = new Walk(),
						   player = your.player,
						   map = your.map,
						   reqState = request.action.state,
						   maxWalk = 6*Env.tileSize;

					   walk.fromJSON(action.data);
					   walk.walked = 0;
					   path.walks.push(walk);

					   if (path.length() > maxWalk) {
						   console.log(path);
						   throw new RangeError("Path longer than maxwalk..");
					   }


					   // 
					   // Check path is safe (no collisions)
					   //
					   ////////////////////////////////////////

					   var start = new Tile(reqState.globalY, reqState.globalX),
						   vert  = (walk.direction == NORTH || walk.direction == SOUTH),
						   positive = (walk.direction == SOUTH || walk.direction == EAST),
						   walked = 0,
						   tiles = [],
						   k     = (vert ? player.posY : player.posX),
						   kT    = (vert ? start.globalY : start.globalX),
						   dist  = walk.distance,
						   safePath = true,
						   nextTile = start;


					   if (!map.isTileInRange(start)) {
						   throw new RangeError("Bad start of path! ("+start.y+","+start.x+")");
					   }

					   k += (vert?your.page.y:your.page.x)*16;
					   console.log("	Checking tile ("+nextTile.y+","+nextTile.x+")");
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
								   console.log("	Checking tile ("+nextTile.y+","+nextTile.x+")");

								   if (!your.map.isTileInRange(nextTile)) {
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
							   y: your.player.posY + your.page.y * Env.tileSize, // NOTE: global real coordinates
							   x: your.player.posX + your.page.x * Env.tileSize,
							   localY: your.player.posY,
							   localX: your.player.posX,
							   globalY: Math.floor(your.player.posY/Env.tileSize) + your.page.y,
							   globalX: Math.floor(your.player.posX/Env.tileSize) + your.page.x },
						   pathState = {
							   y: reqState.y,
							   x: reqState.x,
							   localY: reqState.posY,
							   localX: reqState.posX,
							   globalY: reqState.globalY,
							   globalX: reqState.globalX
						   };

					   if (!safePath) {
						   console.log("Path is not safe for user... cancelling!");

						   var response = new Response(action.id),
						   client   = your.client;
						   response.success = false;
						   response.state = { x: movableState.x, y: movableState.y, posX: movableState.localX, posY: movableSTate.localY };
						   client.send(response.serialize());
						   your.responseArchive.addEvent(response); // TODO: need to pushArchive for client sometimes
						   continue;
					   }

					   var success = map.recalibratePath(movableState, pathState, path, maxWalk);
					   console.log("Found path?");

					   if (success) {

						   // var pathCpy = extendClass({}).with(path);
						   // pathCpy.time = action.time;
						   // pathCpy.state = action.state;
						   // you.pathArchive.addEvent(pathCpy); // TODO: need to pushArchive for path sometimes

						   your.player.path=null;
						   your.player.addPath(path);

						   try {
							   var response = new Response(action.id),
								   client   = your.client;
							   response.success = true;
							   client.send(response.serialize());
							   your.responseArchive.addEvent(response); // TODO: need to pushArchive for client sometimes
						   } catch(e) {
							   console.log("Player not even here..");
						   }
						   continue;
					   } else {

						   try {
							   var response = new Response(action.id),
								   client   = your.client;
							   response.success = false;
							   response.state = { x: movableState.x, y: movableState.y };
							   client.send(response.serialize());
							   your.responseArchive.addEvent(response); // TODO: need to pushArchive for client sometimes
						   } catch(e) {
							   console.log("Player not even here..");
						   }
						   continue;
					   }


					   var response = new Response(action.id),
					   client   = your.client;
					   response.success = false;
					   client.send(response.serialize());
					   your.responseArchive.addEvent(response); // TODO: need to pushArchive for client sometimes
					   continue;

				   } else if (action.evtType == EVT_DISCONNECTED) {

					   console.log("Disconnecting player..");
					   you.player.stopAllEventsAndListeners();

					   var page = you.page;
					   delete page.movables[you.player.id];
					   for (var i=0; i<page.updateList.length; ++i) {
						   if (page.updateList[i].id == you.player.id) {
							   page.updateList.splice(i,1);
							   break;
						   }
					   }

					   page.eventsBuffer.push({
						   evtType: EVT_REMOVED_ENTITY,
						   entity: { id: you.player.id }
					   });

					   console.log("REMOVED PLAYER: "+you.player.playerID);

					   var y = Math.round((you.player.posY + you.page.y*Env.tileSize)/Env.tileSize),
						   x = Math.round((you.player.posX + you.page.x*Env.tileSize)/Env.tileSize),
						   mapID = your.map.id;

					   db
					   .collection('players')
					   .update({id:you.player.playerID}, {"$set": {position:{y:y,x:x}, map:mapID}}, function(err){
						   if (err) console.log(err);
						   console.log("Successfully updated player ("+you.player.playerID+") position.. ("+y+","+x+")");
					   });

					   delete clients[you.id];

				   } else {
					   console.log("			Some strange unheard of event??");
				   }
			   }
			   requestBuffer.clear();


			   // Timestep the world
			   var eventsBuffer = The.world.step(time);
			   for (var clientID in clients) {
				   var client = clients[clientID].client,
				       mapID = clients[clientID].map.id,
					   page = clients[clientID].page.index;
				   if (eventsBuffer[mapID] && eventsBuffer[mapID][page]) {
					   client.send(JSON.stringify({
						   evtType: EVT_PAGE_EVENTS,
						   page: page,
						   events: eventsBuffer[mapID][page]
					   }));
				   }
			   }

			   setTimeout(step, stepTimer);
		   };
		   step();

	   };

	   ready=true;
	   loaded(); // In case resources somehow loaded INSTANTLY fast

	});

});
