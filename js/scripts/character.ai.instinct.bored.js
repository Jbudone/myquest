define(['SCRIPTENV', 'scripts/character', 'scripts/character.ai.instinct', 'eventful', 'hookable', 'dynamic', 'loggable'], function(SCRIPTENV, Character, Instinct, Eventful, Hookable, Dynamic, Loggable){
	
	eval(SCRIPTENV);

	var Bored = function(game, brain){
		extendClass(this).with(Eventful);
		extendClass(this).with(Hookable);
		extendClass(this).with(Dynamic);
		extendClass(this).with(Loggable);
		this.setLogGroup('Instinct');
		this.setLogPrefix('(Bored:'+ brain.character.entity.id +') ');

		this.base = Instinct;
		this.base();

		this.name = "bored";

		var _bored     = this,
			brain      = brain,
			_game      = game,
			_character = brain.character,
			_script    = null;

		this.isBored = true;
		this.timeEntered = now();
		this.boredTime = 0;



		this.onEnter = function(instinct, data){
			this.beginBoredom();
		};
		
		this.onLeave = function(){

			_game.hook('longStep', this).remove();
		};

		this.globalUnload = function(){

		};

		this.server = {
			initialize: function(){
				_script = this;
				_bored.boredInit.bind(_bored)();
			},

			beginBoredom: function(){

				this.isBored = false;
				this.boredTime = 0;
				_game.hook('longStep', this).after(function(){
					this.boredTime += 1000;
					this.Log("Getting bored.. "+ this.boredTime);
					if (this.boredTime > 2000) {
						this.isBored = true;
						this.Log("IM BORED!!!!");

						// TODO: walk to spawn spot
						this.goBackToSpawn();
						_game.hook('longStep', this).remove();
					}
				}.bind(this));

				// TODO: listen to onStateChanged to remove boredom

				this.timeEntered = now();
			},

			goBackToSpawn: function(){
				debugger;
				var respawn = _character.respawnPoint,
					page	= _character.entity.page.map.pages[ respawn.page ],
					x		= parseInt(respawn.x / Env.tileSize) + page.x,
					y		= parseInt(respawn.y / Env.tileSize) + page.y,
					tile 	= new Tile( x, y );
				brain.instincts['movement'].goToTile( tile, 0 );
			},

			update: function(){},
			inform: function(){
				// News of some other important thing has occured.. don't worry about what the news is, just
				// accept to leave the boredom state
				return {
					accept: true,
				}
			},

			boredInit: function(){

				if (!_character.isPlayer) {
					brain.onStateless = function(){
						brain.enterState('boredom');
					};
				}

			},

			unload: function(){
				_game.hook('longStep', this).remove();
				this.globalUnload();
			}
		};

	}

	return Bored;
});
