define(['eventful'], function(Eventful){

	var AI = function(entity){
		extendClass(this).with(Eventful);

		var STATE_ALIVE = 0,
			STATE_UNCONSCIOUS = 1,
			STATE_DYING = 2,
			STATE_DEAD = 3,
			STATE_IDLE = 4,
			STATE_WALKING = 5,
			STATE_ATTACKING = 6,
			STATE_CHASING = 7,
			STATE_ANGRY = 8;

		var State = function(state, params){
			this.state = state;
			if (typeof params == "object") {
				for (var param in params) {
					this[param] = params[param];
				}
			}
			this.transition = function(newState){
				this.state = newState;
			}
		};

		var Im = this,
			In = function(state) {
				return (this.physicalState == state || this.mentalState == state);
			};


		this.entity        = entity;
		this.physicalState = new State(STATE_ALIVE);
		this.mentalState   = new State(STATE_IDLE);
		this.attackList    = [];

		this.inRangeOf     = function(target){
			var me           = this,
				page         = this.entity.page,
				map          = page.map,
				myY          = page.y * Env.tileSize + this.entity.posY,
				myX          = page.x * Env.tileSize + this.entity.posX,
				yourPage     = target.page,
				yourY        = yourPage.y * Env.tileSize + target.posY,
				yourX        = yourPage.x * Env.tileSize + target.posX;
			if (parseInt(yourY/Env.tileSize) !== parseInt(myY/Env.tileSize) ||
				parseInt(yourX/Env.tileSize) !== parseInt(myX/Env.tileSize)) {

				return false;  // Same tile
			}
			// TODO: radius
			// TODO: tiles in the way
			return true;
		};
		
		// Physical transition states
		this.listenTo(entity, EVT_ATTACKED, function(me, attacker, damage){
			if (this.physicalState.state == STATE_ALIVE) {
				if (me.health <= 0) {
					// TODO: die..
				} else {
					console.log("I'm being attacked!! ["+me.id+"]");
					
					// add to attack list
					var inAttackList = false;
					for (var i=0; i<this.attackList.length; ++i) {
						if (this.attackList[i] == attacker) {
							inAttackList = true;
							break;
						}
					}

					if (!inAttackList) {
						console.log("I'm attacking ["+attacker.id+"]");
						this.attackList.push(attacker);
					}

					// Currently not attacking or chasing anybody
					if (!(this.mentalState.state == STATE_ATTACKING ||
						this.mentalState.state == STATE_CHASING)) {
						// Start attacking
						console.log("I'm attacking now");
						this.mentalState = new State(STATE_ATTACKING, { target: attacker });
					}
				}
			}
		});

		this.step=function(time){
			if (this.physicalState.state == STATE_ALIVE) {
				if (this.mentalState.state == STATE_ATTACKING) {
					// TODO: attack if possible (range? time?)
					console.log("Are you in range?");
					if (this.inRangeOf(this.mentalState.target)) {
						// TODO: time to attack?
						console.log("You're in range..");
					} else {
						console.log("I'm chasing you");
						this.mentalState.transition(STATE_CHASING);
					}
				}

				if (this.mentalState.state == STATE_CHASING) {
					if (!this.mentalState.hasOwnProperty('reconsideredRoute') ||
						(time - this.mentalState.reconsideredRoute) < 200) {
							console.log("Routing path to enemy..");
							// TODO: different maps? skip this.. continue using same route
							// TODO: include tile radius search
							var me           = this,
								you          = this.mentalState.target,
								page         = this.entity.page,
								map          = page.map,
								myY          = page.y * Env.tileSize + this.entity.posY,
								myX          = page.x * Env.tileSize + this.entity.posX,
								nearestTiles = map.findNearestTiles(myY, myX),
								yourPage     = you.page,
								yourY        = yourPage.y * Env.tileSize + you.posY,
								yourX        = yourPage.x * Env.tileSize + you.posX,
								yourNearTiles= map.findNearestTiles(yourY, yourX),
								path         = map.findPath(nearestTiles, yourNearTiles);
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

									this.entity.path = path;

								} else {
									console.log("Path already within range");
								}
							} else {
								console.log("No path found :(");
							}
							this.mentalState.reconsideredRoute = time;
							// TODO: consider route to enemy :: map should listen to AI-enabled entity for EVT_REROUTING :: (target, radius of places to run, max path distance, callback { false OR path })
							// this.triggerEvent(EVT_REROUTING, this.mentalState.target, 0, 10, function(results){
							// 	if (results && results.path) {
							// 		me.entity.path = results.path;
							// 	} else {
							// 		console.log("No new good path found.. giving up");
							// 		me.entity.path = null;
							// 	}
							// });
						}
					}
				}
			this.handlePendingEvents();
		}
	};


	return AI;
});
