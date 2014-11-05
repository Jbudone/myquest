	var requirejs = require('requirejs');

	requirejs.config({
		nodeRequire: require,
		baseUrl: "js",
		paths: {
			"jquery": "//ajax.googleapis.com/ajax/libs/jquery/2.1.0/jquery.min",
			"underscore": "http://underscorejs.org/underscore",
		},
	});

requirejs(['objectmgr','environment','utilities','extensions','keys','event','errors','fsm'],function(The,Env,Utils,Ext,Keys,Events,Errors,FSM){

	var _ = require('underscore'),
		$ = require('jquery'),
		fs=require('fs'),
		Promise = require('promise'), // TODO: which promise driver is more preferable?
		// Promise = require('es6-promise').Promise,
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

	for(var key in FSM) {
		GLOBAL[key]=FSM[key];
	}
	for(var i=0; i<FSM['states'].length; ++i) {
		GLOBAL[FSM['states'][i]]=i;
	}


	Ext.ready(Ext.SERVER).then(function(){
		loadedEnvironment();
	}, function(){
		// error loading extensions..
		process.exit();
	});

	var loadedEnvironment = function(){

		requirejs(['resources','movable','world','map','server/db','loggable','server/player','scriptmgr'], function(Resources,Movable,World,Map,DB,Loggable,Player,ScriptMgr) {
			extendClass(this).with(Loggable);

			var modulesToLoad={},
				ready=false,
				LOADING_CORE=1,
				LOADING_RESOURCES=2,
				LOADING_SCRIPTS=3,
				LOADING_FINISHED=4,
				loadingPhase=LOADING_CORE,
				loading=function(module){ modulesToLoad[module]=false; },
				loadResources=null,
				startGame=null,
				world=null,
				loaded=function(module){
					if (module) {
						console.log("Loaded: "+module);
						delete modulesToLoad[module];
					}
					if (ready && _.size(modulesToLoad)==0) {
						++loadingPhase;
						if (loadingPhase==LOADING_RESOURCES) loadResources();
						if (loadingPhase==LOADING_SCRIPTS)   loadScripts();
						if (loadingPhase==LOADING_FINISHED)  startGame();
					}
				};

			loading('database');
			var db = new DB();
			db.connect().then(function(){
				loaded('database');
			}, function(){
				console.error("Cannot startup server..");
				process.exit();
			});




			// Load game resources
			/////////////////////////
			loadResources = function(){

				loading('resources');
				Resources = (new Resources());
				GLOBAL['Resources'] = Resources;
				Resources.initialize(['world', 'sheets', 'npcs', 'scripts']).then(function(assets){

					// TODO: include map loading with world
					// TODO: handle sheets, sprites, npcs, world/maps internally in resource mgr



					var res = JSON.parse(assets.sheets);

					var makeSheet = function(_sheet){
						var sheet = {
							file: _sheet.image,
							offset: {
								x: parseInt(_sheet.sheet_offset.x),
								y: parseInt(_sheet.sheet_offset.y),
							},
							tileSize: {
								width: parseInt(_sheet.tilesize),
								height: parseInt(_sheet.tilesize),
							},
							image: null,
							tilesPerRow: parseInt(_sheet.columns),
							data: { }
						};

						return sheet;
					};
					for (var i=0; i<res.tilesheets.list.length; ++i) {
						var _sheet = res.tilesheets.list[i],
						sheet  = makeSheet( _sheet );

						sheet.data.collisions = [];
						for (var j=0; j<_sheet.data.collisions.length; ++j) {
							sheet.data.collisions.push( parseInt( _sheet.data.collisions[j] ) );
						}

						sheet.data.floating = [];
						for (var j=0; j<_sheet.data.floating.length; ++j) {
							sheet.data.floating.push( parseInt( _sheet.data.floating[j] ) );
						}
						Resources.sheets[_sheet.id] = sheet;
					}

					for (var i=0; i<res.spritesheets.list.length; ++i) {
						var _sheet = res.spritesheets.list[i],
							sheet  = makeSheet( _sheet );

						sheet.data.animations = {};
						Resources.sprites[_sheet.id] = sheet;
					}


					// NPCS
					res = JSON.parse(assets.npcs).npcs;

					// Load NPC's
					for (var i=0; i<res.length; ++i) {
						var npc = res[i];
						Resources.npcs[npc.id]=npc;
					}



					// Load World
					var data = assets.world;
					var json = JSON.parse(data),
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

							var json = JSON.parse(data),
								data = json.MapFile;
							Resources.maps[data.Map.id]={
								data:data.Map,
								properties:data.properties
							};
							world.addMap(mapID);
							loaded('map ('+mapID+')');
						});
					});

					loaded('resources');
				}, function(err){
					Log(err);
					throw new Error("Could not load resources!");
				});

			};



			loadScripts = function(){

				loading('scripts');

				// Scripts
				The.scripting.world = The.world;
				Resources.loadScripts(Resources._scriptRes).then(function(){
					delete Resources._scriptRes;
					The.scriptmgr = new ScriptMgr();

					loaded('scripts');
				}, function(){
					console.error("Could not load scripts!");
				});

			};


		   startGame = function(){

			   var requestBuffer = new BufferQueue(),
				   eventsArchive = new EventsArchive();
				   players = {};

			   var exitGame = function(e) {

				   Log("Stopping Game, saving state");
				   if (e) {
					   Log(e, LOG_ERROR);
					   Log(e.stack, LOG_ERROR);
				   }
				   for (var clientID in players) {
					   // TODO: save players & D/C
				   }

				   Log("Closing database connection");
				   db.disconnect();

				   Log("Closing server, goodbye.");
				   process.exit();
			   };

			   process.on('exit', exitGame);
			   process.on('SIGINT', exitGame);
			   process.on('uncaughtException', exitGame);

			   websocket = new WebSocketServer({port:1338});
			   websocket.on('connection', function(client){

				   console.log('websocket connection open');

				   var you  = new Player(client),
					   your = you;

				   you.onDisconnected = function(){
					   return new Promise(function(resolved){
						   requestBuffer.queue({
							   you:you,
							   action: { evtType: EVT_DISCONNECTED }
						   });
						   resolved();
					   });
				   };

				   you.onRequestNewCharacter = function(){
					   return new Promise(function(resolved, failed){
						   db.createNewPlayer({map:'main', position:{y:20, x:14}}).then(function(newID){
							   resolved(newID);
						   }, function(){
							   failed();
						   });
					   });
				   };

				   you.onLogin = function(id){
					   return new Promise(function(resolved, failed){
						   db.loginPlayer(id).then(function(savedState){
							   resolved({
								   savedState: savedState,
								   callback: function(){
									   players[savedState.id] = you;
								   }
							   });
						   }, function(){
							   failed();
						   });
					   });
				   };

				   // TODO: clean this!
				   you.onPreparingToWalk = function(evt){
					   requestBuffer.queue({
						   you:this,
						   action:evt
					   });
				   };
				   you.onSomeEvent = function(evt){
					   requestBuffer.queue({
						   you:this,
						   action:evt
					   });
				   };

			   });
			   Log('Server running at http://127.0.0.1:1337/');

			   var stepTimer=10,
			   step=function(){
				   time=now();


				   requestBuffer.switch();
				   eventsArchive.pushArchive();

				   var buffer=requestBuffer.read();
				   if (buffer.length) {
					   Log("----Reading request buffer----");
				   }
				   for (i=0; i<buffer.length; ++i) {

					   // console.log("New request");
					   // Check if request & client still here
					   var request=buffer[i];
					   if (!request) continue; 
					   if (!players[request.you.id]) continue;

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

						   you.handleWalkRequest(action);

					   } else if (action.evtType == EVT_DISCONNECTED) {

						   var page = you.movable.page;
						   you.disconnectPlayer();
						   page.eventsBuffer.push({
							   evtType: EVT_REMOVED_ENTITY,
							   entity: { id: you.movable.id }
						   });

						   Log("REMOVED PLAYER: "+you.id);
						   db.savePlayer(you.movable);
						   delete players[you.id];

					   } else if (action.evtType == EVT_ATTACKED) {

						   you.attackTarget(action.data.id);

					   } else if (action.evtType == EVT_DISTRACTED) {
						   // TODO: need to confirm same as current target?
						   // you.player.brain.setTarget(null);
						   Log("["+you.movable.id+"] Is Distracted..");
						   you.movable.triggerEvent(EVT_DISTRACTED);
					   } else {
						   console.log("			Some strange unheard of event ("+action.evtType+") ??");
					   }
				   }
				   if (buffer.length) {
					   requestBuffer.clear();
					   console.log("----Cleared request buffer----");
				   }


				   // Timestep the world
				   var eventsBuffer = The.world.step(time);
				   The.scriptmgr.step(time);
				   for (var clientID in players) {
					   var player = players[clientID],
							client = player.client;
					   for (var pageID in player.pages){
						   var page   = pageID;

						   // FIXME: for some reason old pages are still stored in player.pages.. this could
						   // potentially be a BIG problem with bugs laying around the program. Make sure to
						   // check why this is occuring and if its occuring elsewhere too!
						   if (!player.pages[pageID]) {
							   console.log("Bad page:"+pageID);
							   continue;
						   }
						   var mapID  = player.pages[pageID].map.id;
						   players[clientID].step(time);
						   if (eventsBuffer[mapID] && eventsBuffer[mapID][page]) {
							   client.send(JSON.stringify({
								   evtType: EVT_PAGE_EVENTS,
								   page: page,
								   events: eventsBuffer[mapID][page]
							   }));
						   }
					   }
				   }

				   setTimeout(step, stepTimer);
			   };
			   step();

		   };

		   ready=true;
		   loaded(); // In case resources somehow loaded INSTANTLY fast

		});

	};

});
