	var requirejs = require('requirejs');

	requirejs.config({
		nodeRequire: require,
		baseUrl: "js",
		paths: {
			//"jquery": "//ajax.googleapis.com/ajax/libs/jquery/2.1.0/jquery.min",
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

	var _ = require('underscore'),
		$ = require('jquery')(require("jsdom").jsdom().parentWindow),
		fs=require('fs'),
		Promise = require('bluebird'),
		http = require('http'), // TODO: need this?
		WebSocket = require('ws'),
		chalk = require('chalk');

	$.support.cors = true;
	Promise.longStackTraces();

	Env = (new Env());
	Env.isServer=false;
	Env.isBot=true;

	GLOBAL['window'] = GLOBAL;

	GLOBAL['_']=_;
	GLOBAL['$']=$;
	GLOBAL['Ext']=Ext;
	GLOBAL['Env']=Env;
	GLOBAL['The']=The;
	GLOBAL['Promise']=Promise;
	GLOBAL['chalk']=chalk;
	GLOBAL['WebSocket']=WebSocket;
	GLOBAL['fs']=fs;


	for(var util in Utils) {
		window[util]=Utils[util];
	}

	for(var evtObj in Events) {
		window[evtObj]=Events[evtObj];
	}

	for(var err in Errors) {
		window[err]=Errors[err];
	}

	for(var key in FSM) {
		window[key]=FSM[key];
	}
	for(var i=0; i<FSM['states'].length; ++i) {
		window[FSM['states'][i]]=i;
	}


	var errorInGame = function(e){

		Log(e, LOG_ERROR);
		// FIXME: stop game! unexpected and uncaught error..
	};


	window.errorInGame = errorInGame;


	requirejs(['keys','resources','client/camera','client/serverHandler','loggable','test/pseudoRenderer','test/pseudoUI','client/user','client/game'], function(Keys, Resources, Camera, ServerHandler, Loggable, PseudoRenderer, PseudoUI, User, Game) {

		extendClass(this).with(Loggable);
		this.setLogPrefix('(main) ');



		try {

	// ----------------------------------------------------------------------------------------- //
	// ----------------------------------------------------------------------------------------- //
	// ----------------------------------------------------------------------------------------- //
	// ----------------------------------------------------------------------------------------- //

	var modulesToLoad          = {},
		ready                  = false,
		LOADING_CORE           = 1,
		LOADING_RESOURCES      = 2,
		LOADING_CONNECTION     = 3,
		LOADING_INITIALIZATION = 4,
		LOADING_FINISHED       = 5,
		loadingPhase           = LOADING_CORE,
		loading                = function(module){ modulesToLoad[module] = false; },
		initializeGame         = null,
		startGame              = null,
		player                 = {},
		server                 = null,
		renderer               = null,
		ui                     = null,
		listenToPlayer         = null,
		loaded=function(module){
			if (module) {
				console.log("Loaded: "+module);
				delete modulesToLoad[module];
			}
			if (ready && _.size(modulesToLoad)==0) {
				++loadingPhase;
				if (loadingPhase==LOADING_RESOURCES) loadResources();
				else if (loadingPhase==LOADING_CONNECTION) connectToServer();
				else if (loadingPhase==LOADING_INITIALIZATION) initializeGame();
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
				Game.disconnected();
			};

			server.onNewCharacter = function(player){
				Log("Created new character "+player.id);
				var id = player.id;
				//localStorage.setItem('id', id);
				server.login(id);
			};

			server.onLogin = function(player){

				Log("Logged in as player "+player.id);

				ready = false;
				loaded('player');

				Game.loadedPlayer(player);

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

				The.camera = new Camera();
				Game.initialize(evt, server);
				loaded('map');

			};


			server.connect(link).then(function(){
				// Connected

				// FIXME: interface to connect w/ id OR create new
				// Attempt to login under id from localStorage (if none then creates new character)
				var id = 2;//localStorage.getItem('id');
				server.login(id);
			}, function(evt){
				console.error(evt);
			})
			.catch(Error, function(e){ errorInGame(e); })
			.error(function(e){ errorInGame(e); });

		};

		// Load game resources
		/////////////////////////

		loadResources = function(){
			loading('resources');

			Resources = (new Resources());
			window['Resources'] = Resources;
			// FIXME: initialize with array of resources? Shouldn't this be apart of client/server specific Resources.js?
			Resources.initialize(['sheets', 'npcs', 'items', 'interactables', 'scripts']).then(function(assets){
				loaded('resources');
			}, function(err){
				console.log("ERR");
				console.log(err);
				errorInGame(err);
			})
			.catch(Error, function(e){ errorInGame(e); })
			.error(function(e){ errorInGame(e); });
		};



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

			var ui       = new PseudoUI(),
				renderer = new PseudoRenderer();
			The.user = User;
			Game.start(ui, renderer);
		};
		}catch(e){
			console.error(e.stack);
			printStackTrace();
		}
	});
});
