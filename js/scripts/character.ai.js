define(['SCRIPTENV', 'scripts/character.ai.neuralnet', 'loggable'], function(SCRIPTENV, NeuralNet, Loggable){

	eval(SCRIPTENV);
	
	var AI = function(game, character){
		this.character = character;

		extendClass(this).with(Loggable);
		this.setLogGroup('AI');
		this.setLogPrefix('[ai:'+character.entity.id+'] ');



		var _brain = this,
			_script = null;


		this.step = function(){
			if (this.state) {
				var result = this.state.update();

				if (_.isError(result)) return result;

				if (result === false) {
					result = this.state.leave();
					if (_.isError(result)) return result;
					this.state = null;

					if (this.onStateless) {
						result = this.onStateless();
						if (_.isError(result)) return result;
					}
				}
			}
		};

		this.die = function(){
			var result = null;
			if (this.state) {
				result = this.state.leave();
				if (_.isError(result)) return result;
				this.state = null;
			}

			result = this.neuralNet.reset();
			if (_.isError(result)) return result;
		};

		this.reset = function(){

		};

		// Safely exit out of current state, and enter new state
		this.instincts = {};
		this.state = null;
		this.enterState = function(instinct){
			var result = null;
			this.Log("Entering state: "+instinct);
			if (this.state != null) {
				// leave state
				if (this.state.name == instinct) {
					this.Log("Instinct already active", LOG_ERROR);
					return;
				}

				result = this.state.leave();
				if (_.isError(result)) return result;
				this.state = null;
			}

			if (!this.instincts[instinct]) {
				this.Log(this.instincts);
				return new Error('No instinct found: '+instinct);
			}

			this.state = this.instincts[instinct];
			result = this.state.enter.apply(this.state, arguments);
			if (_.isError(result)) return result;
		};

		// As soon as we leave a state, we trigger this. This enables other states to take action when AI is
		// not busy w/ other stuff. But mostly just used for allowing NPC's to be bored after combat and
		// stumble back to their spawn spot
		//
		// TODO: improve this to enable multiple hooks on stateless without states colliding with each other..
		// either through hooks or giving an array of callbacks
		this.onStateless = new Function();

		this.leaveState = function(instinct){
			this.Log("Leaving state: "+instinct);
			if (this.state != null &&
				this.instincts[instinct] == this.state) {

				// leave state
				var result = null;
				result = this.state.leave();
				if (_.isError(result)) return result;
				this.state = null;

				if (this.onStateless) {
					result = this.onStateless();
					if (_.isError(result)) return result;
				}
			}
		};

		// Instincts can listen to various events, and will post any updates through here. This method is
		// responsible for sending the news item to the currently active instinct, and then determining from
		// its reply what to do. The active instinct will either accept or decline this update by returning a
		// result; that result will tell us whether or not we should switch our currently active instinct. The
		// process looks something like this,
		//
		// 	<Event Trigger> -> <News> -> postNews -> activeInstinct.inform(news) -> <Result>
		// 			<Result:accept> -> setNewInstinct() -> newInstinct.enter(news)
		// 			<Result:deny>   -> storeNews()
		//
		//
		// If a news item is denied, it will be stored in memory for the next time.
		// TODO: should handle this memory stored news item in either one of two ways: add the news items, so
		// the next time a news item comes in we add it to the current associated news type (eg. amount we
		// were attacked)...But what about exploration? We may see various interesting items, but we don't
		// want to add those amounts together; should use a threshold for that (eg. interesting wand shows up
		// while in a mild fight)
		this.postNews = function(news){

			if (!this.character.alive) return;
			if (!news || _.isUndefined(news.instinct)) {
				return new Error("Bad news item given..");
			}

			var result = null;
			if (this.state) {

				if (news.instinct === this.state.name) {
					return new Error("This state is already active! "+this.state.name);
				} else {
					result = this.state.inform(news);
					if (_.isError(result)) return result;
					if (result && result.accept === true) {

						result = this.enterState(news.instinct, news);
						if (_.isError(result)) return result;

					} else {
						// TODO: store in memory?
					}
				}

			} else {
				
				// No state set yet, lets go to this one
				result = this.enterState(news.instinct, news);
				if (_.isError(result)) return result;
			}
		};


		this.unload = function(){ }

		this.server = {
			initialize: function(){
				_script = this;
				_brain.brainInit.bind(_brain)();
			},

			brainInit: function(){
						
				// Neural Network keeps track of all the other characters of interest (friends & foes)
				this.neuralNet = new NeuralNet(this);


				// List of instincts
				// We can only be in one instinct (state) at a time. We must call enterState() to switch to another
				// state
				var result = null;
				for (var i=0; i<character._instincts.length; ++i) {
					var _instinct = character._instincts[i];
					var instinct = Resources.scripts.ai.instincts[_instinct];
					if (instinct.script) instinct = instinct.script;
					result = _script.addScript( new instinct(game, this) );
					if (_.isError(result)) return result;
					this.instincts[_instinct] = result;
				}
			},
		};

		this.client = {
			initialize: function(){
				_script = this;
				_brain.brainInit.bind(_brain)();
			},

			brainInit: function(){
						
				// Neural Network keeps track of all the other characters of interest (friends & foes)
				this.neuralNet = new NeuralNet(this);


				// List of instincts
				// We can only be in one instinct (state) at a time. We must call enterState() to switch to another
				// state
				var result = null;
				for (var i=0; i<character._instincts.length; ++i) {
					var _instinct = character._instincts[i];
					var instinct = Resources.scripts.ai.instincts[_instinct];
					if (instinct.script) instinct = instinct.script;
					result = _script.addScript( new instinct(game, this) );
					if (_.isError(result)) return result;
					this.instincts[_instinct] = result;
				}
			},

			setToUser: function(){
				// TODO: for each instinct, try to set them as user; for each ability try to set as user;
				// (specialized listening)

				var result = null;
				for (var instinctName in this.instincts) {
					var instinct = this.instincts[instinctName];
					if (instinct.hasOwnProperty('setToUser')) {
						result = instinct.setToUser();
						if (_.isError(result)) return result;
					}
				}

			}
		};
	};

	return AI;
});
