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

				if (result === false) {
					this.state.leave();
					this.state = null;
				}
			}
		};

		this.die = function(){
			if (this.state) {
				this.state.leave();
				this.state = null;
			}

			this.neuralNet.reset();
		};

		this.reset = function(){

		};

		// Safely exit out of current state, and enter new state
		this.instincts = {};
		this.state = null;
		this.enterState = function(instinct){
			this.Log("Entering state: "+instinct);
			if (this.state != null) {
				// leave state
				if (this.state.name == instinct) {
					this.Log("Instinct already active", LOG_ERROR);
					return;
				}

				this.state.leave();
				this.state = null;
			}

			if (!this.instincts[instinct]) {
				this.Log('No instinct found: '+instinct, LOG_ERROR);
				this.Log(this.instincts);
				return;
			}

			this.state = this.instincts[instinct];
			this.state.enter.apply(this.state, arguments);
		};

		this.leaveState = function(instinct){
			this.Log("Leaving state: "+instinct);
			if (this.state != null &&
				this.instincts[instinct] == this.state) {

				// leave state
				this.state.leave();
				this.state = null;
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
				this.Log("Bad news item given", LOG_ERROR);
				return new UnexpectedError("Bad news item given..");
			}

			if (this.state) {

				if (news.instinct === this.state.name) {
					debugger;
					this.Log("This state is already active! "+this.state.name, LOG_ERROR);
				} else {
					var result = this.state.inform(news);
					if (result && result.accept === true) {

						this.enterState(news.instinct, news);

					} else {
						// TODO: store in memory?
					}
				}

			} else {
				
				// No state set yet, lets go to this one
				this.enterState(news.instinct, news);
			}
		};


		this.unload = function(){ }

		this.server = {
			initialize: function(){
				_script = this;
				console.log("AI: Shush! I'm thinking..");
				_brain.brainInit.bind(_brain)();
			},

			brainInit: function(){
						
				// Neural Network keeps track of all the other characters of interest (friends & foes)
				this.neuralNet = new NeuralNet(this);


				// List of instincts
				// We can only be in one instinct (state) at a time. We must call enterState() to switch to another
				// state
				for (var i=0; i<character._instincts.length; ++i) {
					var _instinct = character._instincts[i];
					console.log("Loading instinct: "+_instinct);
					var instinct = Resources.scripts.ai.instincts[_instinct];
					if (instinct.script) instinct = instinct.script;
					this.instincts[_instinct] = _script.addScript( new instinct(game, this) );
					console.log("Loaded instinct");
				}
			},
		};

		this.client = {
			initialize: function(){
				_script = this;
				console.log("AI: Shush! I'm thinking..");
				_brain.brainInit.bind(_brain)();
			},

			brainInit: function(){
						
				// Neural Network keeps track of all the other characters of interest (friends & foes)
				this.neuralNet = new NeuralNet(this);


				// List of instincts
				// We can only be in one instinct (state) at a time. We must call enterState() to switch to another
				// state
				for (var i=0; i<character._instincts.length; ++i) {
					var _instinct = character._instincts[i];
					console.log("Loading instinct: "+_instinct);
					var instinct = Resources.scripts.ai.instincts[_instinct];
					if (instinct.script) instinct = instinct.script;
					this.instincts[_instinct] = _script.addScript( new instinct(game, this) );
					console.log("Loaded instinct");
				}
			},

			setToUser: function(){
				// TODO: for each instinct, try to set them as user; for each ability try to set as user;
				// (specialized listening)

				console.log("I'm a real boy ??");
				for (var instinctName in this.instincts) {
					var instinct = this.instincts[instinctName];
					if (instinct.hasOwnProperty('setToUser')) {
						instinct.setToUser();
					}
				}

			}
		};
	};

	return AI;
});
