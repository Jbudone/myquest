// var domain = require('domain');
// var d = domain.create();
// 
// d.on('error', function(e){
// 	console.log('Domain Error: '+e.message);
// 	console.trace();
// });
// 
// d.run(function(){

	var requirejs = require('requirejs');

	requirejs.config({
		nodeRequire: require,
		baseUrl: "js",
		paths: {
			"jquery": "//ajax.googleapis.com/ajax/libs/jquery/2.1.0/jquery.min",
			"underscore": "http://underscorejs.org/underscore",
		},
	});



	var couldNotStartup = function(e){
	   console.log("Could not startup server");
	   if (e) {
		   console.log(e);
		   console.log(e.stack);
	   }
	   process.exit();
	};

	process.on('exit', couldNotStartup);
	process.on('SIGINT', couldNotStartup);
	process.on('uncaughtException', couldNotStartup);


requirejs(['objectmgr','environment','utilities','extensions','keys','event','errors','fsm'],function(The,Env,Utils,Ext,Keys,Events,Errors,FSM){

	var _               = require('underscore'),
		$               = require('jquery'),
		fs              = require('fs'),
		Promise         = require('bluebird'),
		http            = require('http'),
		WebSocketServer = require('ws').Server,
		chalk           = require('chalk');

	Promise.longStackTraces();

	Env = (new Env());
	Env.isServer=true;

	GLOBAL['_']=_;
	GLOBAL['$']=$;
	GLOBAL['Ext']=Ext;
	GLOBAL['Env']=Env;
	GLOBAL['The']=The;
	GLOBAL['Promise']=Promise;
	GLOBAL['chalk']=chalk;

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

	errorInGame = function(e){
		console.error(chalk.red(e));
		process.exit();
	};

	GLOBAL.errorInGame = errorInGame;


	var loadedEnvironment = function(){

		requirejs(['resources','movable','world','map','server/db','server/redis','loggable','server/player','scriptmgr','server/login'], function(Resources,Movable,World,Map,DB,Redis,Loggable,Player,ScriptMgr,LoginHandler) {
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


			loading('redis');
			var redis = new Redis();
			redis.initialize();
			redis.onError = function(err){
				console.error("Error w/ Redis: "+err);
				console.error("Cannot startup server..");
				process.exit();
			};
			loaded('redis');


			// Load game resources
			/////////////////////////
			loadResources = function(){

				loading('resources');
				Resources = (new Resources());
				GLOBAL['Resources'] = Resources;
				Resources.initialize(['world', 'sheets', 'npcs', 'items', 'interactables', 'scripts']).then(function(assets){

					// Load World
					var data = assets.world,
						json = JSON.parse(data),
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
					Log(err, LOG_ERROR);
					errorInGame("Could not load resources");
				}).catch(Error, errorInGame);

			};



			loadScripts = function(){

				loading('scripts');

				// Scripts
				The.scripting.world = The.world;
				The.scripting.redis = redis;
				Resources.loadScripts(Resources._scriptRes).then(function(){
					console.log("Starting script manager..");
					delete Resources._scriptRes;
					The.scriptmgr = new ScriptMgr();

					if (Resources.items.hasOwnProperty('items-not-loaded')) {
						delete Resources.items['items-not-loaded'];
						loading('items');
						Resources.loadItemScripts().then(function(){
							loaded('items');
						}, function(err){ errorInGame(err); })
						.catch(Error, errorInGame);
					}

					if (Resources.interactables.hasOwnProperty('interactables-not-loaded')) {
						delete Resources.interactables['interactables-not-loaded'];
						loading('interactables');
						Resources.loadInteractableScripts().then(function(){
							loaded('interactables');
						}, function(err){ errorInGame(err); })
						.catch(Error, errorInGame);
					}

					loaded('scripts');
				}, function(e){
					console.error("Could not load scripts!");
					console.error(e);
				}).catch(Error, errorInGame);

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

			   GLOBAL.exitGame = exitGame;

			   process.on('exit', exitGame);
			   process.on('SIGINT', exitGame);
			   process.on('uncaughtException', exitGame);


			   errorInGame = function(e){

				   try {
					   if (_.isError(e)) {
						   console.error(e.message);
						   console.trace();
					   } else if (_.isString(e)) {
						   console.error(e);
						   console.trace();
					   } else {
						   console.trace();
					   }
				   } catch(e){ }
				   exitGame(e);
			   };

			   GLOBAL.errorInGame = errorInGame;


			   // change redis error handling to use errorInGame instead
			   redis.onError = function(err){
				   console.error("Error w/ Redis: "+err);
				   console.error("Cannot startup server..");
				   errorInGame(err);
			   };

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
					   /*
					   return new Promise(function(resolved, failed){
						   db.createNewPlayer({map:'main', position:{y:60, x:53}}).then(function(newID){
							   resolved(newID);
						   }, function(){
							   failed();
						   })
							.catch(Error, function(e){ errorInGame(e); })
							.error(function(e){ errorInGame(e); });
					   });
					   */
				   };

				   you.onLogin = function(username, password){
					   return new Promise(function(resolved, failed){
						   db.loginPlayer(username, password).then(function(savedState){

							   // Are you already online?
							   for (var clientID in players) {
								   var player = players[clientID],
									   client = player.client;
								   if (player.movable.name == username) {

									   // Are you in a connected state?
									   if (client.readyState !== 1) {
										   // FIXME: SOMETHING WEIRD HAPPENED TO THIS USER!
										   // User must have d/c'd without being cleaned up somehow.. Should
										   // d/c existing user and login this user
										   console.error("USER IS ALREADY CONNECTED BUT ALSO DISCONNECTED!?");
									   }

									   failed('Already connected!');
									   return;
								   }
							   }

							   // User is not online already..safe to connect
							   resolved({
								   savedState: savedState,
								   callback: function(){
									   players[savedState.id] = you;
								   }
							   });
						   }, function(err){
							   failed(err);
						   })
							.catch(Error, function(e){ errorInGame(e); })
							.error(function(e){ errorInGame(e); });
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

			   // Listen for login/register related requests
			   var loginHandler = new LoginHandler(http, db);

			   var stepTimer=30,
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
						   page.map.removeEntity( you.movable );
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
					   if (client.readyState !== 1) continue; // Not open (probably in the middle of d/c)
						player.step(time);
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
						   if (eventsBuffer[mapID] && eventsBuffer[mapID][page]) {
							   client.send(JSON.stringify({
								   evtType: EVT_PAGE_EVENTS,
								   page: page,
								   events: eventsBuffer[mapID][page]
							   }));
						   }
					   }

					   // FIXME: find a better protocol for this.. need to send the player the last updates
					   // from the page since they died, but need to immediately remove players pages
					   // afterwards
					   if (player.movable.character.alive == false) {
						   player.pages = {};
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
// });
