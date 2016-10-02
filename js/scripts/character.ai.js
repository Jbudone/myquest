define(['SCRIPTINJECT', 'scripts/character.ai.neuralnet', 'loggable'], (SCRIPTINJECT, NeuralNet, Loggable) => {

    /* SCRIPTINJECT */

    const AI = function(game, character) {

        this.character = character;

        extendClass(this).with(Loggable);
        this.setLogGroup('AI');
        this.setLogPrefix(`ai:${character.entity.id}`);


        const _brain = this;
        let _script = null;


        this.step = () => {

            if (this.state) {
                const result = this.state.update();
                if (result === false) {
                    this.state.leave();
                    this.state = null;

                    if (this.onStateless) {
                        this.onStateless();
                    }
                }
            }
        };

        this.die = () => {

            if (this.state) {
                this.state.leave();
                this.state = null;
            }

            // We may have a bunch of states which are inactive but need to be reset (eg. combat listening to targets in
            // order to re-activate)
            for (const instinctName in this.instincts) {
                const instinct = this.instincts[instinctName];
                instinct.reset();
            }

            this.neuralNet.reset();
        };

        this.reset = () => {

        };

        // Safely exit out of current state, and enter new state
        this.instincts = {};
        this.state = null;
        this.enterState = function(instinct) {

            this.Log(`Entering state: ${instinct}`, LOG_DEBUG);
            if (this.state !== null) {
                // leave state
                if (this.state.name === instinct) {
                    this.Log("Instinct already active", LOG_ERROR);
                    return;
                }

                this.state.leave();
                this.state = null;
            }

            if (!this.instincts[instinct]) {
                this.Log(this.instincts);
                throw Err('No instinct found: '+instinct);
            }

            this.state = this.instincts[instinct];
            this.state.enter.apply(this.state, arguments); // FIXME: Avoid apply by using arrow functions; what about args?
        }.bind(this); // FIXME: Get rid of bind when we have a replacement answer for arguments

        this.isBusy = () => this.state && this.state.isBusy && this.state.isBusy();

        // As soon as we leave a state, we trigger this. This enables other states to take action when AI is not busy w/
        // other stuff. But mostly just used for allowing NPC's to be bored after combat and stumble back to their spawn
        // spot
        //
        // TODO: improve this to enable multiple hooks on stateless without states colliding with each other..  either
        // through hooks or giving an array of callbacks
        this.onStateless = () => {};

        this.leaveState = (instinct) => {
            this.Log(`Leaving state: ${instinct}`, LOG_DEBUG);
            if (this.state !== null && this.instincts[instinct] === this.state) {

                // leave state
                this.state.leave();
                this.state = null;

                if (this.onStateless) {
                    this.onStateless();
                }
            }
        };

        // Instincts can listen to various events, and will post any updates through here. This method is
        // responsible for sending the news item to the currently active instinct, and then determining from
        // its reply what to do. The active instinct will either accept or decline this update by returning a
        // result; that result will tell us whether or not we should switch our currently active instinct. The
        // process looks something like this,
        //
        //  <Event Trigger> -> <News> -> postNews -> activeInstinct.inform(news) -> <Result>
        //          <Result:accept> -> setNewInstinct() -> newInstinct.enter(news)
        //          <Result:deny>   -> storeNews()
        //
        //
        // If a news item is denied, it will be stored in memory for the next time.
        // TODO: should handle this memory stored news item in either one of two ways: add the news items, so
        // the next time a news item comes in we add it to the current associated news type (eg. amount we
        // were attacked)...But what about exploration? We may see various interesting items, but we don't
        // want to add those amounts together; should use a threshold for that (eg. interesting wand shows up
        // while in a mild fight)
        this.postNews = (news) => {

            if (!this.character.alive) return;
            if (!news || _.isUndefined(news.instinct)) {
                throw Err("Bad news item given..");
            }

            if (this.state) {

                if (news.instinct === this.state.name) {
                    return new Error("This state is already active! "+this.state.name);
                } else {
                    const result = this.state.inform(news);
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


        this.unload = function() {}

        this.server = {
            initialize: function() {
                _script = this;
                _brain.brainInit();
            },

            brainInit: () => {

                // Neural Network keeps track of all the other characters of interest (friends & foes)
                this.neuralNet = new NeuralNet(this);


                // List of instincts
                // We can only be in one instinct (state) at a time. We must call enterState() to switch to another
                // state
                for (let i = 0; i < character._instincts.length; ++i) {
                    const _instinct = character._instincts[i];
                    let instinct = Resources.scripts.ai.instincts[_instinct];
                    if (instinct.script) instinct = instinct.script;
                    this.instincts[_instinct] = _script.addScript( new instinct(game, this) );
                }
            },
        };

        this.client = {
            initialize: function() {
                _script = this;
                _brain.brainInit();
            },

            brainInit: () => {

                // Neural Network keeps track of all the other characters of interest (friends & foes)
                this.neuralNet = new NeuralNet(this);


                // List of instincts
                // We can only be in one instinct (state) at a time. We must call enterState() to switch to another
                // state
                for (let i = 0; i < character._instincts.length; ++i) {
                    const _instinct = character._instincts[i];
                    let instinct = Resources.scripts.ai.instincts[_instinct];
                    if (instinct.script) instinct = instinct.script;
                    this.instincts[_instinct] = _script.addScript( new instinct(game, this) );
                }
            },

            setToUser: () => {
                // TODO: for each instinct, try to set them as user; for each ability try to set as user;
                // (specialized listening)

                for (const instinctName in this.instincts) {
                    const instinct = this.instincts[instinctName];
                    if (instinct.setToUser) {
                        instinct.setToUser();
                    }
                }

            }
        };
    };

    return AI;
});
