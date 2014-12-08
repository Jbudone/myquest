define(['SCRIPTENV', 'scripts/character.ai.ability'], function(SCRIPTENV, Ability){

	eval(SCRIPTENV);

	var Melee = function(){

		var _melee = this,
			_script = null;
		this.server = {
			initialize: function(){
				_script = this;
			}
		};
	};
	Melee.prototype = new Ability;

	return Melee;
});
