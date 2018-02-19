define(function(){

	var keys={

		LOG_CRITICAL: 1<<0,
		LOG_ERROR:    1<<1,
		LOG_WARNING:  1<<2,
		LOG_INFO:     1<<3,
		LOG_DEBUG:    1<<4,

		MESSAGE_PROGRAM: 'program',
		MESSAGE_INFO: 'info',
		MESSAGE_GOOD: 'good',
        MESSAGE_BAD: 'bad',

        OPT_BITWISE: 1<<0
	};

	var keyValue = 1,
		_global = (typeof window !== 'undefined' ? window : global),
		keyStrings = {},
		addKey = function(key){
			if (_global[key] !== undefined) {
                Log(`WARNING: KEY ${key} ALREADY DEFINED!`, LOG_WARNING);
				return;
			}
			keys[key] = (keyValue++);
			_global[key]=keys[key];
			keyStrings[keyValue-1] = key;
		}, addKeys = function(keys){
			for (var i=0; i<keys.length; ++i) {
				addKey(keys[i]);
			}
		};

    // NOTE: keys from groups will not be added to keyStrings since those values are shared
    var addKeyGroup = function(group, items, options) {

        keyStrings[group] = {};
        for (var i = 0; i < items.length; ++i) {
            let item = `${group}_${items[i]}`,
                val = i;

            if (options & OPT_BITWISE) {
                val = Math.pow(2, val);
            }

            keys[item] = val;
            _global[item] = val;
            keyStrings[group][val] = key;
        }
    };

	for (var key in keys){
		_global[key] = keys[key];
	}
	_global['addKey'] = addKey;
	_global['addKeys'] = addKeys;
	_global['keyStrings'] = keyStrings;


	// TODO: organize with arrays, {'events':{prefix:'evt',keys:['step','zone','finished_moving',...]}} and automatically add

	/// %%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
	/// WARNING WARNING WARNING WARNING WARNING WARNING WARNING WARNING WARNING

    /// These keys need to be stored in order, they are keys whose values are stored externally (eg.
    //  JSON/DB). If you re-order any of these then you'll need to update those files

	/// WARNING WARNING WARNING WARNING WARNING WARNING WARNING WARNING WARNING
	/// %%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%

    addKeyGroup('ITM', ['USE', 'PICKUP', 'WORN_HELMET', 'WORN_CHEST', 'WIELD_LEFTHAND'], OPT_BITWISE);
    _global['ITM_WEARABLE'] = ITM_WORN_HELMET | ITM_WORN_CHEST | ITM_WIELD_LEFTHAND; // FIXME: Need a cleaner way to do this; would also need it to work within group

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
	addKey('EVT_PATH_PARTIAL_PROGRESS');
	addKey('EVT_CANCELLED_PATH');
	addKey('EVT_TELEPORT');

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
	addKey('EVT_USER_ADDED_PATH');

	addKey('EVT_GET_ITEM');
	addKey('EVT_USE_ITEM');
	addKey('EVT_DROP_ITEM');
    addKey('EVT_INV_USE_SLOT');

	addKey('EVT_INTERACT');
    addKey('EVT_ACTIVATE');
    addKey('EVT_DEACTIVATE');
    addKey('EVT_NETSERIALIZE');


	/// %%%%%%%%%%%%%%%%%%%%%
	/// %%%%%% Misc. Keys
	/// %%%%%%%%%%%%%%%%%%%%%

	addKey('ACTION_NEW_PATH');

	// addKey('HIGH_PRIORITY');
	addKey('LOW_PRIORITY');
	addKey('EVT_UNLOADED');

	addKey('LEFT_TO_RIGHT');
	addKey('UP_TO_DOWN');

	addKey('NORTH');
	addKey('EAST');
	addKey('SOUTH');
	addKey('WEST');

	addKey('EVT_CHAT');

    addKey('CMD_MESSAGE');
    addKey('CMD_ADMIN');
    addKey('CMD_BAD_COMMAND');
    addKey('CMD_ADMIN_GAIN_XP');
    addKey('CMD_ADMIN_SUICIDE');
    addKey('CMD_ADMIN_GIVE_BUFF');
    addKey('CMD_ADMIN_CRASH');
    addKey('CMD_ADMIN_HEAL');
    addKey('CMD_ADMIN_RAND_HEALTH');
    addKey('CMD_ADMIN_DAMAGE_ENTITY');
    addKey('CMD_ADMIN_TELEPORT');
    addKey('CMD_CRASH');

	addKey('HOOK_INTO_MAP');

	addKey('PAGE_SERIALIZE_BASE');
	addKey('PAGE_SERIALIZE_MOVABLES');

	addKey('ADJACENT_RANGE'); // Pathfinding
	addKey('ALREADY_THERE');
	addKey('PATH_TOO_FAR');

	addKey('CLIENT_ONLY'); // Interactable handlers
	addKey('SERVER_ONLY');
	addKey('CLIENT_AND_SERVER');

	addKey('BAD_POSITION'); // User error
	addKey('BAD_COORDINATES'); 

	addKey('BOT_CONNECT'); // Bot commands
	addKey('BOT_SIGNUP');
	addKey('BOT_MOVE');
    addKey('BOT_INQUIRE');
    addKey('BOT_SET_DEBUGURL');

    addKey('INQUIRE_MAP'); // Bot inquiries
    addKey('INQUIRE_NAME');

	addKey('REQ_REGISTER'); // Login requests

	addKey('EVERYTHING'); // Indicator

	addKey('TEST_CHECKJPS'); // Testing

    addKey('EVT_REGENERATE');
    addKey('EVT_GAIN_XP');
    addKey('EVT_GAIN_LEVEL');
    addKey('EVT_UPDATE_XP');
    addKey('EVT_UPDATE_LEVEL');
    addKey('EVT_BUFFED');
    addKey('EVT_BUFFED_PRIVATE');
    addKey('EVT_BUFF_REMOVED_PRIVATE');

    addKey('EFFECT_BUFF');

    addKeyGroup('N', [
        'NULL',
        'HEALTH_CUR', 'HEALTH_MAX', 'HEALTH_CURMAX',
        'STR_CUR', 'STR_MAX', 'STR_CURMAX',
        'CON_CUR', 'CON_MAX', 'CON_CURMAX',
        'DEX_CUR', 'DEX_MAX', 'DEX_CURMAX'
    ]);

	return keys;
});
