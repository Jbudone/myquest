				// TODO:
				//
				// 	> main.js (refactoring)
				// 		- remove try/catch; return error objects from functions
				// 		- debug.js, client/debug.js, server/debug.js: various debugging things,  window['TheOtherPlayer'] = ...
				// 		- pathfinding.js
				//
				// 	> server.js (refactoring)
				// 		- clean requirejs (should only require once); define?  maybe requirejs inside loading() loaded() ? (breakpoints work immediately)
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
				// 	> BUG: UI slow to update when entity zones out
				//	> BUG: server broadcast player.pages: old pages still stored in their list of pages!?
				//
				//
				//
				//	Bugs (cannot reproduce)
				// 	> BUG: multiplayer connect at different pages: doesn't show the other player, doesn't show NPC dying --- sees wrong player ID for other player
				// 	> BUG: multiplayer combat extremely slow (perhaps client side only w/ console open?)
				//
				//
				//
				//	> Loggable output to file? to UI?
				//	> physical state machine
				//	> player dying: animation, corpse, respawn -- death message; respawn to safe spot, remove corpse after some time
				//	> experience, level up; level up notification
				//	> regenerate hp
				//	> experience relative to dmg done (what about regeneration? what about healing? what about hit & run? what about too high level?)
				//	> NO experience on kills during d/c; no experience on stairdancing
				//	> aggro K.O.S.
				//
				//
				//	> CLEAN: sometimes buggy path movement?
				//	> CLEAN: any chance of missing page events after zoning in?
				//	> CLEAN: spam clicking movement lags out the entire game (server should ignore noisy players; client should temporarily ignore input between processing)
				//	> CLEAN: sometimes bad rendering: the.camera.updated=true fixes it? ..render before loaded?
				//	> CLEAN: clicking to move while zoning (disallow)
				//	> CLEAN: movables not sent if 2 pages away (not in initial page neighbour)
				//	> CLEAN: high CPU usage
				//	> CLEAN: remove server animations; auto client animations (facing target, etc.)
				//	> CLEAN: try/catch (performance)
				//	> CLEAN: functions have to be object properties prototype functions kill performance
				//	> CLEAN: able to handle pauses from client (page not in focus -- delayed timeouts)
				//	> CLEAN: Movable setting params before/after Ext
				//	> CLEAN: multiple target types (NPC, Tile)
				//	> CLEAN: player/NPC moves to edge of new page; they are still able to attack across pages, but this may cause issues for other clients who don't have the other page/movables in memory
				//	> CLEAN: renderer.js, rendering page & sprites & movables; render only visible portion of pages
				//	> CLEAN: for(...){ ... } where functions perform chaining to variables within the for loop (errors)
				//	> CLEAN: resources initialization routine (in client/server resources.js?)
				//	> CLEAN: rendering (set base tile, and sparse sprite/base/items/movables (obj w/ key as coordinate); each tile contains the tile_id and a reference to its sheet)
				//	> CLEAN: convert server tiles to Uint8Array; each references an index of tileRefs which specify the gid; cache and send page data as a blob (for compression/throughput)
				//	> CLEAN: switch from loops to maps/forEach/...
				//	> CLEAN: clean up Promises:   Promse.then(...).then(...).then(...).catch(...)
				//	> CLEAN: switch to ES6 syntax -- https://github.com/lukehoban/es6features http://babeljs.io/docs/learn-es6/
				//	> CLEAN: fix up .call .apply .bind for performance: http://jsperf.com/function-calls-direct-vs-apply-vs-call-vs-bind/6
				//	> CLEAN: temporary movable._character property should be abstracted so that it doesn't
				//				need to be copied in multiple places
				//	> CLEAN: look at better way of hashing tiles (without any precision/collision issues)
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
				//	> sprite offset
				//	> Patches: warn users of upcoming patch -> start countdown -> shutdown & restart & wait for reply from server to start  ;;  bash script to send signal to server after countdown -> shutdown server & load new files -> restart server
				//	> Testing: use various test scripts; server runs test script (each script has the testing environment injected into it, just like the script/scriptmgr), sample shown below: (includes time-since-startup of each event to run). Use test clients to connect to the server too & send input. Allow simulating lag, bad inputs, DNS attacks from users, etc.
				//				0:00:00 - Jasmine( world.maps['main'].movables[1].move(4, NORTH) )
				//				0:04:00 - Jasmine.assert( movable[1].position.y == 4 )
				//
				//  > TODO: protocol for: archiving paths / events / requests / responses (push archives); map/zones; abstract pathfinding & tiles/positions/distances; efficient path confirmation / recalibration on server; dynamic sprites (path-blocking objects & pushing entities); server path follows player requested paths (eg. avoiding/walking through fire, server path should do the same)
				//  > debugger: allow player to run /admin to change to admin status; then /debug enters
				//  			(client) debug mode. Server uses node.js VM, creates a context for the debug
				//  			session. Client UI treats all input as JS for the server, the server sends
				//  			this to the VM and sends all output to the user, which is printed to the UI
				//  > Use node.js clusters for clustering users together (if one user is bad, then transfer
				//  			all other users to a new cluster)
				//  > Split execution into tasks; each task is put on a job list, and then handled by workers
				//  			(child processes? domains?); either pass in environment object to
				//  			process/domain (if possible) OR make tasks self-contained and return answer to
				//  			master for applying. Note: this gets around exception handling issue. We can
				//  			also keep track of changes made to the code, since everything outside of these
				//  			tasks are predictable. We could potentially step backwards, or otherwise start
				//  			at a previous snapshot and step forwards with these records
				//  > render background canvas as ALL neighbour pages; then simply translate the canvas as you
				//  			walk around (NOTE: drawImage on background takes up the most CPU in profiling;
				//  			this would fix that completely)
				//
				// 	> WebRTC UDP approach ( && archive events)
				// 	> Webworkers for maps/pages on server & Transferable objects
				// 	> Db sharding
				// 	> Caching techniques (hot/cold components; cache lines)
				// 	> Mappy: base terrain generator (draws up mountains, water, random flowers/grass/etc.)
				//
				//
				//
				//	TOP PRIORITY
				//		- Chat system
				//		- Account: respawn spot, periodic saving
				//		- XP/Leveling
				//		- Items: hardcoded values (loot chance, loot items, decay rate); inventory (belt?), UI
				//		- UI: game+inventory+character-sheet+chat
				//		- Test: Bot interface; abstract Test base script (allow for easily adding multiple
				//				test scripts); get errors from Bots; run through Grunt; speed time
				//		- Interaction: (talkto) Chat bubble
				//		- Server configs: http://www.jayway.com/2015/04/13/600k-concurrent-websocket-connections-on-aws-using-node-js/
				//
				//	ERRORS
				//		- ALL Files!
				//		- GameError in all player input type stuff
				//		- node: red errors
				//		- unload helpers: automatically keep track of hooks/listeners/etc. and unload all of those
				//		- Safe spot: if entity logs in or respawns to bad tile, relocate to the safe spot instead
				//		- CLEAN: isGameRunning  in window
				//		- Enemy path/chase prediction: when chasing user, don't update from their current tile, update from the tile they're moving to
				//		- Error handling: return Error for game error stuff; throw Error for ANYTHING that goes wrong; but do checking before hand for possibly bad input to return Error. The caller can check for error and throw if necessary (server stuff), or disallow input (client request)
				//		- (client): addUser done multiple times (new character) when player zones, without removing old character
				//		- Uncaught Error: Already watching this entity!map.js:145 Map.watchEntitymap.js:164 Map.addPagesgame.js:474 Game.start.server.onZoneserverHandler.js:80 ServerHandler.connect.server.websocket.onmessage
				//		- Uncaught Error: Entity not a charactergame.js:146 Game.removeCharactergame.js:224 (anonymous function)hookable.js:121 Hook.rebuildHandlers.posthookable.js:286 Hookable.doHook.callPostHookmap.js:219 Map.removeEntitypage.js:40 Page.unloadgame.js:470 Game.start.server.onZoneserverHandler.js:80 ServerHandler.connect.server.websocket.onmessage
				//
				//
				//
				//		- onTileX onTileY map.js:1120
				//		- look into ISSUE WITH PATH... are those still around?
				//		- Finish eventful fixes; fix unloading eventful everywhere
				//		- CHECKME: script.addScript( ... ) had to reference obj._script otherwise it was
				//					creating a new script everytime! Check everywhere for this for safety
				//
				//
				//
				//		- Regen
				//		- Firefox: king sprite
				//		- Items dropped in weird positions
				//		- Enemies get bored after chasing you for too long or getting too far from you; but
				//			should stop in their path and wait a moment before going back to spawn spot
				//		- Combat: D/C
				//		- Respawn position fixed
				//		- Predictive pathfinding
				//
				//
				//		- Uncaught TypeError: Cannot read property 'hurt' of undefinedgame.js:447 server.onEntityHurtserverHandler.js:68 server.websocket.onmessage
				//		- Uncaught TypeError: Cannot read property 'hurt' of undefinedgame.js:447 server.onEntityHurtserverHandler.js:68 server.websocket.onmessage
				//		- Uncaught ReferenceError: player is not definedmap.js:364 Map.recalibratePathgame.js:377 Game.start.server.onEntityWalkingserverHandler.js:67 ServerHandler.connect.server.websocket.onmessage
				//	

				/*
				holy shit
￼<16:27:49> "3wolf919": I just got like 30 errors popping up
￼<16:28:06> "3wolf919": Uncaught TypeError: Cannot read property 'x' of undefinedui.js:39 UI.components.MovableUI.updateui.js:242 UI.updateAllMovablesui.js:101 UI.stepgame.js:235 Game.start.render
￼<16:28:14> "3wolf919": Uncaught TypeError: Cannot read property 'index' of undefinedgame.js:460 Game.start.server.onZoneserverHandler.js:80 ServerHandler.connect.server.websocket.onmessage
￼<16:28:24> "3wolf919": Uncaught TypeError: Cannot read property 'movables' of undefinedgame.js:321 Game.start.server.onEntityWalkingserverHandler.js:67 ServerHandler.connect.server.websocket.onmessage
￼<16:29:13> "3wolf919": Going back to state..game.js:61 (anonymous function)bluebird.min.js:31 nbluebird.min.js:30 e.exports.e._settlePromiseFromHandlerbluebird.min.js:30 e.exports.e._settlePromiseAtbluebird.min.js:30 e.exports.e._settlePromisesbluebird.min.js:29 r._drainQueuebluebird.min.js:29 r._drainQueuesbluebird.min.js:29 drainQueues
￼<16:29:22> "3wolf919": that last one just kinda spammed my console
￼<16:30:01> "3wolf919": yep
￼<16:30:28> "3wolf919": I was fighting goblins and getting them to chase me around
￼<16:30:45> "3wolf919": and now when I try to move I get this game.js:463 Uncaught TypeError: Cannot read property 'y' of undefinedgame.js:463 (anonymous function)hookable.js:121 Hook.rebuildHandlers.posthookable.js:286 Hookable.doHook.callPostHookuser.js:41 User.clickedTilegame.js:710 (anonymous function)ui.js:134 (anonymous function)
￼<16:31:07> "3wolf919": close
*/

