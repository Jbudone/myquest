define(['SCRIPTINJECT', 'scripts/character.ai.abilitystate'], (SCRIPTINJECT, AbilityState) => {

    /* SCRIPTINJECT */

    // AI Instinct
    //
    // Each character may have a set of natural instincts (eg. movement, combat, exploration). These natural instincts
    // can act as a base object for a set of abilities (eg. the combat instinct may contain the melee ability or magic
    // ability). Each instinct uses an FSM structure to determine its state, and that FSM structure will be injected
    // into the brain's FSM. Each instinct will also be responsible for listening to and handling events.
    const Instinct = function() {

        this.state  = null;
        this.states = {};

        this.addState = (id) => {
            const state = new AbilityState();
            this.states[id] = state;

            return state;
        };

        this.isActive = false;
        this.enter = function() {
            if (this.isActive) {
                // TODO: what to do when this is already active?
            } else {
                this.isActive = true;
                // FIXME: Is there a way to do this without using apply/arguments?
                this.onEnter.apply(this, arguments);
            }
        }.bind(this); // FIXME: Get rid of bind when we have a replacement answer for arguments

        this.leave = function() {
            if (!this.isActive) return;
            this.isActive = false;
            this.onLeave.apply(this, arguments);
        }.bind(this);  // FIXME: Get rid of bind when we have a replacement answer for arguments

        this.onEnter = function(){};
        this.onLeave = function(){};
        this.reset   = function(){};
    };

    return Instinct;
});
