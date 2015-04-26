define(['eventful','hookable','loggable'], function(Eventful, Hookable, Loggable){

	var UI = function(){
		extendClass(this).with(Eventful);
		extendClass(this).with(Hookable);
		extendClass(this).with(Loggable);
		this.setLogGroup('UI');
		this.setLogPrefix('(UI) ');


		this.canvas = null;
		this.onMouseMove = new Function();
		this.onMouseDown = new Function();

		this.tileHover = null;
		this.hoveringEntity = null;
		this.hoveringItem = null;
		this.hoveringInteractable = null;

		this.messageBox = null;

		this.pages = {};
		this.camera  = null;

		var _UI = this;
		this.components = {


			// UI attached to a movable
			// Includes: name, health bar
			MovableUI: function(movable){

				this.movable = movable;
				this.update = function(){
					var left = Env.tileScale * movable.position.local.x + // game left
								Env.tileScale * movable.sprite.tileSize / 2 + // centered UI
								-1 * Env.tileScale * movable.sprite.offset_x + // offset sprite
								-1 * Env.tileScale * _UI.camera.offsetX + // camera offset
								1 * Env.tileScale * (movable.page.x - The.map.curPage.x) * Env.tileSize + // page offset
								-1 * this.ui.width() + // centered
								$('#game').offset().left, // canvas offset

						top = Env.tileScale * movable.position.local.y + // game top
								movable.sprite.offset_y + // offset sprite
								-1 * Env.tileScale * movable.sprite.offset_y + // offset sprite
								1 * Env.tileScale * _UI.camera.offsetY + // camera offset
								1 * Env.tileScale * (movable.page.y - The.map.curPage.y) * Env.tileSize + // page offset
								-1 * this.ui.height() + // floating above head
								$('#game').offset().top; // canvas offset

					this.ui.css('left', left + 'px');
					this.ui.css('top', top + 'px');

					var health = 100;
					if (this.movable.hasOwnProperty('character')) {
						health = 100 * Math.max(0, this.movable.character.health) / this.movable.npc.health;
					}
					this.ui_healthbar_health.css('width', health + '%');
				};
				this.clear = function(){
					this.ui.remove();
				};
				this.hide = function(){
					this.ui.hide();
				};
				this.show = function(){
					this.ui.show();
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


				$('#canvas').append( this.ui );
				this.update();

			}
		};

		this.step = function(time){
			this.handlePendingEvents();
			if (this.camera.updated) this.updateAllMovables();
		};

		this.updateCursor = function(){
			if (this.hoveringEntity) this.canvas.style.cursor = 'crosshair'; // TODO: custom cursors
			else if (this.hoveringInteractable) this.canvas.style.cursor = 'pointer';
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

			var that = this;
			this.registerHook('input')
			$('#input').on('input', function(){
				var msg = $(this).val();
				if (!that.doHook('input').pre(msg)) return;

				console.log("Message: "+msg);

				that.doHook('input').post(msg);
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

		this.attachMovable = function(entity){

			var remove = function(){
					if (entity != The.player) {
						_UI.detachMovable(entity);
					} else {
						_UI.hideMovable(entity);
					}
			},  hurt = function(){
					if (!movableDetails.attached) return; // event leftover from before entity was cleared
					movableDetails.ui.update();
			};

			this.movables[ entity.id ] = {
				entity: entity,
				attached: true,
				ui: new this.components.MovableUI( entity ),
				interface: {
					remove: remove,
					hurt: hurt
				}
			};
			var movableDetails = this.movables[ entity.id ];
			entity.ui = movableDetails.interface;

			// NOTE: sometimes events are triggered and stored for callbacks before the another event is
			// triggered which detaches the movable. Hence its necessary for the callbacks here to check if
			// the movable instance still exists

			this.listenTo(entity, EVT_MOVED_TO_NEW_TILE, function(entity){
				if (!movableDetails.attached) return; // event leftover from before entity was cleared
				movableDetails.ui.update();
			});

			this.listenTo(entity, EVT_MOVING_TO_NEW_TILE, function(entity){
				if (!movableDetails.attached) return; // event leftover from before entity was cleared
				movableDetails.ui.update();
			});

			this.listenTo(entity, EVT_ATTACKED, function(entity){
				if (!movableDetails.attached) return; // event leftover from before entity was cleared
				movableDetails.ui.update();
			});

			if (entity != The.player) {
				this.listenTo(entity, EVT_DIED, function(entity){
					_UI.detachMovable(entity);
				});

				this.listenTo(entity, EVT_ZONE, function(entity){
					_UI.detachMovable(entity);
				});
			} else {
				this.listenTo(entity, EVT_DIED, function(entity){
					_UI.hideMovable(entity);
				});
			}

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

		this.hideMovable = function(entity){
			var movableDetails = this.movables[ entity.id ];
			if (!movableDetails) return;

			movableDetails.ui.hide();
		};

		this.showMovable = function(entity){
			var movableDetails = this.movables[ entity.id ];
			if (!movableDetails) return;

			movableDetails.ui.show();
		};

		this.addPage = function(pageID){
			if (this.pages[pageID]) return;

			// add page to list
			var page = The.map.pages[pageID];
			this.pages[pageID] = page;

			// add all ui from this page
			for (var movableID in page.movables) {
				if (this.movables[ movableID ]) continue;
				var movable = page.movables[movableID];
				this.attachMovable( movable );
			}

			// NOTE: EVT_ADDED_ENTITY is called on initialization of page for each entity
			this.listenTo(page, EVT_ADDED_ENTITY, function(page, entity){
				if (this.movables[ entity.id ]) {
					this.detachMovable( entity );
				}
				this.attachMovable( entity );
			});

			this.listenTo(page, EVT_REMOVED_ENTITY, function(page, entity){
				this.detachMovable( entity );
			});
		};

		this.removePage = function(pageID){
			if (!this.pages[pageID]) return;

			// remove page from list
			var page = this.pages[pageID];
			delete this.pages[pageID];

			// Remove ui stuff
			// FIXME: what if EVT_ADDED_ENTITY or EVT_REMOVED_ENTITY is triggered and the callbacks are
			// stored for later handling before setPage is called for a new page
			this.stopListeningTo( page );

			// NOTE: movables from curPage are probably already removed
			// for (var movableID in page.movables) {
			// 	if ( this.movables[movableID] ) continue; // don't remove ui from movable thats in another page
			// 	var movable = this.movables[movableID].entity;
			// 	this.detachMovable( movable );
			// }
		};

		this.updatePages = function(){

			// Remove unloaded pages
			for (var pageID in this.pages) {
				if (!The.map.pages[pageID]) {
					this.removePage(pageID);
				}
			}

			// Add missing pages
			for (var pageID in The.map.pages) {
				if (!this.pages[pageID]) {
					this.addPage(pageID);
				}
			}
		};

		this.clear = function(){

			for (var pageID in this.pages) {
				this.removePage(pageID);
			}

			for (var movableID in this.movables) {
				var movable = this.movables[movableID].entity;
				this.detachMovable( movable );
			}
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
					this.attachMovable( movable );
				}

				// NOTE: EVT_ADDED_ENTITY is called on initialization of page for each entity
				this.listenTo(this.curPage, EVT_ADDED_ENTITY, function(page, entity){
					if (this.movables[ entity.id ]) {
						this.detachMovable( entity );
					}
					this.attachMovable( entity );
				});

				this.listenTo(this.curPage, EVT_REMOVED_ENTITY, function(page, entity){
					this.detachMovable( entity );
				});
			}
		};

		this.fadeToBlack = function(){
			$('#canvas').animate({ opacity: 0.0 }, 800);
		};

		this.fadeIn = function(){
			$('#canvas').animate({ opacity: 1.0 }, 800);
		};

	};

	return UI;
});
