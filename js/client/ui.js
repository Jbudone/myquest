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
		this.camera  = null;

		var _UI = this;
		this.components = {


			// UI attached to a movable
			// Includes: name, health bar
			MovableUI: function(movable){

				this.movable = movable;
				this.update = function(){
					var left = Env.tileScale * movable.posX + // game left
								Env.tileScale * movable.sprite.tileSize / 2 + // centered UI
								-1 * Env.tileScale * movable.sprite.offset_x + // offset sprite
								-1 * Env.tileScale * _UI.camera.offsetX + // camera offset
								-1 * this.ui.width() + // centered
								$('#game').offset().left, // canvas offset

						top = Env.tileScale * movable.posY + // game top
								movable.sprite.offset_y + // offset sprite
								-1 * Env.tileScale * movable.sprite.offset_y + // offset sprite
								-1 * Env.tileScale * _UI.camera.offsetY + // camera offset
								-1 * this.ui.height() + // floating above head
								$('#game').offset().top; // canvas offset

					this.ui.css('left', left + 'px');
					this.ui.css('top', top + 'px');
				};
				this.clear = function(){
					this.ui.remove();
				};

				this.ui = $('<div/>')
							.addClass('movable-ui');
				this.ui_name = $('<div/>')
									.addClass('movable-name')
									.text( movable.spriteID )
									.appendTo( this.ui );
				this.ui_healthbar = $('<div/>')
										.addClass('movable-healthbar')
										.appendTo( this.ui );
				this.ui_healthbar_health = $('<div/>')
											.addClass('movable-health')
											.appendTo( this.ui_healthbar );


				$('#game').append( this.ui );
				this.update();

			}
		};

		this.step = function(time){
			this.handlePendingEvents();
			if (this.camera.updated) this.updateAllMovables();
		};

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

		// Movables list
		// NOTE: upon zoning into a new page, EVT_ADDED_ENTITY is triggered for each entity; however, we may
		// have not setPage for the new page just yet (event handling races). So we may or may not retrieve
		// the list of entities through EVT_ADDED_ENTITY of the page. Hence we can load the entities from 2
		// places (the list of movables of the page, and also EVT_ADDED_ENTITY). The list of movables which
		// are currently being listened to can be kept track here to avoid conflicts.
		this.movables = {};

		// FIXME: on respawn doesn't remove / re-add entity (listen to death?)
		// FIXME: on move to new page, doesn't ui.update

		this.attachMovable = function(entity){
			this.postMessage("Added entity ("+entity.id+")");
			this.postMessage(entity);

			this.movables[ entity.id ] = {
				entity: entity,
				attached: true,
				ui: new this.components.MovableUI( entity )
			};
			var movableDetails = this.movables[ entity.id ];

			// NOTE: sometimes events are triggered and stored for callbacks before the another event is
			// triggered which detaches the movable. Hence its necessary for the callbacks here to check if
			// the movable instance still exists

			this.listenTo(entity, EVT_MOVED_TO_NEW_TILE, function(entity){
				if (!movableDetails.attached) return; // event leftover from before entity was cleared
				this.postMessage("Entity " + entity.id + " MOVED to new tile..");
				movableDetails.ui.update();
			});

			this.listenTo(entity, EVT_MOVING_TO_NEW_TILE, function(entity){
				if (!movableDetails.attached) return; // event leftover from before entity was cleared
				this.postMessage("Entity " + entity.id + " MOVING to new tile..");
				movableDetails.ui.update();
			});
		};

		this.updateAllMovables = function(){

			for (var movableID in this.movables) {
				var movableDetails = this.movables[ movableID ];
				if (movableDetails.attached) movableDetails.ui.update();
			}

		};

		this.detachMovable = function(entity){
			var movableDetails = this.movables[ entity.id ];
			if (!movableDetails) return;

			movableDetails.attached = false;
			this.stopListeningTo( movableDetails.entity );
			movableDetails.ui.clear();
			delete movableDetails.ui;
			delete this.movables[ entity.id ];
		};

		this.setPage = function(page){ 

			if (this.curPage) {
				// FIXME: what if EVT_ADDED_ENTITY or EVT_REMOVED_ENTITY is triggered and the callbacks are
				// stored for later handling before setPage is called for a new page
				this.stopListeningTo( this.curPage );

				// NOTE: movables from curPage are probably already removed
				for (var movableID in this.movables) {
					if ( page.movables[movableID] ) continue; // don't remove ui from movable thats in this page
					var movable = this.movables[movableID].entity;
					this.detachMovable( movable );
				}
			}
			this.curPage = page;

			if (page) {

				this.postMessage("Zoned into page ("+page.index+")");

				for (var movableID in page.movables) {
					if (this.movables[ movableID ]) continue;
					var movable = page.movables[movableID];
					this.postMessage("Attaching UI to entity ("+movable.id+")");
					this.attachMovable( movable );
				}

				// NOTE: EVT_ADDED_ENTITY is called on initialization of page for each entity
				this.listenTo(this.curPage, EVT_ADDED_ENTITY, function(page, entity){
					if (this.movables[ entity.id ]) {
						this.postMessage("Removed entity first.. ("+entity.id+")");
						this.detachMovable( entity );
					}
					this.postMessage("Adding entity and attaching UI ("+entity.id+")");
					this.attachMovable( entity );
				});

				this.listenTo(this.curPage, EVT_REMOVED_ENTITY, function(page, entity){
					this.postMessage("Removed entity");
					this.detachMovable( entity );
				});
			}
		};

	};

	return UI;
});
