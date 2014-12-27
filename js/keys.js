define(function(){

	var keys={

		LOG_CRITICAL: 1<<0,
		LOG_ERROR:    1<<1,
		LOG_WARNING:  1<<2,
		LOG_INFO:     1<<3,
		LOG_DEBUG:    1<<4,

		MESSAGE_PROGRAM: 'program',
		MESSAGE_INFO: 'info',
	};

	var keyValue = 1,
		global = (typeof window !== 'undefined' ? window : GLOBAL),
		addKey = function(key){
			if (global[key] !== undefined) {
				console.error("ERROR: KEY ["+key+"] ALREADY DEFINED!");
				return;
			}
			console.log("Adding key ["+key+"]");
			keys[key] = (keyValue++);
			global[key]=keys[key];
		}, addKeys = function(keys){
			for (var i=0; i<keys.length; ++i) {
				addKey(keys[i]);
			}
		};

	for (var key in keys){
		global[key] = keys[key];
	}
	global['addKey'] = addKey;
	global['addKeys'] = addKeys;


	// TODO: organize with arrays, {'events':{prefix:'evt',keys:['step','zone','finished_moving',...]}} and automatically add

	/// %%%%%%%%%%%%%%%%%%%%%
	/// %%%%%% Event IDs
	/// %%%%%%%%%%%%%%%%%%%%%

	addKey('EVT_ATTACK');
	addKey('EVT_STEP');
	addKey('EVT_ZONE');
	addKey('EVT_FINISHED_MOVING');
	addKey('EVT_CANCEL_PATH');
	addKey('EVT_FINISHED_PATH');
	addKey('EVT_FINISHED_WALK');

	addKey('EVT_NEW_PATH');
	addKey('EVT_PREPARING_WALK');

	addKey('EVT_LOGIN');
	addKey('EVT_REQUEST_MAP');

	addKey('EVT_ADDED_ENTITY');
	addKey('EVT_PAGE_EVENTS');
	addKey('EVT_REMOVED_ENTITY');
	addKey('EVT_DISCONNECTED');
	addKey('EVT_ZONE_OUT');

	addKey('EVT_ATTACKED');
	addKey('EVT_REROUTING');
	addKey('EVT_DIED');
	addKey('EVT_NEW_TARGET');
	addKey('EVT_ATTACKED_ENTITY');
	addKey('EVT_REMOVED_TARGET');
	addKey('EVT_AGGRO');
	addKey('EVT_NEW_CHARACTER');
	addKey('EVT_DISTRACTED');
	addKey('EVT_TARGET_ZONED_OUT');
	addKey('EVT_MOVED_TO_NEW_TILE');
	addKey('EVT_MOVING_TO_NEW_TILE');
	addKey('EVT_BORED');
	addKey('EVT_RESPAWNING');
	addKey('EVT_RESPAWNED');

	addKey('EVT_GET_ITEM');


	/// %%%%%%%%%%%%%%%%%%%%%
	/// %%%%%% Misc. Keys
	/// %%%%%%%%%%%%%%%%%%%%%

	addKey('ACTION_NEW_PATH');

	addKey('HIGH_PRIORITY');

	addKey('LEFT_TO_RIGHT');
	addKey('UP_TO_DOWN');

	addKey('NORTH');
	addKey('EAST');
	addKey('SOUTH');
	addKey('WEST');

	addKey('EVT_TESTJB');

	addKey('HOOK_INTO_MAP');

	addKey('PAGE_SERIALIZE_BASE');
	addKey('PAGE_SERIALIZE_MOVABLES');

	addKey('ADJACENT_RANGE'); // Pathfinding

	return keys;
});
