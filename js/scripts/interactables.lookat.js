define(['SCRIPTENV', 'loggable', 'scripts/character'], function(SCRIPTENV, Loggable, Character){

	eval(SCRIPTENV);

	var Lookat = function(){
		extendClass(this).with(Loggable);
		this.setLogGroup('Interactable');
		this.setLogPrefix('(Interactable) ');

		this.name           = "interactable";
		this.static         = false;
		var _interactable   = this,
			_script         = null;
		
		this.server = {
			initialize: function(character, args){
				_script = this;
				this.interact.bind(_interactable)(character, args);
			},

			interact: function(character, args){
				if (!(character instanceof Character)) return new Error("Character is not a character");
				if (!_.isObject(args)) return new Error("Provided args is not an object");
				if (!args.hasOwnProperty('description')) return new Error("Arguments does not provide description");
				if (!_.isString(args.description)) return new Error("Description is not a string");
				if (character.alive !== true) return new Error("Character is not alive");

				character.entity.page.broadcast(EVT_INTERACT, {
					base: 'lookat',
					character: character.entity.id,
					description: args.description
				});
			}
		};

		this.client = {
			initialize: function(character, args){
				_script = this;
				this.interact.bind(_interactable)(character, args);
			},

			interact: function(character, args){
				if (character.entity.id === The.player.id) {
					UI.postMessage("You ponder at the thing: "+ args.description);
				} else {
					UI.postMessage("He ponders at that thing: "+ args.description);
				}
			}
		};

	};

	return {
		handledBy: CLIENT_ONLY,
		dynamic: false,
		base: Lookat
	};
});
