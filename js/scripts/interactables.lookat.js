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
		
		this.client = {
			initialize: function(name, character, args){
				_script = this;
				this.interact.bind(_interactable)(name, character, args);
			},

			interact: function(name, character, args){
				if (character.entity.id === The.player.id) {
					UI.postMessage("You ponder at ("+name+"): "+ args.description);
				} else {
					UI.postMessage("He ponders at ("+name+"): "+ args.description);
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
