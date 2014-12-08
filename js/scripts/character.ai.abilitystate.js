define(['SCRIPTENV'], function(SCRIPTENV){

	eval(SCRIPTENV);

	var AbilityState = function(){

		this.update = new Function();

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

		this.onEnter = new Function();
		this.onLeave = new Function();

	};

	return AbilityState;
});
