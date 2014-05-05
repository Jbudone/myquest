define(function(){

	var keys={
		EVT_STEP:1,
		EVT_ZONE:2,
		EVT_FINISHED_MOVING:3,
		EVT_CANCEL_PATH:4,
		EVT_FINISHED_PATH:5,
		EVT_FINISHED_WALK:6,

		EVT_NEW_PATH:7,
		EVT_PREPARING_WALK:8,

		EVT_LOGIN:9,
		EVT_REQUEST_MAP:10,

		EVT_ADDED_ENTITY:11,
		EVT_PAGE_EVENTS:12,
		EVT_REMOVED_ENTITY:13,
		EVT_DISCONNECTED:14,
		EVT_ZONE_OUT:15,

		EVT_ATTACKED:16,
		EVT_REROUTING:17,

		ACTION_NEW_PATH:1,

		HIGH_PRIORITY:1,

		LEFT_TO_RIGHT:1,
		UP_TO_DOWN:2,

		NORTH:1,
		EAST:2,
		SOUTH:3,
		WEST:4,

		PAGE_SERIALIZE_BASE:1,
		PAGE_SERIALIZE_MOVABLES:2,
	};

	// TODO: organize with arrays, {'events':{prefix:'evt',keys:['step','zone','finished_moving',...]}} and automatically add

	var global = (typeof window !== 'undefined' ? window : GLOBAL);
	for(var key in keys) {
		global[key]=keys[key];
	}

	return keys;
});
