define(['eventful'], function(Eventful){ 

	var AIComponent = function(character, initialState){
		extendClass(this).with(Eventful);

		this.entity = character;
		this.state  = new State(initialState);
		this.brain  = character.brain;
	};

	var AIComponents = {
		"Follow": function(character){

			var STATE_IDLE = 0,
				STATE_FOLLOWING = 1,
				STATE_CHASING = 2;

			this.base = AIComponent;
			this.base(character, STATE_IDLE);

			this.target = null;
			this.listenTo(character, EVT_NEW_TARGET, function(me, target){
				this.state.transition(STATE_FOLLOWING);
				this.target = target;
			});

			this.listenTo(character, EVT_REMOVED_TARGET, function(me, oldTarget){
				this.state.transition(STATE_IDLE);
				this.target = null;
			});

			this.step = function(time){

				if (this.state.state == STATE_FOLLOWING) {
					if (this.entity.inRangeOf(this.target)) {
						// Continue following..
					} else {
						this.state.transition(STATE_CHASING);
					}
				}

				if (this.state.state == STATE_CHASING) {

					// Reconsider route??
					if (!this.state.hasOwnProperty('reconsideredRoute') ||
						(time - this.state.reconsideredRoute) > 200) {
						// TODO: different maps? skip this.. continue using same route
						var me           = this,
							you          = this.target,
							page         = this.entity.page,
							map          = page.map,
							myY          = page.y * Env.tileSize + this.entity.posY,
							myX          = page.x * Env.tileSize + this.entity.posX,
							nearestTiles = map.findNearestTiles(myY, myX),
							yourPage     = you.page,
							yourY        = yourPage.y * Env.tileSize + you.posY,
							yourX        = yourPage.x * Env.tileSize + you.posX,
							yourNearTiles= map.findNearestTiles(yourY, yourX),
							toTiles      = map.getTilesInRange( yourNearTiles, 1, true );

						toTiles = toTiles.filter(function(tile){
							return me.entity.tileAdjacentTo(tile, you);
						});
						var	path         = map.findPath(nearestTiles, toTiles);
						if (path) {

							if (path.path) {

								var startTile = path.start.tile,
									recalibrateY = false,
									recalibrateX = false,
									path = path.path;
								if (this.entity.posY / Env.tileSize - startTile.y >= 1) throw "BAD Y assumption";
								if (this.entity.posX / Env.tileSize - startTile.x >= 1) throw "BAD X assumption";
								if (myY - startTile.y * Env.tileSize != 0) recalibrateY = true;
								if (myX - startTile.x * Env.tileSize != 0) recalibrateX = true;

								path.splitWalks();

								if (recalibrateY) {
									// Inject walk to this tile
									var distance    = -1*(myY - startTile.y * Env.tileSize),
										walk        = new Walk((distance<0?NORTH:SOUTH), Math.abs(distance), startTile.offset(0, 0));
									console.log("Recalibrating Walk (Y): ");
									console.log("	steps: "+distance);
									path.walks.unshift(walk);
								}
								if (recalibrateX) {
									// Inject walk to this tile
									var distance    = -1*(myX - startTile.x * Env.tileSize),
										walk        = new Walk((distance<0?WEST:EAST), Math.abs(distance), startTile.offset(0, 0));
									console.log("Recalibrating Walk (X): ");
									path.walks.unshift(walk);
								}

								this.entity.addPath(path);

							} else {
								console.log("Path already within range");
								this.state.transition(STATE_FOLLOWING);
							}
						} else {
							console.log("No path found :(");
							console.log(path);
							console.log("Me: "+myY + "," + myX);
							console.log(nearestTiles);
							console.log("You: "+yourY+","+yourX);
							console.log(yourNearTiles);
							console.log(toTiles);
							process.exit();
						}
						this.state.reconsideredRoute = time;
						console.log("Reconsidered route at @"+this.state.reconsideredRoute);
					}
				}
					
				this.handlePendingEvents();
			};


			this.reset = function(){
				this.state.transition(STATE_IDLE);
				if (this.target) this.stopListeningTo(this.target);
				this.target = null;
			};
		},
		"Combat": function(character){

			var STATE_IDLE = 0,
				STATE_ATTACKING = 1,
				STATE_ANGRY = 2;

			this.base = AIComponent;
			this.base(character, STATE_IDLE);

			this.target       = null;
			this.attackList   = [];
			this.lastAttacked = 0;
			this.attackRange  = 1;
			this.listenTo(character, EVT_AGGRO, function(me, target){
				if (this.target === target) return;
				if (target.physicalState.state !== STATE_ALIVE) return; // Cannot aggro this guy

				var inAttackList = false;
				for (var i=0; i<this.attackList.length; ++i) {
					if (this.attackList[i] === target) {
						inAttackList = true;
						// TODO: move to top of attackList
						break;
					}
				}
				if (!inAttackList) {
					this.attackList.push(target);
				}
				
				if (this.target) {
					// TODO

				}

				console.log("["+this.entity.id+"] Aggro");
				this.brain.setTarget(target);
				this.state.transition(STATE_ATTACKING);
				this.target = target;
				this.setTarget(target);
			});

			this.listenTo(character, EVT_ATTACKED, function(me, target){

				console.log("["+this.entity.id+"] Attacked");
				if (this.target === target) return;
				if (target.physicalState.state !== STATE_ALIVE) return; // He's already died since the attack
				if (!this.target) {
					this.brain.setTarget(target);
					this.state.transition(STATE_ATTACKING);
					this.target = target;
				}

				var inAttackList = false;
				for (var i=0; i<this.attackList.length; ++i) {
					if (this.attackList[i] === target) {
						inAttackList = true;
						break;
					}
				}
				if (!inAttackList) {
					this.attackList.push(target);
				}

				this.setTarget(target);
			});

			this.setTarget = function(target){

				console.log("["+this.entity.id+"] I'm attacking ["+target.id+"]");
				this.target = target;

				this.listenTo(target, EVT_DIED, function(target){

					this.attackList = _.reject(this.attackList, function(thisGuy){ 
						console.log("_.reject: thisGuy.id("+thisGuy.id+") !== target.id("+target.id+")");
						return thisGuy.id == target.id;
					});

					console.log("["+this.entity.id+"] WHELP I suppose he's dead now..");
					console.log(this.attackList);
					this.stopListeningTo(target);

					if (this.attackList.length) {
						this.target = this.attackList[0];
						this.brain.setTarget(this.target);
						this.state.transition(STATE_ATTACKING);
					} else {
						this.brain.setTarget(null);
						this.state.transition(STATE_IDLE);
						this.target = null;
					}
				}, HIGH_PRIORITY);
			};

			this.listenTo(character, EVT_NEW_TARGET, function(me, attacker){
				console.log("["+this.entity.id+"] Found new target");
				if (this.target === attacker) return; // NOTE: we most likely set this ourselves already
				this.setTarget(attacker);
			});

			this.listenTo(character, EVT_REMOVED_TARGET, function(me, oldTarget){
				if (this.target === oldTarget) {
					console.log("Removing target");
					this.state.transition(STATE_IDLE);
					this.attackList=[];
					this.target = null;
				}
			});

			this.step = function(time){
				if (this.state.state === STATE_ATTACKING) {
					if (!this.target) throw new UnexpectedError("ERROR: Attacking when there is no target");
					if (time - this.lastAttacked > 750) {
						if (this.entity.inRangeOf(this.target)) {
							// Attack
							this.target.hurt(10, this.entity);
							console.log("Hurt target by 10");
							this.lastAttacked = time;
							this.entity.triggerEvent(EVT_ATTACKED_ENTITY, this.target); // TODO: this should be EVT_ATTACKED
						}
					}
				}

				this.handlePendingEvents();
			};

			this.reset = function(){
				this.state.transition(STATE_IDLE);
				if (this.target) this.stopListeningTo(this.target);
				this.target = null;
				this.attackList = [];
				this.lastAttacked = 0;
			};
		}
	};

	/* AI
	 *
	 * Responsible for being the brain of the entity
	 ***********************************************/
	var CoreAI = function(entity){
		extendClass(this).with(Eventful);

		var STATE_IDLE = 1,
			STATE_TARGET = 2,
			STATE_MINDLESS = 3;

		this.entity = entity;
		this.state  = new State(STATE_IDLE);
		this.target = null;
		this.components = [];

		this.setTarget = function(target){
			if (this.state.state === STATE_MINDLESS) return; 

			if (this.target) {
				this.entity.triggerEvent(EVT_REMOVED_TARGET, this.target);
			}

			this.target = target;
			if (target) {
				this.entity.triggerEvent(EVT_NEW_TARGET, target);
			}
		};
		
		this.step = function(time){
			if (this.state.state === STATE_MINDLESS) return;

			for (var i=0; i<this.components.length; ++i) {
				this.components[i].step(time);
			}

			this.handlePendingEvents();
		};

		this.addComponent = function(Component){
			this.components.push(new Component(this.entity));
		};

		this.reset = function(){
			this.state.transition(STATE_IDLE);
			this.target = null;
			this.pendingEvents=[];

			for (var i=0; i<this.components.length; ++i) {
				this.components[i].reset();
				this.components[i].pendingEvents=[];
			}
		};
	};


	return {
		Core: CoreAI,
		Components: AIComponents,
	};
});