define(['resources','client/camera','client/serverHandler','loggable','client/renderer','client/ui','client/user','client/game'], function(Resources,Camera,ServerHandler,Loggable,Renderer,UI,User,Game) {
try{

	extendClass(this).with(Loggable);
	this.setLogPrefix('(main) ');


	var errorInGame = function(e){

		Log(e, LOG_ERROR);
		// FIXME: stop game! unexpected and uncaught error..
	};


	window.errorInGame = errorInGame;


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
		}, retryConnection=function(){

			loadingPhase = LOADING_RESOURCES;
			loaded();
		}, connectToServer=function(){
			// Connect to the server

			server = new ServerHandler();
			var link = Env.connection.websocket;


			server.onDisconnect = function(){
				Log("Disconnected from server..");

				if (window['hasConnected']) {
					// Server D/C'd
					Disconnected("Server has disconnected", "Please try refreshing the page and starting again", "NOTE: it may take a moment for the server to come back online");
				} else {
					Disconnected("Server is not online", "Please try coming back later when the server is back online (it usually takes a few seconds)");
				}


				The.user.unhook(The.player.character.brain.instincts.combat)
				The.user.unhook(game);
				The.user.unhook(Game);
				The.user.unhook(The.user);

				The.user.unload();
				The.map.unload();

				Game.disconnected();
				server.websocket.close();
				delete server.websocket; // FIXME: anything else to do for cleanup?
				delete server;

				// The.UI.unload();
				$('.movable-ui').remove();
				The.UI.unload();
				delete The.UI;
				delete ui;

				// The.renderer.unload();
				delete The.renderer;
				delete renderer;




				// TODO: allow reconnecting..
				//setTimeout(retryConnection, 1000);
			};

			// server.onNewCharacter = function(player){
			// 	Log("Created new character "+player.id);
			// 	var id = player.id;
			// 	localStorage.setItem('id', id);
			// 	server.login(id);
			// };

			var postLoginCallback = new Function();

			server.onLogin = function(player){

				Log("Logged in as player "+player.id);

				ready = false;
				loaded('player');

				postLoginCallback();
				Game.loadedPlayer(player);

				Log("Requesting map..");
				server.requestMap();
				loading('map');
				ready = true;
			};


			server.onLoginFailed = function(evt){
				postLoginCallback(evt);
			};
			
			server.onInitialization = function(evt){

				The.camera = new Camera();
				Game.initialize(evt, server);
				loaded('map');

			};


			server.connect(link).then(function(){
				// Connected


				window['Login'] = function(username, password, callback){
					server.login(username, password);
					postLoginCallback = callback;
				};

				if (window['hasConnected']) {
					Login(hasConnected.username, hasConnected.password, function(err){
						hideDisconnected();
					});
				}

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
			Resources.initialize(['sheets', 'npcs', 'items', 'interactables', 'scripts']).then(function(assets){
				loaded('resources');
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

			var ui       = new UI(),
				renderer = new Renderer();
			The.UI   = ui;
			User.initialize();
			The.user = User;
			Game.start(ui, renderer);
		};


}catch(e){
	console.error(e.stack);
	printStackTrace();
}
});
