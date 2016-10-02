define(['SCRIPTINJECT', 'loggable'], function(SCRIPTINJECT, Loggable){

    /* SCRIPTINJECT */

	var AbilityState = function(){

		extendClass(this).with(Loggable);
		this.setLogGroup('Ability');
		this.setLogPrefix('(Ability: ');


		this.update = function(){};

		this.isActive = false;
		this.enter = function(){
			if (this.isActive) {
				// TODO: what to do when we're already active?
				return;
			}

			this.isActive = true;
			this.onEnter.apply(this, arguments);
		};

		this.leave = function(){
			if (!this.isActive) return;
			this.isActive = false;
			this.onLeave.apply(this, arguments);
		};

		this.onEnter = function(){};
		this.onLeave = function(){};

	};

	return AbilityState;
});
