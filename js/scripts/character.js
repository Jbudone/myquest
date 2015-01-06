define(['SCRIPTENV', 'scripts/character.ai', 'eventful', 'hookable', 'loggable'], function(SCRIPTENV, AI, Eventful, Hookable, Loggable){

	eval(SCRIPTENV);

	var Character = function(game, entity){
		extendClass(this).with(Eventful);
		extendClass(this).with(Hookable);
		extendClass(this).with(Loggable);
		this.setLogGroup('Character');

		this._instincts = ['movement', 'combat'];

		this.entity = entity;
		this.brain = null;
		entity.character = this;
		this._script = null;

		this.setLogPrefix('[char:'+this.entity.id+'] ');

		this.isPlayer = (entity.hasOwnProperty('playerID') ? true : false);
		this.delta = 0;

		// FIXME: get these stats from npc
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
				this.health = health;
			}

			this.Log("Just a scratch.. " + this.health + " / "+ this.entity.npc.health +"   ("+amount+" dmg)");
			this.triggerEvent(EVT_ATTACKED, from, amount);

			if (!Env.isServer) {
				if (this.entity.hasOwnProperty('ui')) {
					this.entity.ui.hurt();
				}
			}
			
			if (this.health <= 0) {
				this.die();
				return;
			}

			this.doHook('hurt').post();
		};

		this.registerHook('die');
		this.die = function(){
			if (!this.alive) return;
			if (!this.doHook('die').pre()) return;

				this.Log("Its time to die :(");
				// this.physicalState.transition(STATE_DEAD);
				this.alive = false;
				this.respawnTime = this.entity.npc.spawn;
				this.brain.die();
				this.triggerEvent(EVT_DIED);


			this.doHook('die').post();
		};

		this.registerHook('respawning');
		this.respawning = function(){
			if (!this.doHook('respawning').pre()) return;

			this.Log("Respawning");
			//this.entity.physicalState.transition(STATE_ALIVE);
			this.entity.path = null;
			this.entity.zoning = false;
			this.entity.lastMoved=now();
			this.entity.lastStep=0;
			this.entity.sprite.idle();
			this.entity.pendingEvents=[];

			this.alive = true;
			this.health = this.entity.npc.health;
			this.brain.reset();

			this.doHook('respawning').post();
		};

		this.registerHook('respawned');
		this.respawned = function(){
			if (!this.doHook('respawned').pre()) return;

			this.entity.position.local.y = this.respawnPoint.y;
			this.entity.position.local.x = this.respawnPoint.x;
			this.entity.updatePosition();
			this.characterHasMoved();
			this.Log("Respawned");

			this.doHook('respawned').post();
		};


		// Note whenver the character has moved to a new tile
		this.registerHook('moved');
		this.characterHasMoved = function(){
			if (!this.doHook('moved').pre()) return;

			this.doHook('moved').post();
		};
		this.listenTo(this.entity, EVT_MOVED_TO_NEW_TILE, this.characterHasMoved);



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
					this.brain.step();
				}
			}.bind(this));
		};

		this.unload = function(){
			this.stopAllEventsAndListeners();
			if (this.entity instanceof Movable) this.entity.handler('step').unset();
		}

		var _character = this;
		this.server = {
			initialize: function(){
				console.log("Initializing character..");
				_character._script = this;
				_character.characterInit.bind(_character)();
			},

			characterInit: function(){
				this.brain = this._script.addScript( new AI(game, _character) ); // NOTE: brain will be initialized automatically after character is initialized
				this.initListeners();
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

						if (!_.isObject(data)) err = "No args given";

						if (err === null) {
							if (!data.hasOwnProperty('coord')) err = "No coordinates given for item";
							if (isNaN(data.coord)) err = "Bad coordinates given for item";
							if (!data.hasOwnProperty('page')) err = "No page given";
							if (isNaN(data.page)) err = "Bad page given";
						}

						if (err === null) {
							coord = parseInt(data.coord);
							page = player.movable.page.map.pages[data.page];
							if (!page.items.hasOwnProperty(coord)) err = "No item found at " + coord;
						}

						if (err === null) {
							item = page.items[coord];

							// Is character in range?
							y = parseInt(coord / Env.pageWidth);
							x = coord - y*Env.pageWidth;
							myPos = player.movable.position.tile;

							if ((y+page.y) !== myPos.y || (x+page.x) !== myPos.x) {
								if (player.movable.path && !data.hasOwnProperty('retrying')) {
									player.movable.path.onFinished = (function(){ 
										console.log("Character not near item.. Trying again after movable finishes path");
										data.retrying = true;
										pickupItem.call(_character, evt, data);
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

						if (err === null) {
							itmRef = Resources.items.list[item.id];

							if (!itmRef.hasOwnProperty('base')) err = "Item does not contain a base script";
							if (err === null && !Resources.items.base.hasOwnProperty(itmRef.base)) err = "Base script("+ itmRef.base +") not found";
						}

						if (err === null) {
							itmBase = Resources.items.base[itmRef.base];
							if (!itmBase.hasOwnProperty('invoke')) err = "Base item script not prepared";
						}

						if (err) {
							this.Log("Could not pickup item: " + err);
							player.respond(evt.id, false, {
								msg: err
							});

							return false;
						}


						this.Log("Requesting to pickup item");
						delete page.items[coord];
						result = itmBase.invoke(_character, itmRef.args);

						if (result instanceof Error) {
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
					};
				player.registerHandler(EVT_GET_ITEM);
				player.handler(EVT_GET_ITEM).set(pickupItem);
				
			},
		};

		this.client = {
			initialize: function(){
				console.log("["+_character.entity.id+"] Initializing character..");
				_character._script = this;
				_character.characterInit.bind(_character)();
			},

			characterInit: function(){
				this.brain = this._script.addScript( new AI(game, _character) ); // NOTE: brain will be initialized automatically after character is initialized
				this.initListeners();
			},

			setToUser: function(){
				this.isUser = true;
				this.brain.setToUser();

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
