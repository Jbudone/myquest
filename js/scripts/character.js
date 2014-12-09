define(['SCRIPTENV', 'scripts/character.ai', 'eventful', 'hookable', 'loggable'], function(SCRIPTENV, AI, Eventful, Hookable, Loggable){

	eval(SCRIPTENV);

	var Character = function(entity){
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

			this.doHook('respawning').post();
		};

		this.registerHook('respawned');
		this.respawned = function(){
			if (!this.doHook('respawned').pre()) return;

			this.entity.position.local.y = this.respawnPoint.y;
			this.entity.position.local.x = this.respawnPoint.x;
			this.entity.updatePosition();
			this.Log("Respawned");

			this.doHook('respawned').post();
		};




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
				this.brain = this._script.addScript( new AI(_character) ); // NOTE: brain will be initialized automatically after character is initialized
				this.initListeners();
			},
		};

		this.client = {
			initialize: function(){
				console.log("["+_character.entity.id+"] Initializing character..");
				_character._script = this;
				_character.characterInit.bind(_character)();
			},

			characterInit: function(){
				this.brain = this._script.addScript( new AI(_character) ); // NOTE: brain will be initialized automatically after character is initialized
				this.initListeners();
			},

			setToUser: function(){
				this.isUser = true;
				this.brain.setToUser();

				if (The.player !== true) {

					// FIXME: hook died
					this.entity.listenTo(this, EVT_DIED, function(){
						this.stopAllEventsAndListeners();
					});
				}
			}
		};
	};

	return Character;
});
