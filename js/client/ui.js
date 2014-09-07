define(['loggable'], function(Loggable){

	var UI = function(){
		extendClass(this).with(Loggable);
		this.setLogGroup('UI');
		this.setLogPrefix('(UI) ');


		this.canvas = null;
		this.onMouseMove = new Function();
		this.onMouseDown = new Function();

		this.tileHover = null;
		this.hoveringEntity = null;

		this.messageBox = null;

		this.updateCursor = function(){
			if (this.hoveringEntity) this.canvas.style.cursor = 'crosshair'; // TODO: custom cursors
			else this.canvas.style.cursor = '';
		};

		this.positionFromMouse = function(mouse){
			var scale  = Env.tileScale,
				bounds = this.canvas.getBoundingClientRect(),
				x      = (mouse.clientX - bounds.left)/scale,
				y      = (mouse.clientY - bounds.top)/scale,
				border = Env.pageBorder;
				tileX  = parseInt(x/Env.tileSize),
				tileY  = parseInt(y/Env.tileSize);

			return { x: tileX, y: tileY, canvasX: x, canvasY: y };
		};
		
		this.initialize = function(canvas){

			this.canvas = canvas;
			this.messageBox = $('#messages');

			var ui = this;

			this.canvas.addEventListener('mousemove', function(evt){
				ui.onMouseMove( ui.positionFromMouse(evt) );
			});

			this.canvas.addEventListener('mousedown', function(evt){
				ui.onMouseDown( ui.positionFromMouse(evt) );
			});
		};

		this.postMessage = function(message, messageType){
			this.messageBox.append( $('<span/>').addClass('message').addClass('message-' + messageType).text(message) );
			this.messageBox[0].scrollTop = this.messageBox.height();
		};

	};

	return UI;
});
