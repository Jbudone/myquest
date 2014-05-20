define(function(){

	var states = [
		'STATE_ALIVE',
		'STATE_UNCONSCIOUS',
		'STATE_DYING',
		'STATE_DEAD'
	];

	var State = function(state, params){
		this.state = state;
		this.params = [];
		if (typeof params == "object") {
			for (var param in params) {
				this.params.push(param);
				this[param] = params[param];
			}
		}
		this.transition = function(newState){
			this.state = newState;
			// for(var i=0; i<this.params.length; ++i) {
			// 	delete this[this.params[i]];
			// }
			// this.params=[];
		}
	};


	return {
		states:states,
		State:State
	};
});
