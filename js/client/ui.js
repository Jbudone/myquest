define(['eventful','loggable'], function(Eventful, Loggable){

	var UI = function(){
		extendClass(this).with(Eventful);
		extendClass(this).with(Loggable);
		this.setLogGroup('UI');
		this.setLogPrefix('(UI) ');


		this.canvas = null;
		this.onMouseMove = new Function();
		this.onMouseDown = new Function();

		this.tileHover = null;
		this.hoveringEntity = null;

		this.messageBox = null;

		this.curPage = null;

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
			messageType = messageType || MESSAGE_INFO;
			this.messageBox.append( $('<span/>').addClass('message').addClass('message-' + messageType).text(message) );
			this.messageBox[0].scrollTop = this.messageBox.height();
		};

		this.setPage = function(page){ 

			if (this.curPage) {
				this.stopListeningTo( this.curPage );
			}
			this.curPage = page;

			if (page) {

				for (var movableID in page.movables) {
					var movable = page.movables[movableID];
					this.postMessage("Attaching UI to entity ("+movable.id+")");
				}

				var postMessage = this.postMessage;
				this.curPage.listenTo(page, EVT_ADDED_ENTITY, function(page, entity){
					postMessage("New entity");
					postMessage(entity);
				});

				this.curPage.listenTo(page, EVT_REMOVED_ENTITY, function(page, entity){
					postMessage("Removed entity");
					postMessage(entity);
				});

				this.curPage.listenTo(page, EVT_MOVED_TO_NEW_TILE, function(entity){
					postMessage("Entity " + entity.id + " MOVED to new tile..");
				});

				this.curPage.listenTo(page, EVT_MOVING_TO_NEW_TILE, function(entity){
					postMessage("Entity " + entity.id + " MOVING to new tile..");
				});
			}
		};

		// TODO: hook evt NEW_PAGE
		// TODO: hook evt ADDED_ENTITY, REMOVED_ENTITY
		// TODO: hook evt ENTITY_MOVED

	};

	return UI;
});
