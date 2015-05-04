
define(function(){

	var Environment=function(cfg){
		this.server=false;
		this.isBot=false;

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
		this.tileScale=2;
		this.isServer=false;

		this.chat = {
			maxMessageLength: 140,
			clientTimeBetweenMessages: 500,
			serverTimeBetweenMessages: 400
		};

		this.renderer = {
			drawBorders: true, // Draws page borders (useful for debugging)
		};

		var testingLocal = true;
		this.connection = {
			local: {
				websocket: 'ws://127.0.0.1:1338/',
				http: (typeof location != "undefined" ? location.origin : ''), // NOTE: server doesn't need this
			},

			server: {
				websocket:'ws://54.86.213.238:1338/',
				http: 'http://54.86.213.238',
			}
		};
		this.connection = (testingLocal ? this.connection.local : this.connection.server);

		var logImportant = LOG_CRITICAL | LOG_ERROR | LOG_WARNING,
			logVerbose = logImportant | LOG_INFO | LOG_DEBUG;
		this.logmask = {
			'AI': (logVerbose),
			'Movable': (logVerbose),
			'Connection': (logImportant),
			'Renderer': (logVerbose),
			'UI': (logVerbose),
			'DB': (logVerbose),
			'Player': (logImportant | LOG_INFO),
			'Resources': (logVerbose),
			'ScriptMgr': (logVerbose),
			'Script': (logVerbose),
			'User': (logVerbose),
			'Game': (logVerbose),
			'Character': (logVerbose),
			'AI': (logVerbose),
			'Instinct': (logVerbose),
			'Combat': (logVerbose),
			'Movement': (logVerbose),
			'Item': (logVerbose),
			'Interactable': (logVerbose),
			'Redis': (logVerbose),
			'Default': (logVerbose)
		};

		this.login = {
			filterUsername: /\w{2,10}/,
			filterPassword: /\w{0,100}/, // Allow 0 length passwords for crazy/lazy people
			filterEmail: /[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?/i, // Found here: http://www.regular-expressions.info/email.html
		};
	};

	return Environment;
});
