
define(function(){

	var Environment=function(cfg){
		this.server=false;
		this.isBot=false;
        this.isTesting=false;

		// Page Border
		// 	Pages which are neighbours will share the same tiles across their borders, with a depth of
		// 	pageBorder. 
		//
		// 	+--------++++--------+  Consider the X| and |X as the same tiles belonging to different
		// 	|        X||X        | pages. The || tile is the zoning point, where anything that walks 
		// 	|        X||X        | on that tile will continue walking (east/west) to the following
		// 	|        X||X        | tile in the neighbour page. 
		// 	|        X||X        |
		// 	+--------++++--------+
		//
		this.pageBorder=1;
		this.pageWidth=30;  // PageWidth/Height include the border
		this.pageHeight=14;

		this.tileSize=16;
		this.invTileSize = 1 / 16;
		this.tileScale=2;
		this.isServer=false;

		this.pageRealWidth  = this.pageWidth * this.tileSize;
		this.pageRealHeight = this.pageHeight * this.tileSize;

		this.chat = {
			maxMessageLength: 140,
			clientTimeBetweenMessages: 500,
			serverTimeBetweenMessages: 400
		};

		this.renderer = {
			drawBorders: true, // Draws page/entity borders (useful for debugging)
		};

		this.assertion = {
			eventListeningDuplicates: true,
		};

		this.game = {
			splitWalkLength: 4, // Walks are split up into individual walks of this length (multiplied by tileSize); mostly a consideration for client/server communication speed and security (players shouldn't be able to tell exactly where other players are planning to go)
			useJPS: false, // Pathfinding: JPS
            usePathPlanner: false, // Pathfinding: Use an external pathfinding library? Currently attempting l1-path-finder, however ran into an issue with its results. Disabled for now
			profile: false, // Enable Profiler
			measureServerMessageTimes: false, // Log the amount of time between each message received from server

			disconnecting: {
				waitTimeToDisconnect: 0, // How long to wait between attempting to disconnecting and actually being disconnected
				dontDisconnectIfBusy: true,   // Disallow disconnecting if user busy (eg. in combat)
            },

            periodicBackupTime: 10000, // Periodic time to backup all players

            client: {
                maxWalkDelay: 6000, // Maximum allowed delay (in ms) to catch up to server's position before giving up and teleporting
            },

            debugPath: {
                pathHistory: 100 // History count of paths for movables
            }
		};

		var testingLocal = true;
		this.connection = {
			local: {
                port:1338,
                testPort:1339,
				websocket: 'ws://127.0.0.1:1338/',
				websocketTest: 'ws://127.0.0.1:1339/',
				http: (typeof location != "undefined" ? location.origin : 'http://myquest.local'), // NOTE: server doesn't need this
                resources: 'data/resources.new.json',
                resourcesTest: 'data/resources.test.json'
			},

			server: {
                port:1338,
				websocket:'ws://54.86.213.238:1338/',
				http: 'http://54.86.213.238',
			}
		};
		this.connection = (testingLocal ? this.connection.local : this.connection.server);

		var logImportant = LOG_CRITICAL | LOG_ERROR | LOG_WARNING,
            logNormal = LOG_INFO | logImportant,
			logVerbose = logNormal | LOG_DEBUG,
			logDefault = logVerbose;
		this.logmask = {
            'AI': (logDefault),
            'Movable': (logDefault),
            'Connection': (logDefault),
            'Renderer': (logDefault),
            'UI': (logDefault),
            'DB': (logDefault),
            'Player': (logDefault),
            'Resources': (logDefault),
            'ScriptMgr': (logDefault | LOG_INFO),
            'Script': (logDefault),
            'User': (logDefault),
            'Game': (logVerbose),
            'Character': (logDefault),
            'Component': (logVerbose),
            'Inventory': (logDefault),
            'AI': (logDefault),
            'Instinct': (logDefault),
            'Combat': (logDefault),
            'Movement': (logDefault),
            'Item': (logDefault),
            'Buff': (logDefault),
            'Interactable': (logDefault),
            'Redis': (logDefault),
            'Pathfinding': (logDefault),
            'Ability': (logDefault),
            'Default': (logDefault),
        };

		this.login = {
			filterUsername: /\w{2,10}/,
			filterPassword: /\w{0,100}/, // Allow 0 length passwords for crazy/lazy people
			filterEmail: /[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?/i, // Found here: http://www.regular-expressions.info/email.html
		};
	};

	return Environment;
});
