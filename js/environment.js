
define(function(){

	var Environment=function(cfg){
		this.server=false;

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

		var logImportant = LOG_CRITICAL | LOG_ERROR | LOG_WARNING,
			logVerbose = logImportant | LOG_INFO | LOG_DEBUG;
		this.logmask = {
			'AI': (logVerbose),
			'Movable': (logVerbose),
			'Connection': (logVerbose),
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
			'Default': (logVerbose)
		};
	};

	return Environment;
});
