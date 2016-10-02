define(function(){

	// Player Combat strategy
	// 
	// Player strategy is handled through the server in order to avoid repeated requests, resending/retrying
	// attacks when server side needs to catch up to player position, etc. Client will be responsible for
	// setting the target, and will accept broadcasted movements/attacks
	//
	//	TODO: combat to set/unset target
	//	TODO: chasing/attacking FSM
	//	TODO: make sure server sending player move events get received & handled on client
	//	TODO: client ignore spam-clicking enemy to set target


	addKey('INPUT_TARGET_MOVED');
	addKey('INPUT_TARGET_OUTOFRANGE');
	addKey('INPUT_TARGET_INRANGE');
	addKey('INPUT_TARGET_LOST');
	addKey('INPUT_TARGET');
	addKey('INPUT_BORED');
	addKey('INPUT_HANDLED');
	
	var State = function(name, init, step){

		this.name = name;
		this.init = init || function(){};
		this.step = step || function(){};

		var inputs={},
			callbacks={};
		this.input = function(ipt){
			var action = null;

			if (callbacks[ipt]){
				callbacks[ipt]();
				action = INPUT_HANDLED;
			}

			if (inputs[ipt]) {
				action = inputs[ipt];
			}

			return action;
		};

		this.on = function(ipt){
			return {
				go: function(action){
					inputs[ipt] = action;
					return _interface;
				},
				doNothing: function(){
					callbacks[ipt] = function(){};
					return _interface;
				}
			};
		};

		var _interface = {

			name: this.name,
			init: this.init,
			step: this.step,
			input: this.input,

			on: this.on,
			debug: function(){
				console.log("State ("+ this.name +") inputs");
				console.log("==============");
				for(var ipt in inputs){
					console.log("	Input[" + keyStrings[ipt] + "]: ");
					console.log(inputs[ipt]);
				}
				console.log("==============");
			}
		};

		return _interface;
	};

	// Basic Melee
	//
	// The most simple combat strategy used for npcs. Simply chase/attack the current target
	var Basic_Melee = function(combat, _character){

		var target = null,
			state = null,
			tickNextUpdate = false,
			isChasing = false;

		var timeSinceLastAttack = now(); // NOTE: Do NOT reset this since we could potentially repeatedly go
										//			in/out of this strategy because of chasing after target
										//			and being much faster than target

		var melee = combat.ability('melee'),
			movement = combat.require('movement');

		var TickNextUpdate = function(){ tickNextUpdate = true; };

		var activeMovement = null; // Our current movement object

		var ChaseTarget = new State('ChaseTarget', function(){
			// init
			console.log("Player: Attempting to chase you..");

			// Stop our current chasing
			if(isChasing || activeMovement){
				isChasing = false;
				console.log("Player: Cancelling chase first");
				// movement.stopChasing(target);

				activeMovement.stop();
				activeMovement = null;
			}

			var fromTile = _character.entity.position.tile,
				toTile   = target.entity.position.tile,
				fromReal = _character.entity.position.global,
				toReal   = target.entity.position.global;
			console.log("Player:  ChaseTarget: ("+fromTile.x+", "+fromTile.y+") ==> ("+toTile.x+", "+toTile.y+")");
			console.log("			(Real): ("   +fromReal.x+", "+fromReal.y+") ==> ("+toReal.x+", "+toReal.y+")");

			// Begin chasing
			// NOTE: If we're already in range then chase will succeed immediately. Do not check if we're
			// in range without attempting to chase since the target may be in range (while we're moving)
			// and halt our current path before we get to the center of the tile
			isChasing = true;
			var maxWalk = 400; // FIXME: Env this.. should be based off seconds to reach target and laziness factor of npc
			activeMovement = movement.chase(target, { range: 1 }, maxWalk).then(function(){
				console.log("Player: Caught up to you!");

				isChasing = false;
				activeMovement = null;
				input(INPUT_TARGET_INRANGE, target);
			}, function(e){

				// NOTE: We may have cancelled this chase/path in order to start a new one (eg. target has
				// moved and we need to chase again)
				// The path may have also failed right off the bat (eg. path exceeded maxWalk)
				if (isChasing) {
					console.log("Player: Fuck it");
					activeMovement = null;
					isChasing = false;
				} else {
					activeMovement = null; // TODO: Need to do this in both places? Or can we just unset these after the input
					isChasing = false;
				}

				// If we couldn't find a path to the target or its simply too far then forget the target
				if (!e || e == PATH_TOO_FAR) {
					combat.forgetTarget(target);
				}
			});
		});

		var AttackTarget = new State('AttackTarget', function(){}, function(){
			// step
			// TODO: Abstract attack timing
			var _now = now();
			if (_now - timeSinceLastAttack > 1000) {
				var options = { range: 1 };
				if (movement.inRangeOf(target, options)){
					timeSinceLastAttack = _now;
					melee.attackTarget(target);
					console.log("Player: Attempting to attack you..");
				} else {
					timeSinceLastAttack = _now;
					console.log("Player: Wtf you're too far?! I can't hit you");
				}
			}

		});

		var HaveTarget = new State('HaveTarget', function(){
			// init

			var options = { range: 1 };
			if (movement.inRangeOf(target, options)){
				console.log("Player: I'm in range of you!");
				input(INPUT_TARGET_INRANGE);
			} else {
				console.log("Player: I'm OUT OF range of you!");
				input(INPUT_TARGET_OUTOFRANGE);
			}

		});

		var LostTarget = new State('LostTarget', function(){

			// TODO: Wait around until bored?
			// Exit all active events (movement)
			console.log("LostTarget!");
			if (activeMovement) {
				console.log("Stopping active movement");
				activeMovement.stop();
				activeMovement = null;
				isChasing = false;
			}

			target = null;
			input(INPUT_BORED);
		});

		var Idle = new State('Idle', function(){
			// init

		});

        // FIXME: Add this state separately
		var ClientHaveTarget = new State('ClientHaveTarget', function(){
			// We're the client player with a target. Since the player combat FSM is handled on the server,
			// simply do nothing here until we lose our target

		});
		
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


		
        // FIXME: Add this
		if (Env.isServer) {
			Idle.on(INPUT_TARGET).go(HaveTarget)
				.on(INPUT_TARGET_LOST).go(LostTarget);
		} else {
			Idle.on(INPUT_TARGET).go(ClientHaveTarget)
				.on(INPUT_TARGET_LOST).go(LostTarget);
		}

		ClientHaveTarget.on(INPUT_TARGET_LOST).go(Idle)
						.on(INPUT_TARGET_MOVED).doNothing();


		var step = function(){

			// if (this.tickNextUpdate){
			// 	//this.tickNextUpdate = false;
			 	state.step();
			// }
		};

		var Input = function(input){
			var action = state.input(input),
				oldName = state.name,
				newName = action ? action.name : "NULL";

			console.log("====[ Player Melee State ]==================");

			if (action === INPUT_HANDLED) {
				console.log("	State  ("+ oldName +")[" + keyStrings[input] + "]  Handled within state");
			} else if (action) {

				console.log("	Transition  (" + oldName + ")[" + keyStrings[input] + "] ====>  " + newName);
				state = action;

				//TickNextUpdate();
				state.init(); // FIXME: add args OR store everything in here?

				if (action == Idle) {
					finished();
				}

				return action;
			} else {
				state.debug();
				throw new Error("State ("+ oldName +") did not have input for " + keyStrings[input]);
			}
		};

		var input = Input;
		var state = Idle;

		var finished = function(){};

		var reset = function(){

			console.log("Resetting state: Idle");
			state = Idle;
			target = null;
			//tickNextUpdate = false;

			if (activeMovement) {
				activeMovement.stop();
				activeMovement = null;
				isChasing = false;
			}
		};

		var setTarget = function(_target){

			target = _target;
			//reset();
			input(INPUT_TARGET);
		};

		var lostTarget = function(){
			Input(INPUT_TARGET_LOST);
		};

		var targetMoved = () => {

			if (target) {
				// Check range
				// var inRange = movement.inRangeOf(target, 1);
				// if (inRange) {
				// 	Input(INPUT_TARGET_INRANGE);
				// } else {
				// 	Input(INPUT_TARGET_OUTOFRANGE);
				// }
				Input(INPUT_TARGET_MOVED);
			}
		};

		var getCallbacks = function(){

			var callbacks = {};
			callbacks[EVT_MOVED_TO_NEW_TILE] = targetMoved;
			callbacks[EVT_FINISHED_PATH] = targetMoved;

			return callbacks;
		};

		var _interface = {

			step: step,

			target: setTarget, // Set/change target
			lostTarget: lostTarget,

			finished: function(callback){ finished = callback; },
			reset: reset

		};

		// Subscribe to each callback
		// NOTE: This should be set upon initialization. The combat system will store these subscriptions and
		// apply/clear them from the target when they're added/removed
		var callbacks = getCallbacks();
		for (var evt in callbacks){
			combat.registerCallback(evt, callbacks[evt]);
		}



		return _interface;
	};

	return Basic_Melee;
});
