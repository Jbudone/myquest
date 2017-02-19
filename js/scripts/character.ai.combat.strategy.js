define(['SCRIPTINJECT', 'scripts/character.ai.combat.state', 'loggable'], (SCRIPTINJECT, State, Loggable) => {

    /* SCRIPTINJECT */

    // Combat strategy
    //
    // Activated when we're in combat mode. Currently the combat system will pick a single strategy for the npc on
    // initiatlization; but later on we can change this to have the combat sytem pick and choose strategies. Eventually
    // we can add in a machine learning / training system for npcs to test out different strategies in different
    // scenarios to determine whats best to use when. This would work for group vs. group dynamics (ie. multiple people
    // are attacking me, or when I have some friends and want to coordinate my combat strategy with them).
    //
    // Combat strategies should have access to a combat interface. Some strategies may require certain abilities in the
    // combat interface (eg. chasing, melee attack, magic, etc.), so on startup it will check that the required
    // abilities are included. Startup is done once ever (on creation of the character/ai/combat system); then when
    // entering/leaving combat we can simply leave/enter the idle state here. Magic/Skills should be completely dynamic
    // and passed into here on startup.  This way each npc can have multiple skills/spells but still share the same
    // strategy. As far as the strategy is concerned each skill/spell passed in is treated the same way, and could
    // potentially include extra information for better decision making { priority? chanceOfUsing?  cooldown? mana?
    // validity()? }
    //
    // In a lot of cases there's no need to update every step, so a tick variable is utilized to determine if its
    // necessary to step this time. eg. if we're currently chasing the enemy, we don't need to step again until we've
    // reached him or until he's gotten away or we have a new target.
    //
    //
    // Ability Requiring
    //
    //  Since strategies are closely tied with the actual combat system, individual abilities, etc. there is a require
    //  system set in place on initialization. Each strategy can specify a list of ability which are required to run,
    //  and a list of instincts (eg. movement). This allows us to directly communicate with those systems, and also to
    //  notice problems where characters may not have a corresponding ability/instinct required by the strategy.
    //
    //      var melee = combat.ability(attackInfo.ability),
    //          movement = combat.require('movement');
    //
    //
    // Receiving Events
    //
    //  To keep track of events (enemy zoning, walking to new tile, dying, etc.) we can register callbacks for each
    //  given event. The combat system will handle all event listening and run our callback for us
    //
    //
    //      combat.registerCallback(EVT_MOVED_TO_NEW_TILE, targetMoved);
    //
    //
    //
    // TODO: Tick mechanic (when to tick next)
    // TODO: How to handle dynamic/generic skills/spells?
    // TODO: How can FSM/Combat communicate that enemy has died and we need to idle, and let boredom / walking home set in

    addKey('INPUT_TARGET_LOST');
    addKey('INPUT_TARGET');

    const Strategy = function(combat, _character) {

        extendClass(this).with(Loggable);
        this.setLogPrefix('Script');

        this.target = null;

        this.step = () => {
            this.state.step();
        };


        this.Input = (input) => {
            const action = this.state.input(input),
                oldName  = this.state.name,
                newName  = action ? action.name : "NULL";

            this.Log("====[ Melee State ]==================", LOG_DEBUG);

            if (action === INPUT_HANDLED) {
                this.Log(`  State  (${oldName})[${keyStrings[input]}]  Handled within state`, LOG_DEBUG);
            } else if (action) {

                this.Log(`  Transition  (${oldName})[${keyStrings[input]}] ====>  ${newName}`, LOG_DEBUG);
                this.state = action;

                this.state.init(); // FIXME: add args OR store everything in here?

                if (action === Idle) {
                    this.finished();
                }

                return action;
            } else {
                this.state.debug();
                throw Err(`State (${oldName}) did not have input for ${keyStrings[input]}`);
            }
        };

        this.states = {};

        this.AddState = (name, init, step) => {
            const state = new State(name, init, step);
            this.states[name] = state;
            return state;
        };


        const Idle = this.AddState('Idle', () => {
            // init
        });

        Idle.on(INPUT_TARGET).go(Idle)
            .on(INPUT_TARGET_LOST).go(Idle);

        this.finished = () => {};

        this.reset = () => {

            this.Log("Resetting state: Idle");
            this.state = Idle;
            this.target = null;
        };

        const setTarget = (_target) => {

            this.Log("Setting target", LOG_DEBUG);
            this.target = _target;
            //reset();
            this.input(INPUT_TARGET);
        };

        const lostTarget = () => {
            this.input(INPUT_TARGET_LOST);
        };

        const reset = () => {
            this.reset();
        };

        this.state  = null;
        this.input  = this.Input;


        // Subscribe to each callback
        // NOTE: This should be set upon initialization. The combat system will store these subscriptions and
        // apply/clear them from the target when they're added/removed
        this.registerCallback = (evt, callback) => {
            combat.registerCallback(evt, callback);
        };

        this.interface = {

            step: this.step,

            target: setTarget,
            lostTarget,

            finished: (callback) => { finished = callback; },
            reset
        };
    };

    return Strategy;
});
