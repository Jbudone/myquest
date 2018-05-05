				// 		- client/renderer.js: init (pass canvases, camera, area/page, player, spritesheets; set canvas settings); render (render each individual thing); set tileHover, tilePathHighlight
define(['loggable'], function(Loggable){


	var Renderer = function(){
		extendClass(this).with(Loggable);
		this.setLogGroup('Renderer');
		this.setLogPrefix('(Renderer) ');


		this.canvasEntities = null;
		this.canvasBackground = null;
		this.ctxEntities = null;
		this.ctxBackground = null;

		this.camera    = null;
		this.ui        = null;
		this.area      = null;
		this.tilesheet = null;
		this.tilesheets= null;
		
		this.settings  = {
			lineWidth: 3,
			smoothing: false,
			strokeStyle: '#CCCCCC'
		};

		this.setArea = function(area){ };

		this.initialize = function(options){ };
        this.step = function() { };
        this.resume = function() { };
        this.updatePages = function() { };

		this.sheetFromGID = function(gid){ };

		this.render = function(){ };

		this.renderPage = function(page, startX, startY, endX, endY, offX, offY){ };
	};


	return Renderer;

});

