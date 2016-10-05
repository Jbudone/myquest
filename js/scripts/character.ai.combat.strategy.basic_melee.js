define(['SCRIPTINJECT', 'scripts/character.ai.combat.strategy'], (SCRIPTINJECT, Strategy) => {

    /* SCRIPTINJECT */

    // Basic Melee strategy
    //

    addKey('INPUT_TARGET_MOVED');
    addKey('INPUT_TARGET_OUTOFRANGE');
    addKey('INPUT_TARGET_INRANGE');
    addKey('INPUT_BORED');


    // Basic Melee
    //
    // The most simple combat strategy used for npcs. Simply chase/attack the current target
    const Basic_Melee = function(combat, _character) {

        Strategy.call(this, combat, _character);

        let isChasing = false; // TODO: Still need this? Now that activeMovement has been added

        let timeSinceLastAttack = now(); // NOTE: Do NOT reset this since we could potentially repeatedly go
        //         in/out of this strategy because of chasing after target
        //         and being much faster than target

        const attackInfo  = _character.entity.npc.attackInfo,
            chaseDistance = attackInfo.chaseDistance,
            attackTime    = attackInfo.attackTime,
            range         = attackInfo.range;


        if (!attackInfo) throw Err(`No attack info found for NPC`, arguments, _character.entity.npc);
        if (!attackInfo.ability) throw Err("No attack ability found for npc");

        const melee = combat.ability(attackInfo.ability),
            movement = combat.require('movement');

        let activeMovement = null; // Our current movement object

        const ChaseTarget = this.AddState('ChaseTarget', () => {
            // init
            this.Log("Attempting to chase you..", LOG_DEBUG);

            // Stop our current chasing
            if(isChasing || activeMovement){
                isChasing = false;
                this.Log("Cancelling chase first", LOG_DEBUG);
                // movement.stopChasing(target);

                activeMovement.stop();
                activeMovement = null;
            }

            const fromTile = _character.entity.position.tile,
                toTile     = this.target.entity.position.tile,
                fromReal   = _character.entity.position.global,
                toReal     = this.target.entity.position.global;
            this.Log(` ChaseTarget: (${fromTile.x}, ${fromTile.y}) ==> (${toTile.x}, ${toTile.y})`, LOG_DEBUG);
            this.Log(`      (Real): (${fromReal.x}, ${fromReal.y}) ==> (${toReal.x}, ${toReal.y})`, LOG_DEBUG);

            // Begin chasing
            // NOTE: If we're already in range then chase will succeed immediately. Do not check if we're in range
            // without attempting to chase since the target may be in range (while we're moving) and halt our current
            // path before we get to the center of the tile
            isChasing = true;
            const maxWalk = chaseDistance * (1000 / _character.entity.moveSpeed), // FIXME: Env this.. should be based off seconds to reach target and laziness factor of npc
                options   = { range: range, shootThrough: melee.canAttackThroughShootable };

            options.filterFunc = melee.chaseEntityFilterFunc;
            activeMovement = movement.chase(this.target, options, maxWalk).then(() => {
                this.Log("Caught up to you!", LOG_DEBUG);

                isChasing = false;
                activeMovement = null;
                this.input(INPUT_TARGET_INRANGE, this.target);
            }, (e) => {

                // NOTE: We may have cancelled this chase/path in order to start a new one (eg. target has moved and we
                // need to chase again)
                // The path may have also failed right off the bat (eg. path exceeded maxWalk)
                if (isChasing) {
                    this.Log("Fuck it", LOG_DEBUG);
                    activeMovement = null;
                    isChasing = false;
                } else {
                    activeMovement = null; // TODO: Need to do this in both places? Or can we just unset these after the input
                    isChasing = false;
                }

                // If we couldn't find a path to the target or its simply too far then forget the target
                if (!e || e === PATH_TOO_FAR) {
                    combat.forgetTarget(this.target);
                }
            });
        });

        const AttackTarget = this.AddState('AttackTarget', function() {}, () => {
            // step
            // TODO: Abstract attack timing
            const _now = now();
            this.Log(`AttackTarget ? ${_now - timeSinceLastAttack} > ${attackTime}`);
            if (_now - timeSinceLastAttack > attackTime) {
                const options = { range: range, shootThrough: melee.canAttackThroughShootable };
                options.filterFunc = melee.inRangeFilterFunc;
                if (movement.inRangeOf(this.target, options)){
                    timeSinceLastAttack = _now;
                    melee.attackTarget(this.target);
                    this.Log("Attempting to attack you..", LOG_DEBUG);
                } else {
                    timeSinceLastAttack = _now;
                    this.Log("Wtf you're too far?! I can't hit you", LOG_DEBUG);
                }
            }

        });

        const HaveTarget = this.AddState('HaveTarget', () => {
            // init

            const options = { range: range, shootThrough: melee.canAttackThroughShootable };
            options.filterFunc = melee.inRangeFilterFunc;
            if (movement.inRangeOf(this.target, options)) {
                this.Log("I'm in range of you!", LOG_DEBUG);
                this.input(INPUT_TARGET_INRANGE);
            } else {
                this.Log("I'm OUT OF range of you!", LOG_DEBUG);
                this.input(INPUT_TARGET_OUTOFRANGE);
            }

        });

        const LostTarget = this.AddState('LostTarget', () => {

            // TODO: Wait around until bored?
            // Exit all active events (movement)
            this.Log("LostTarget!", LOG_DEBUG);
            if (activeMovement) {
                this.Log("Stopping active movement", LOG_DEBUG);
                activeMovement.stop();
                activeMovement = null;
                isChasing = false;
            }

            this.target = null;
            this.input(INPUT_BORED);
        });

        const Idle = this.states['Idle'];

        ChaseTarget.on(INPUT_TARGET_MOVED).go(ChaseTarget)
                    .on(INPUT_TARGET_INRANGE).go(AttackTarget)
                    .on(INPUT_TARGET_LOST).go(LostTarget);

        AttackTarget.on(INPUT_TARGET_OUTOFRANGE).go(ChaseTarget)
                    .on(INPUT_TARGET_MOVED).go(ChaseTarget)
                    .on(INPUT_TARGET_LOST).go(LostTarget);

        HaveTarget.on(INPUT_TARGET_OUTOFRANGE).go(ChaseTarget)
                    .on(INPUT_TARGET_INRANGE).go(AttackTarget)
                    .on(INPUT_TARGET_LOST).go(LostTarget);

        LostTarget.on(INPUT_BORED).go(Idle);

        Idle.on(INPUT_TARGET).go(HaveTarget)
            .on(INPUT_TARGET_LOST).go(LostTarget);

        this.Idle   = Idle;
        this.state  = Idle;

        const targetMoved = () => {

            if (this.target) {
                // Check range
                // var inRange = movement.inRangeOf(this.target, 1);
                // if (inRange) {
                //  Input(INPUT_TARGET_INRANGE);
                // } else {
                //  Input(INPUT_TARGET_OUTOFRANGE);
                // }
                this.input(INPUT_TARGET_MOVED);
            }
        };

        const getCallbacks = () => {

            const callbacks = {};
            callbacks[EVT_MOVED_TO_NEW_TILE] = targetMoved;
            callbacks[EVT_FINISHED_PATH]     = targetMoved;

            return callbacks;
        };


        const reset = () => {
            this.reset();

            if (activeMovement) {
                activeMovement.stop();
                activeMovement = null;
                isChasing = false;
            }
        };

        // Extend interface with Basic Melee specific stuff
        const _interface = _.defaults(this.interface, {
            reset
        });

        // Subscribe to each callback
        // NOTE: This should be set upon initialization. The combat system will store these subscriptions and
        // apply/clear them from the target when they're added/removed
        const callbacks = getCallbacks();
        for (const evt in callbacks) {
            this.registerCallback(evt, callbacks[evt]);
        }

        return _interface;
    };

    Basic_Melee.prototype = Object.create(Strategy.prototype);
    Basic_Melee.prototype.constructor = Basic_Melee;

    return Basic_Melee;
});
