var __scriptInject_definedVar = function(){
    var definedKeys = {};

    return function(key,registerKey){
        if (registerKey) {
            definedKeys[key] = true;
        } else {
            if (!definedKeys.hasOwnProperty(key)) {
                // Uh oh, we've added a new scripting key but forgot to declare it here
                // NOTE: Unbuilt scripts have the /*SCRIPTINJECT*/ placeholder; these are replaced with the actual
                // SCRIPT.INJECTION.js with build-scripts. If we modify SCRIPT.INJECTION.js then we'll need to rebuild
                // scripts from scratch (to get the /*SCRIPTINJECT*/ placeholder back)
                throw new Error("We've added a new scripting variable ("+key+") but forgot to declare it in SCRIPT.INJECTION.js. Also may need to remove and rebuild scripts with build-scripts (rm -r dist/scripts && ./build-scripts)");
            }
        }
    };
}();

if (Env.isServer) {
    var world; __scriptInject_definedVar('world', true);
    var redis; __scriptInject_definedVar('redis', true);
    var Rules; __scriptInject_definedVar('Rules', true);
    var Buffs; __scriptInject_definedVar('Buffs', true);
    var Items; __scriptInject_definedVar('Items', true);
    var Quests; __scriptInject_definedVar('Quests', true);
    var Interactions; __scriptInject_definedVar('Interactions', true);
    var TestingData; __scriptInject_definedVar('TestingData', true);
} else {
    var player; __scriptInject_definedVar('player', true);
    var UI;     __scriptInject_definedVar('UI', true);
    var user;   __scriptInject_definedVar('user', true);
    var server; __scriptInject_definedVar('server', true);
    var area;   __scriptInject_definedVar('area', true);
    var Rules; __scriptInject_definedVar('Rules', true);
    var Buffs; __scriptInject_definedVar('Buffs', true);
    var Items; __scriptInject_definedVar('Items', true);
    var Quests; __scriptInject_definedVar('Quests', true);
    var Interactions; __scriptInject_definedVar('Interactions', true);
    var TestingData; __scriptInject_definedVar('TestingData', true);
}

eval(SCRIPTINJECT);
