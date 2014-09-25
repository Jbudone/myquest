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


	requirejs(['resources','movable','world','map','server/db','loggable','server/player'], function(Resources,Movable,World,Map,DB,Loggable,Player) {
		extendClass(this).with(Loggable);

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
		var db = new DB();
		db.connect().then(function(){
			loaded('database');
		}, function(){
			console.error("Cannot startup server..");
			process.exit();
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
			console.error("Error loading extensions..");
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
			   for (var clientID in players) {
				   var client = players[clientID].client,
					   page   = players[clientID].movable.page.index;
				       mapID  = players[clientID].movable.page.map.id;
				   players[clientID].step(time);
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
