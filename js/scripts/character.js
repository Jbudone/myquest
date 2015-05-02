define(['SCRIPTENV', 'scripts/character.ai', 'eventful', 'hookable', 'loggable'], function(SCRIPTENV, AI, Eventful, Hookable, Loggable){

	eval(SCRIPTENV);

	var Character = function(game, entity){
		extendClass(this).with(Eventful);
		extendClass(this).with(Hookable);
		extendClass(this).with(Loggable);
		this.setLogGroup('Character');

		this._instincts = ['movement', 'combat', 'boredom'];

		this.entity = entity;
		this.brain = null;
		entity.character = this;
		this._script = null;

		this.setLogPrefix('[char:'+this.entity.id+'] ');

		this.isPlayer = (entity.hasOwnProperty('playerID') ? true : false);
		this.delta = 0;

		// FIXME: get these stats from npc
		if (!_.isFinite(entity.npc.health) || entity.npc.health <= 0) throw new Error("Bad health for NPC");
		this.health = entity.npc.health;
		this.alive  = true;
		this.respawnTime = null;
		this.respawnPoint = {
			map: entity.page.map.id,
			page: entity.page.index,

			y: entity.position.local.y,
			x: entity.position.local.x,
		};

			// Get hurt by some amount, and possibly by somebody
		this.registerHook('hurt');
		this.hurt = function(amount, from, health){
			if (!this.doHook('hurt').pre()) return;

			// Server side only needs to provide the amount of damage. NOTE: health is provided for client
			// side in case of any inconsistencies
			if (_.isUndefined(health)) {
				this.health -= amount;
			} else {
				if (Env.isServer) return new Error("Unexpected setting health on server");
				this.health = health;
			}

			this.Log("Just a scratch.. " + this.health + " / "+ this.entity.npc.health +"   ("+amount+" dmg)");
			this.triggerEvent(EVT_ATTACKED, from, amount);

			if (!Env.isServer) {
				if (this.entity.hasOwnProperty('ui')) {
					var result = this.entity.ui.hurt();
					if (_.isError(result)) return result;
				}
			}
			
			if (this.health <= 0) {
				var result = this.die();
				if (_.isError(result)) return result;
				return; // do not post hurt since we've died
			}

			this.doHook('hurt').post();
		};

		this.registerHook('die');
		this.die = function(){
			if (!this.alive) return new Error("Dying when already died");
			if (!this.doHook('die').pre()) return;

				this.Log("Its time to die :(");
				this.alive = false;
				if (!_.isFinite(this.entity.npc.spawn) || this.entity.npc.spawn < 0) return new Error("NPC has bad respawn timer value");
				this.respawnTime = this.entity.npc.spawn;
				var result = this.brain.die();
				if (_.isError(result)) return result;
				this.triggerEvent(EVT_DIED);


			this.doHook('die').post();
		};

		this.registerHook('respawning');
		this.respawning = function(){
			if (!this.doHook('respawning').pre()) return;

			this.Log("Respawning");
			this.entity.path = null;
			this.entity.zoning = false;
			this.entity.lastMoved=now();
			this.entity.lastStep=0;
			this.entity.sprite.idle();
			this.entity.pendingEvents=[];

			this.alive = true;
			if (!_.isFinite(this.entity.npc.health) || this.entity.npc.health <= 0) return new Error("NPC has bad health value");
			this.health = this.entity.npc.health;
			var result = this.brain.reset();
			if (_.isError(result)) return result;

			this.doHook('respawning').post();
		};

		this.registerHook('respawned');
		this.respawned = function(){
			if (!this.doHook('respawned').pre()) return;

			var result = null;
			this.entity.position.local.y = this.respawnPoint.y;
			this.entity.position.local.x = this.respawnPoint.x;
			result = this.entity.updatePosition();
			if (_.isError(result)) return result;
			result = this.characterHasMoved();
			if (_.isError(result)) return result;
			this.Log("Respawned");

			this.doHook('respawned').post();
		};


		// Note whenver the character has moved to a new tile
		this.registerHook('moved');
		this.characterHasMoved = function(){
			if (!this.doHook('moved').pre()) return;

			this.doHook('moved').post();
		};
		this.listenTo(this.entity, EVT_MOVED_TO_NEW_TILE, function(){
			var result = this.characterHasMoved();
			if (_.isError(result)) throw result;
		});



		this.isAttackable = function(){
			if (this.health <= 0 || !this.alive) {
				return false;
			}

			return true;
		};

		this.initListeners = function(){

			this.entity.registerHandler('step');
			this.entity.handler('step').set(function(delta){
				if (!this.alive) return;
				this.delta += delta;

				while (this.delta >= 50) {
					this.delta -= 50;
					this.handlePendingEvents();
					var result = this.brain.step();
					if (_.isError(result)) return result;
				}
			}.bind(this));
		};

		this.unload = function(){
			this.stopAllEventsAndListeners();
			if (!(this.entity instanceof Movable)) throw new Error("Entity not a Movable");
			this.entity.handler('step').unset();
		}

		var _character = this;
		this.server = {
			initialize: function(){
				_character._script = this;
				_character.characterInit.bind(_character)();
			},

			characterInit: function(){
				var result = null;
				result = this._script.addScript( new AI(game, _character) ); // NOTE: brain will be initialized automatically after character is initialized
				if (_.isError(result)) throw result;
				this.brain = result;

				result = this.initListeners();
				if (_.isError(result)) throw result;
			},

			setAsPlayer: function(){

				var player = _character.entity.player,
					pickupItem = function(evt, data){
						var err     = null,
							coord   = null,
							page    = null,
							item    = null,
							y       = null,
							x       = null,
							myPos   = null,
							itmRef  = null,
							itmBase = null,
							result  = null;

						if (!_.isObject(data)) return new Error("No args given");
						if (!data.hasOwnProperty('coord')) return new Error("No coordinates given for item");
						if (isNaN(data.coord)) return new Error("Bad coordinates given for item");
						if (!data.hasOwnProperty('page')) return new Error("No page given");
						if (isNaN(data.page)) return new Error("Bad page given"); 

						coord = parseInt(data.coord);
						page = player.movable.page.map.pages[data.page];
						if (!page.items.hasOwnProperty(coord)) err = "No item found at " + coord;

						if (!err) {
							item = page.items[coord];

							// Is character in range?
							y     = parseInt(coord / Env.pageWidth);
							x     = coord - y*Env.pageWidth;
							myPos = player.movable.position.tile;

							if ((y+page.y) !== myPos.y || (x+page.x) !== myPos.x) {
								if (player.movable.path && !data.hasOwnProperty('retrying')) {
									player.movable.path.onFinished = (function(){ 
										console.log("Character not near item.. Trying again after movable finishes path");
										data.retrying = true;
										var result = pickupItem.call(_character, evt, data);
										if (_.isError(result)) {
											this.Log("Error in retrying to pickup item: " + result.message, LOG_ERROR);
											player.respond(evt.id, false, {
												msg: result.message
											});
										}
									});
									player.movable.path.onFailed = (function(){
										player.respond(evt.id, false, {
											msg: "Player not near item"
										});
									});
									return;
								} else {
									err = "Player not in range of item: ("+x+","+y+") -> ("+myPos.x+","+myPos.y+")";
								}
							}

						}

						if (err) {
							this.Log("Could not pickup item: " + err, LOG_ERROR);
							player.respond(evt.id, false, {
								msg: err
							});

							return false;
						}


						itmRef = Resources.items.list[item.id];

						if (!itmRef.hasOwnProperty('base')) return new Error("Item does not contain a base script");
						if (err === null && !Resources.items.base.hasOwnProperty(itmRef.base)) return new Error("Base script("+ itmRef.base +") not found");

						itmBase = Resources.items.base[itmRef.base];
						if (!itmBase.hasOwnProperty('invoke')) return new Error("Base item script not prepared");


						this.Log("Requesting to pickup item");
						delete page.items[coord];
						result = itmBase.invoke(item.id, _character, itmRef.args);

						if (_.isError(result)) return result;

						if (typeof result == 'GameError') {
							result.print();
							player.respond(evt.id, false, {
								msg: result.message
							});
							return false;
						}


						player.respond(evt.id, true);
						page.broadcast(EVT_GET_ITEM, {
							page: page.index,
							coord: coord
						});

						result = page.map.game.removeItem(page.index, coord);
						if (_.isError(result)) return result;
					};
				player.registerHandler(EVT_GET_ITEM);
				player.handler(EVT_GET_ITEM).set(function(evt, data){
					var result = pickupItem(evt, data);
					if (_.isError(result)) {
						this.Log("Error in player picking up item: " + result.message, LOG_ERROR);
						player.respond(evt.id, false, {
							msg: err
						});
					}
				});
				
				var interact = function(evt, data){
					console.log('interaction');
						var err              = null,
							coord            = null,
							page             = null,
							interactable     = null,
							y                = null,
							x                = null,
							myPos            = null,
							interactableRef  = null,
							interactableBase = null,
							result           = null;

						if (!_.isObject(data)) return new Error("No args given");
						if (!data.hasOwnProperty('coord')) return new Error("No coordinates given for interactable");
						if (!_.isFinite(data.coord)) return new Error("Bad coordinates given for interactable");
						if (!data.hasOwnProperty('page')) return new Error("No page given");
						if (!_.isFinite(data.page)) return new Error("Bad page given"); 
						if (!data.hasOwnProperty('tile')) return new Error("No tile given");
						if (!_.isObject(data.tile)) return new Error("Bad tile given"); 
						if (!_.isFinite(data.tile.x)) return new Error("Bad tile x coordinate given"); 
						if (!_.isFinite(data.tile.y)) return new Error("Bad tile y coordinate given"); 

						coord = parseInt(data.coord);
						page = player.movable.page.map.pages[data.page];
						if (!page) return new Error("Bad page given");
						if (!page.interactables.hasOwnProperty(coord)) err = "No interactable found at " + coord;

						if (!err) {
							interactable = page.interactables[coord];

							// Is character in range?
							y     = parseInt(coord / Env.pageWidth);
							x     = coord - y*Env.pageWidth;
							myPos = player.movable.position.tile;
							y += page.y;
							x += page.x;

							if (x < myPos.x - 1 || x > myPos.x + 1 ||
								y < myPos.y - 1 || y > myPos.y + 1) {

								// Not within range...lets retry when we're finished our current path
								if (player.movable.path && !data.hasOwnProperty('retrying')) {
									player.movable.path.onFinished = (function(){ 
										console.log("Character not near interactable.. Trying again after movable finishes path");
										data.retrying = true;
										var result = interact.call(_character, evt, data);
										if (_.isError(result)) {
											this.Log("Error in retrying to interact: " + result.message, LOG_ERROR);
											player.respond(evt.id, false, {
												msg: result.message
											});
										}
									});
									player.movable.path.onFailed = (function(){
										player.respond(evt.id, false, {
											msg: "Player not near interactable"
										});
									});
									return;
								} else {
									err = "Player not in range of interactable: ("+x+","+y+") -> ("+myPos.x+","+myPos.y+")";
								}
							}

						}

						if (err) {
							this.Log("Could not interact with interactable: " + err);
							player.respond(evt.id, false, {
								msg: err
							});

							return false;
						}


						interactableRef = Resources.interactables.list[interactable];

						if (!interactableRef) return new Error("No resource for interactable: "+ interactable);
						if (!interactableRef.hasOwnProperty('base')) return new Error("Interactable does not contain a base script");
						if (err === null && !Resources.interactables.base.hasOwnProperty(interactableRef.base)) return new Error("Base script("+ interactableRef.base +") not found");

						interactableBase = Resources.interactables.base[interactableRef.base];
						if (!interactableBase.hasOwnProperty('invoke')) return new Error("Base interactable script not prepared");


						this.Log("Requesting to interact with interactable ("+ interactable +")");
						result = interactableBase.invoke(interactable, _character, interactableRef.args);

						if (_.isError(result)) return result;

						if (typeof result == 'GameError') {
							result.print();
							player.respond(evt.id, false, {
								msg: result.message
							});
							return false;
						}

						player.respond(evt.id, true);
				};

				player.registerHandler(EVT_INTERACT);
				player.handler(EVT_INTERACT).set(function(evt, data){
					var result = interact(evt, data);
					if (_.isError(result)) {
						this.Log("Error trying to interact: " + result.message, LOG_ERROR);
						player.respond(evt.id, false, {
							msg: result.message
						});
					}
				});
			},
		};

		this.client = {
			initialize: function(){
				console.log("["+_character.entity.id+"] Initializing character..");
				_character._script = this;
				_character.characterInit.bind(_character)();
			},

			characterInit: function(){
				var result = null;
				result = this._script.addScript( new AI(game, _character) ); // NOTE: brain will be initialized automatically after character is initialized
				if (_.isError(result)) throw result;

				this.brain = result;
				result = this.initListeners();
				if (_.isError(result)) throw result;
			},

			setToUser: function(){
				var result = null;
				this.isUser = true;
				result = this.brain.setToUser();
				if (_.isError(result)) return result;

				if (The.player !== true) {

					// FIXME: hook died
					this.entity.listenTo(this, EVT_DIED, function(){
						this.stopAllEventsAndListeners();
					}, HIGH_PRIORITY);
				}
			},

			setAsPlayer: function(){
				console.log("I'm such a player");
			},
		};
	};

	return Character;
});
