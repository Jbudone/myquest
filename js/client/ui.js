
// UI
define(['eventful', 'hookable', 'loggable'], (Eventful, Hookable, Loggable) => {

    const UI = function() {

        extendClass(this).with(Eventful);
        extendClass(this).with(Hookable);
        extendClass(this).with(Loggable);

        this.setLogGroup('UI');
        this.setLogPrefix('UI');

        this.canvas      = null;
        this.onMouseMove = function() {};
        this.onMouseDown = function() {};

        this.tileHover            = null;
        this.hoveringEntity       = null;
        this.hoveringItem         = null;
        this.hoveringInteractable = null;

        this.messageBox = null;

        this.pages  = {};
        this.camera = null;

        const _UI = this;
        this.components = {


            // UI attached to a movable
            // Includes: name, health bar
            MovableUI: function(movable) {

                this.movable = movable;
                this.update = function(fullUpdate) {

                    if (fullUpdate) {
                        this.position.width = this.ui.width();
                        this.position.height = this.ui.height();
                    }

                    const localX = movable.position.global.x % Env.pageRealWidth,
                        localY   = movable.position.global.y % Env.pageRealHeight,
                        width    = this.position.width,
                        height   = this.position.height,
                        left     = Env.tileScale * (
                                        localX + // game left
                                        movable.sprite.tileSize / 4 + // centered UI
                                        -1 * movable.sprite.offset_x + // offset sprite
                                        -1 * _UI.camera.offsetX + // camera offset
                                        (movable.page.x - The.area.curPage.x) * Env.tileSize // page offset
                                    ) + -1 * width / 2, // centered
                        top      = Env.tileScale * (
                                        localY + // game top
                                        -1 * movable.sprite.offset_y + // offset sprite
                                        _UI.camera.offsetY + // camera offset
                                        (movable.page.y - The.area.curPage.y) * Env.tileSize // page offset
                                    ) + movable.sprite.offset_y + // offset sprite
                                    -1 * movable.sprite.tileSize + // sprite size
                                    -1 * height; // floating above head

                    if (Math.abs(left - this.position.left) > 5 ||
                        Math.abs(top - this.position.top) > 5 ||
                        fullUpdate === true) {

                        this.ui.css({
                            left: `${left}px`,
                            top: `${top}px`
                        });

                        this.position.left = left;
                        this.position.top = top;
                    }

                    let health     = 100,
                        realHealth = null;
                    if (this.movable._character) {
                        // In case the movable is loading for the first time, the older character object has
                        // not yet been replaced with the new character, so use the new character parameters
                        // before they're transferred to the new character object
                        realHealth = this.movable._character.health;
                    } else if (this.movable.character) {
                        realHealth = this.movable.character.health;
                    } else {
                        realHealth = 0;
                    }

                    if (this.health !== realHealth || fullUpdate === true) {

                        health = 100 * Math.max(0, realHealth) / this.movable.npc.health;
                        this.ui_healthbar_health.css('width', `${health}%`);
                        this.health = realHealth;
                    }

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
                    .text( movable.name || movable.spriteID )
                    .appendTo( this.ui );
                this.ui_healthbar = $('<div/>')
                    .addClass('movable-healthbar')
                    .appendTo( this.ui );
                this.ui_healthbar_health = $('<div/>')
                    .addClass('movable-health')
                    .appendTo( this.ui_healthbar );
                this.position = { left: null, top: null, width: null, height: null };
                this.health = null;


                $('#canvas').append( this.ui );
                this.update(true);
            }
        };

        this.step = (time) => {
            this.handlePendingEvents();
            if (this.camera.updated) this.updateAllMovables();
        };

        this.updateCursor = () => {
            if (this.hoveringEntity) this.canvas.style.cursor = 'crosshair'; // TODO: custom cursors
            else if (this.hoveringInteractable) this.canvas.style.cursor = 'pointer';
            else this.canvas.style.cursor = '';
        };

        this.positionFromMouse = (mouse) => {
            const scale = Env.tileScale,
                bounds  = this.canvas.getBoundingClientRect(),
                x       = (mouse.clientX - bounds.left) / scale,
                y       = (mouse.clientY - bounds.top) / scale,
                border  = Env.pageBorder,
                tileX   = parseInt(x / Env.tileSize, 10),
                tileY   = parseInt(y / Env.tileSize, 10);

            return { x: tileX, y: tileY, canvasX: x, canvasY: y };
        };

        this.initialize = (canvas) => {

            this.canvas = canvas;
            this.messageBox = $('#messages');

            this.canvas.addEventListener('mousemove', (evt) => {
                this.onMouseMove( this.positionFromMouse(evt) );
            });

            this.canvas.addEventListener('mousedown', (evt) => {
                this.onMouseDown( this.positionFromMouse(evt) );
            });

            this.registerHook('input');
            $('#input').on('input', function() {
                const msg = $(this).val();
                if (!_UI.doHook('input').pre(msg)) return;

                _UI.doHook('input').post(msg);
            });

            this.registerHook('inputSubmit');
            $('#inputForm').on('submit', function(evt) {
                const msg = $('#input').val();
                if (!_UI.doHook('inputSubmit').pre(msg)) return false;

                $('#input').val('');

                _UI.doHook('inputSubmit').post(msg);
                return false;
            });
        };

        this.unload = () => {
            this.canvas.removeEventListener('mousemove');
            this.canvas.removeEventListener('mousedown');
        };

        this.postMessage = (message, messageType) => {
            messageType = messageType || MESSAGE_INFO;
            this.messageBox.append( $('<span/>').addClass('message').addClass('message-' + messageType).text(message) );
            this.messageBox[0].scrollTop = this.messageBox[0].scrollHeight;
        };

        // Movables list
        // NOTE: upon zoning into a new page, EVT_ADDED_ENTITY is triggered for each entity; however, we may
        // have not setPage for the new page just yet (event handling races). So we may or may not retrieve
        // the list of entities through EVT_ADDED_ENTITY of the page. Hence we can load the entities from 2
        // places (the list of movables of the page, and also EVT_ADDED_ENTITY). The list of movables which
        // are currently being listened to can be kept track here to avoid conflicts.
        this.movables = {};

        this.attachMovable = (entity) => {

            const remove = () => {
                if (entity !== The.player) {
                    this.detachMovable(entity);
                } else {
                    this.hideMovable(entity);
                }
            },
            hurt = () => {
                if (!movableDetails.attached) return; // event leftover from before entity was cleared
                movableDetails.ui.update();
            };

            this.movables[entity.id] = {
                entity,
                attached: true,
                ui: new this.components.MovableUI(entity),
                interface: { remove, hurt }
            };
            const movableDetails = this.movables[entity.id];
            entity.ui = movableDetails.interface;

            // NOTE: sometimes events are triggered and stored for callbacks before the another event is triggered which
            // detaches the movable. Hence its necessary for the callbacks here to check if the movable instance still
            // exists

            this.listenTo(entity, EVT_MOVED_TO_NEW_TILE, (entity) => {
                if (!movableDetails.attached) return; // event leftover from before entity was cleared
                movableDetails.ui.update(true);
            });

            this.listenTo(entity, EVT_MOVING_TO_NEW_TILE, (entity) => {
                if (!movableDetails.attached) return; // event leftover from before entity was cleared
                movableDetails.ui.update();
            });

            this.listenTo(entity, EVT_ATTACKED, (entity) => {
                if (!movableDetails.attached) return; // event leftover from before entity was cleared
                movableDetails.ui.update();
            });

            // if (entity != The.player) {
            //  this.listenTo(entity, EVT_DIED, function(entity){
            //      _UI.detachMovable(entity);
            //  });

            //  this.listenTo(entity, EVT_ZONE, function(entity){
            //      _UI.detachMovable(entity);
            //  });
            // } else {
            this.listenTo(entity, EVT_DIED, (entity) => {
                this.hideMovable(entity);
            });
            // }

        };

        this.updateAllMovables = () => {
            for (const movableID in this.movables) {
                const movableDetails = this.movables[movableID];
                if (movableDetails.attached) movableDetails.ui.update();
            }
        };

        this.detachMovable = (entity) => {
            const movableDetails = this.movables[entity.id];
            if (!movableDetails) return;

            movableDetails.attached = false;
            this.stopListeningTo( movableDetails.entity );
            movableDetails.ui.clear();
            delete movableDetails.ui;
            delete this.movables[entity.id];
        };

        this.hideMovable = (entity) => {
            const movableDetails = this.movables[entity.id];
            if (!movableDetails) return;

            movableDetails.ui.hide();
        };

        this.showMovable = (entity) => {
            const movableDetails = this.movables[entity.id];
            if (!movableDetails) return;

            movableDetails.ui.show();
        };

        this.addPage = (pageID) => {
            if (this.pages[pageID]) return;

            // add page to list
            const page = The.area.pages[pageID];
            this.pages[pageID] = page;

            // add all ui from this page
            for (const movableID in page.movables) {
                if (this.movables[movableID]) continue;
                const movable = page.movables[movableID];
                this.attachMovable(movable);
            }

            // NOTE: EVT_ADDED_ENTITY is called on initialization of page for each entity
            this.listenTo(page, EVT_ADDED_ENTITY, (page, entity) => {
                if (this.movables[entity.id]) {
                    this.detachMovable(entity);
                }
                this.attachMovable(entity);
            });

            this.listenTo(page, EVT_REMOVED_ENTITY, (page, entity) => {
                this.detachMovable(entity);
            });
        };

        this.removePage = (pageID) => {
            if (!this.pages[pageID]) return;

            // remove page from list
            const page = this.pages[pageID];
            delete this.pages[pageID];

            // Remove ui stuff
            // FIXME: what if EVT_ADDED_ENTITY or EVT_REMOVED_ENTITY is triggered and the callbacks are
            // stored for later handling before setPage is called for a new page
            this.stopListeningTo(page);

            // NOTE: movables from curPage are probably already removed
            // for (var movableID in page.movables) {
            //  if ( this.movables[movableID] ) continue; // don't remove ui from movable thats in another page
            //  var movable = this.movables[movableID].entity;
            //  this.detachMovable( movable );
            // }
        };

        this.updatePages = () => {

            // Remove unloaded pages
            for (const pageID in this.pages) {
                if (!The.area.pages[pageID]) {
                    this.removePage(pageID);
                }
            }

            // Add missing pages
            for (const pageID in The.area.pages) {
                if (!this.pages[pageID]) {
                    this.addPage(pageID);
                }
            }
        };

        this.clear = () => {

            for (const pageID in this.pages) {
                this.removePage(pageID);
            }

            for (const movableID in this.movables) {
                const movable = this.movables[movableID].entity;
                this.detachMovable(movable);
            }

            this.tilePathHighlight = null;
            this.tileHover = null;
        };

        this.setPage = (page) => { 

            if (this.curPage) {
                // FIXME: what if EVT_ADDED_ENTITY or EVT_REMOVED_ENTITY is triggered and the callbacks are
                // stored for later handling before setPage is called for a new page
                this.stopListeningTo(this.curPage);

                // NOTE: movables from curPage are probably already removed
                for (const movableID in this.movables) {
                    if (page.movables[movableID]) continue; // don't remove ui from movable thats in this page
                    const movable = this.movables[movableID].entity;
                    this.detachMovable(movable);
                }
            }

            this.curPage = page;

            if (page) {

                this.postMessage(`Zoned into page (${page.index})`);

                for (const movableID in page.movables) {
                    if (this.movables[movableID]) continue;
                    const movable = page.movables[movableID];
                    this.attachMovable(movable);
                }

                // NOTE: EVT_ADDED_ENTITY is called on initialization of page for each entity
                this.listenTo(this.curPage, EVT_ADDED_ENTITY, (page, entity) => {
                    if (this.movables[entity.id]) {
                        this.detachMovable(entity);
                    }
                    this.attachMovable(entity);
                });

                this.listenTo(this.curPage, EVT_REMOVED_ENTITY, (page, entity) => {
                    this.detachMovable(entity);
                });
            }
        };

        this.fadeToBlack = () => {
            $('#canvas').animate({ opacity: 0.0 }, 800);
        };

        this.fadeIn = () => {
            $('#canvas').animate({ opacity: 1.0 }, 800);
        };
    };

    return UI;
});
