// Bot

// Bot class used for testing purposes. This class listens for orders from a test framework

console.log(`Bot Spawned: I am ${process.pid}`);
const filepath = require('path'),
    requirejs  = require('requirejs');

global.__dirname = __dirname; // FIXME: For some reason ErrorReporter  require('path').dirname('')  returns an empty string
const parentDirectory = filepath.dirname(__dirname);

let debugURL = null;

global._global = global;

requirejs.config({
    nodeRequire: require,
    baseUrl: parentDirectory,
    paths: {
        lodash: "https://cdn.jsdelivr.net/lodash/4.14.1/lodash.min.js"
    }
});

const exitingGame = () => {
    console.log("EXITING GAME");
    process.exit();
};

let botName = null;

const BOT_EVT_REMOVED_ENTITY = 1,
      BOT_EVT_ADDED_ENTITY   = 2;


global.DEBUGGER = (msg) => {
    const e = (new Error());
    if (!msg) msg = 'Debug: ' + e.stack.split('\n')[2];
    console.log(msg);

    // Print out line for error (for quick reference)
    const stackFrame = ErrorReporter.parseError(e),
        source       = stackFrame.stack[2].source

    let failedCheckSource = "";
    let startIdx = source.indexOf(msg);
    let mapSource = null;
    if (startIdx >= 0) {

        // OBJECT_TYPES.includes(typeof path.destination) || DEBUGGER("ERROR MESSAGE HERE: 359 (dist/js/server/player.js)");
        // (OBJECT_TYPES.includes(typeof The.player.cancelPath) || DEBUGGER("ERROR MESSAGE HERE: 363 (dist/js/scripts/game.js)")) && "The.player.cancelPath();";
        let idx = 0, starts = [];
        if (source[0] === '(') {
            for (let i = 0; i < startIdx; ++i) {
                if (source[i] === '(') starts.unshift(i);
                else if (source[i] === ')') starts.shift();
            }
            idx = starts[starts.length - 1] + 1;
        }
        failedCheckSource = source.substr(idx, startIdx - idx - " || DEBUGGER(".length);
        console.log(`${chalk.bold.red(failedCheckSource)}`);
            
        // FIXME: This is working BUT source appended to DEBUGGER is probably wrong (loc isn't accurate in preproAST)
        console.log(`${chalk.bold.red("WARNING WARNING WARNING: SOURCE PROBABLY INACCURATE -- PLEASE FIX LOC IN preprocessAST.js")}`);
        mapSource = source.match(/&&\s*"(?<src>((\\")*|[^"])*)"\s*;\s*$/)
        if (mapSource && mapSource.groups && mapSource.groups.src) {
            console.log(`${chalk.bold.red(mapSource.groups.src)}`);
        }
    }


    waitForInspector();
};

const waitForInspector = () => {


    const prompt = () => {

        const fd = fs.openSync('/dev/tty', 'rs');

        //const wasRaw = process.stdin.isRaw;
        //if (!wasRaw) { process.stdin.setRawMode(true); }

        let char = null;
        while (true) {
            const buf = new Buffer(3);
            const read = fs.readSync(fd, buf, 0, 3);

            // if it is not a control character seq, assume only one character is read
            char = buf[read-1];

            // catch a ^C and return null
            if (char == 3){
                process.stdout.write('^C\n');

                char = null;
                break;
            }

            if (read > 1) { // received a control sequence
                continue; // any other 3 character sequence is ignored
            }

            break;
        }

        fs.closeSync(fd);
        //process.stdin.setRawMode(wasRaw);
        return char;
    };

    console.log("Bark: listening to input now");
    Bot.tellMaster('input');

    let n = prompt();

    console.log("Bark: I cant haer you");
    Bot.tellMaster('noinput');
    if (n !== null) {
        const inspector = require('inspector');
        console.log(chalk.red.bold("Waiting for inspector.."));
        inspector.open(9229, "127.0.0.1", true); // port, host, block
        debugger;
    }
};

const errorInGame = (e) => {

    console.error("Error in game");

    console.log(e);
    if (e) {
        waitForInspector();
    }

    if (global['DumpLog']) DumpLog();

    if (botName) {
        console.log(`  I am ${botName}: Entity ${The.player.id}`);
    }

    if (console.trace) console.trace();


    // Error Reporting
    // Report as much as possible
    if (global.ErrorReporter && e) {

        global.ErrorReporter.printStack(e);

        // FIXME: There should be an array or object of items we intend to dump
        const dump = {
            'area': The.area
        };

        global.ErrorReporter.report(e, dump);
    } else {
        console.error("No error reporter yet!");
    }

    //debugger;

    // Just in case the above promises take too long
    setTimeout(() => {
        //process.exit(e);
        Bot.tellMaster('error');
    }, 3000);

    /*
    if (debugURL) {
        const exec = require('child_process').exec;
        const result = exec('/usr/bin/chromium --app ' + debugURL, (error, stdout, stderr) => {
            if (error) {
                console.error(`exec error: ${error}`);
                return;
            }
            console.log(`stdout: ${stdout}`);
            console.log(`stderr: ${stderr}`);
        });

        console.log(result);

        debugger;
    }
    */
};

global.errorInGame = errorInGame;

// If anything happens make sure we go through the common error/exit routine
process.on('exit', exitingGame);
process.on('SIGTERM', exitingGame);
process.on('SIGINT', exitingGame);
process.on('uncaughtException', errorInGame);





const util          = require('util'),
    _               = require('lodash'),
    fs              = require('fs'),        // TODO: Promisify this
    Promise         = require('bluebird'),
    http            = require('http'),
    WebSocket       = require('ws'),
    chalk           = require('chalk'),
    prettyjson      = require('prettyjson'),
    assert          = require('assert'),    // TODO: Disable in production
    SourceMap       = require('source-map');


global.util = util;
global._ = _;
global.Promise = Promise;
global.chalk = chalk;
global.prettyjson = prettyjson;
global.assert = assert;
global.WebSocket = WebSocket;
global.fs = fs;
global
global.localStorage = (new function(){
    this.setItem = () => {};
    this.getItem = () => undefined;
}());

const Bot = (new function(){

    this.tellMaster = (msg, args) => {
        // NOTE: Its possible that we've lost our connection with the master
        try {
            this.log("tellMaster: ");
            this.log(msg);
            this.log(args);
            process.send({msg, args});
        } catch(e) {
            console.error(e);
        }
    };

    // NOTE: We may want a different colour for each bot for easier viewing/distinguishing between bots
    this.log = (msg) => {
        console.log(`     ${chalk.green(msg)}`);
    };

    this.onCommand = (command, callback) => {
        commands[command] = new Command(command, callback);
    };

    const Command = function(cmd, callback) {
        this.cmd = cmd;
        this.callback = callback;
    };

    const commands = {

    };

    process.on('message', (msg) => {
        this.log("BOT: Received message from master:");
        this.log(msg);
        commands[msg.command].callback(msg);
    });

}());


requirejs(['keys', 'environment'], (Keys, Environment) => {

    // Initialize our environment as the server
    const Env = (new Environment());
    Env.isBot = true;
    global.Env = Env;

    requirejs(
        [
            'objectmgr', 'utilities', 'extensions', 'event', 'errors', 'fsm', 'profiler'
        ],
        (
            The, Utils, Ext, Events, Errors, FSM, Profiler
        ) => {

            global.Ext = Ext;
            global.The = The;
            global.Profiler = Profiler;

            global.window = global;

            // TODO: use Object.assign (when you can upgrade node)
            _.assign(global, Utils);
            _.assign(global, Events);
            _.assign(global, Errors);
            _.assign(global, FSM);

            // FIXME: Necessary?
            for(let i = 0; i < FSM['states'].length; ++i) {
                global[FSM.states[i]] = i;
            }



            // Load extensions
            // This is our environment context, used to extend loaded classes with their client/server counterpart
            Ext.ready(Ext.CLIENT | Ext.TEST | Ext.CLIENT_TEST | Ext.TEST_USESERVER).then(() => {


                // Main module
                // This is the starting point for the client. Main is responsible for initializing core modules, loading resources,
                // establishing a connection with the server, and initializing the game
                requirejs(
                    [
                        'errorReporter',
                        'resources', 'loggable', 'profiler', 'webworker',
                        'client/serverHandler', 'client/user', 'client/game'
                    ],
                    (
                        ErrorReporter,
                        Resources, Loggable, Profiler, WebWorker,
                        ServerHandler, User, GameClient
                    ) => {

                        try {

                            extendClass(window).with(Loggable);
                            Log = Log.bind(window);
                            SuppressLogs(true);
                            window.setLogPrefix('Main');


                            /*
                            const errorInGame = (e) => {

                                Log(e, LOG_ERROR);
                                debugger;
                                console.error(e.stack);
                                if (console.trace) console.trace();

                                // FIXME: stop game! unexpected and uncaught error..
                                exitingGame();
                            };
                            */


                            // Assertion
                            const assert = (expr, message) => {
                                if (!expr) {
                                    console.log(message);
                                    DEBUGGER();
                                    throw Err(message);
                                }
                            };



                            window.errorInGame   = errorInGame;
                            window.assert        = assert;
                            window.Profiler      = Profiler;
                            window.ErrorReporter = ErrorReporter;
                            window.WebWorker     = WebWorker;


                            // ------------------------------------------------------------------------------------------------------ //
                            // ------------------------------------------------------------------------------------------------------ //



                            const Game = new GameClient();


                            // Module Loading
                            // The game depends on certain modules being loaded and initialized before the game can run.
                            //
                            // Core: Core scripts which need to be initialized before we can begin loading resources. In particular the
                            //          extensions need to be initialized to the local environment (client vs. server). When resources
                            //          begin loading/initializing and are extended with their client/server specific counterpart, they
                            //          depend on the extensions being ready to determine which counterpart to load and extend
                            //
                            // Resources: Scripts and content
                            //
                            // Connection: Setup the server handler and connect to the server
                            //
                            // Initialize: Our core/context is defined, resources have been loaded, a connection has been established,
                            //              we are now free to initialize the game
                            //
                            //
                            // All of this works by keeping track of our loading phase and executing `loading('moduleToLoad')`, then
                            // when the module is ready run `loaded('moduleToLoad')`. This way we can have multiple things loading and
                            // not move to the next phase until we've completed loading everything.
                            //
                            //
                            // TODO: Restructure the module loading to utilize promises
                            // TODO: This code is (mostly) duplicated for both client/server; find a way to better abstract this
                            const modulesToLoad        = {},
                                LOADING_CORE           = 1,
                                LOADING_RESOURCES      = 2,
                                LOADING_CONNECTION     = 3,
                                LOADING_INITIALIZATION = 4;

                            let ready                  = false,
                                loadingPhase           = LOADING_CORE,
                                initializeGame         = null,
                                server                 = null,
                                loadResources          = null,
                                connectToServer        = null,
                                retryConnection        = null,
                                startBot               = null;

                            // Loading a module
                            // Add to the list of modules currently being loaded
                            const loading = (module) => {
                                modulesToLoad[module] = false;
                            };

                            // Loaded a module
                            // Remove from the list of modules currently being loaded. If we have no more modules that we're waiting on
                            // then go to to the next loading phase
                            const loaded = (module) => {
                                if (module) {
                                    if (module in modulesToLoad) {
                                        Log(`Loaded module: ${module}`);
                                        delete modulesToLoad[module];
                                    } else {
                                        Log(`Loaded module which was not previously being loaded: ${module}`, LOG_ERROR);
                                    }
                                }

                                if (ready && _.size(modulesToLoad) === 0) {
                                    ++loadingPhase;
                                    if (loadingPhase === LOADING_RESOURCES) loadResources();
                                    else if (loadingPhase === LOADING_CONNECTION) connectToServer();
                                    else if (loadingPhase === LOADING_INITIALIZATION) initializeGame();
                                }
                            };

                            // Retry loading to the server
                            // FIXME: Currently this isn't working at all
                            retryConnection = () => {

                                loadingPhase = LOADING_RESOURCES;
                                loaded();
                            };

                            // Connection Initialization
                            // Create our server handler and attempt to establish a connection with the server
                            connectToServer = () => {

                                server = new ServerHandler();

                                const link = Env.connection.websocket;

                                server.onDisconnect = () => {
                                    Log("Disconnected from server..");

                                    if (window.hasConnected) {
                                        // Server D/C'd
                                        Disconnected("Server has disconnected", "Please try refreshing the page and starting again", "NOTE: it may take a moment for the server to come back online");
                                    } else {
                                        Disconnected("Server is not online", "Please try coming back later when the server is back online (it usually takes a few seconds)");
                                    }

                                    // TODO: Make a better cleanup routine. It might be worth it to keep a list of modules which need to
                                    // be unhooked and unloaded here. They could be "Registered" to the list when instantiating them
                                    if (The.user) {
                                        The.user.unhookAllHooks();

                                        The.user.unload();
                                        The.area.unload();

                                        Game.disconnected();
                                    }

                                    server.websocket.close();
                                    delete server.websocket; // FIXME: anything else to do for cleanup?

                                    $('.movable-ui').remove();
                                    The.UI.unload();
                                    delete The.UI;

                                    delete The.renderer;

                                    process.exit();
                                };

                                let postLoginCallback = function() {};

                                server.onLogin = (player) => {

                                    Log(`Logged in as player ${player.id}`);

                                    ready = false;

                                    postLoginCallback();
                                    Game.loadedPlayer(player);

                                    Log("Requesting area..");
                                    server.requestArea();
                                    loading('area');
                                    ready = true;
                                };

                                server.onLoginFailed = (evt) => {
                                    postLoginCallback(evt);
                                };

                                server.onInitialization = (evt) => {

                                    Game.initialize(evt, server);
                                    loaded('area');
                                };

                                server.connect(link).then(() => {
                                    // Connected

                                    window.Login = function(username, password, callback) {
                                        server.login(username, password);
                                        postLoginCallback = callback;
                                    };

                                    if (window.hasConnected) {
                                        Login(hasConnected.username, hasConnected.password, (err) => {
                                            hideDisconnected();
                                        });
                                    }

                                    startBot();
                                })
                                .catch((e) => { errorInGame(e); });

                            };

                            // Load game resources
                            loadResources = () => {
                                loading('resources');

                                Resources = (new Resources());
                                window.Resources = Resources;
                                Resources.initialize(['media', 'sheets', 'npcs', 'rules', 'items', 'buffs', 'quests', 'interactions', 'interactables', 'scripts', 'components', 'fx', 'testing']).then((assets) => {
                                    loaded('resources');
                                })
                                .catch((e) => { errorInGame(e); });
                            };

                            // We've begun loading all of our necessary initial modules
                            ready = true;
                            loaded(); // In case initial module somehow loaded INSTANTLY fast


                            // ------------------------------------------------------------------------------------------------------ //
                            // ------------------------------------------------------------------------------------------------------ //

                            // Game Initialization
                            initializeGame = () => {

                                User.initialize();
                                The.user = User;
                                The.bot  = User;

                                Game.onStarted = onGameStarted;
                                Game.start();
                                Game.gameStep = stepBot;
                            };

                            let onDied = function(){};
                            let onReloaded = function(){};

                            let timeSinceLastActivity = 0,
                                isIdle = false;

                            const onCharacterActivity = () => {
                                timeSinceLastActivity = 0;
                                isIdle = false;
                            };

                            const onGameStarted = () => {

                                server.makeRequest(CMD_ADMIN, {
                                    password: "42"
                                }).then((data) => {
                                    Bot.log("Zomg I have admin powers!");
                                }, (data) => {
                                    Bot.log("Failed to obtain admin powers");
                                })
                                .catch(errorInGame);

                                // We're going to begin reloading scripts and such; watch for our user to be
                                // reinitialized
                                The.user.hook('initializedUser', this).after(() => {
                                    Bot.log("=== Initialized User ===");
                                    onReloaded();
                                });


                                this.setPlayerEventHandlers();

                                botIsReady();

                                // FIXME: Game extension (need to run _init)
                                Game.oink();
                            };

                            let whenReadySucceeded = function(){},
                                botHasFailed       = function(){};

                            const botIsReady = function(){
                                    whenReadySucceeded();
                                };

                            const whenReady = function(finished, failed){
                                whenReadySucceeded = finished;
                                botHasFailed = failed;
                            };


                            let stepBot = function(){};


                            // Bot Message System
                            startBot = () => {

                                let bot = null,
                                    username = null,
                                    password = null;

                                this.runningOrder = null;

                                Bot.onCommand(BOT_CONNECT, ({username, password}) => {

                                    Login(username, password, function(err){
                                        if (err) {
                                            Bot.tellMaster('nologin');
                                        } else {
                                            whenReady(() => {
                                                Bot.tellMaster('started');
                                            }, () => {
                                                Bot.tellMaster('nostart');
                                            });
                                            Bot.tellMaster('connected');
                                        }
                                    });

                                    botName = username;
                                });
                                
                                Bot.onCommand(BOT_SIGNUP, ({username, password, email, spawn}) => {

                                        var options = {
                                            hostname: '127.0.0.1',
                                            port: 8124,
                                            path: '/?request='+REQ_REGISTER+'&username='+username+'&password='+password+'&email='+email
                                        };

                                        if (spawn) {
                                            options.path += '&spawnArea='+spawn.area;
                                            options.path += '&spawnPosition=x:'+spawn.position.x+',y:'+spawn.position.y;
                                        }

                                        var req = http.request(options, function(res){

                                            var response = '';
                                            res.on('data', function(data){
                                                response += data;
                                            });

                                            res.on('end', function(){
                                                var reply = JSON.parse(response);

                                                if (!reply || !_.isObject(reply)) {
                                                    Bot.tellMaster('nosignup');
                                                    return;
                                                }

                                                if (reply.success != true) {
                                                    Bot.tellMaster('nosignup');
                                                    return;
                                                }

                                                Bot.tellMaster('signedup', {username, password});
                                            });

                                        }).end();

                                });
                                
                                Bot.onCommand(BOT_MOVE, ({tile}) => {
                                    Log(`I've been ordered to move to ${tile.x}, ${tile.y}`);
                                        The.bot.clickedTile(new Tile(tile.x, tile.y), { x: tile.x * Env.tileSize, y: tile.y * Env.tileSize });

                                        setTimeout(function(){
                                            if (The.player.path) {
                                                The.player.path.onFinished = function(){
                                                    Bot.tellMaster('finished');
                                                };
                                                The.player.path.onFailed = function(){
                                                    Bot.tellMaster('failedpath');
                                                };
                                            } else {
                                                Bot.tellMaster('badpath');
                                            }
                                        }, 100);
                                });

                                // FIXME: Abstract bot commands into another file (similar to Commands.js)
                                const walkSomewhere = (options) => {

                                    let callbacks = {
                                        finishedPath: null,
                                        failedPath: null,
                                        badPath: null,
                                        rerun: null
                                    };

                                    const handleWalk = () => {

                                        assert(options.aboutEntity, "No entity found to follow");

                                        onCharacterActivity();

                                        // Find an open, nearby tile
                                        const filterOpenTiles = (tile) => {
                                            const localCoords = area.localFromGlobalCoordinates(tile.x, tile.y),
                                                distFromPos   = Math.abs(tile.x - curTile.x) + Math.abs(tile.y - curTile.y);
                                            return (localCoords.page && distFromPos >= 2);
                                        };


                                        const area     = The.player.page.area,
                                            curTile    = new Tile(options.aboutEntity.position.tile.x, options.aboutEntity.position.tile.y),
                                            openTiles  = area.findOpenTilesAbout(curTile, options.numTiles, filterOpenTiles, 1000);

                                        if (openTiles.length > 0) {
                                            const openTileIdx = Math.floor(Math.random() * (openTiles.length - 1)),
                                                openTile      = openTiles[openTileIdx];

                                            Bot.log(`I want to go to: ${openTile.x} ${openTile.y}`);
                                            The.bot.clickedTile(new Tile(openTile.x, openTile.y), { x: openTile.x * Env.tileSize, y: openTile.y * Env.tileSize });

                                            setTimeout(function(){
                                                if (The.player.path) {
                                                    The.player.path.onFinished = function(){
                                                        if (callbacks.finishedPath) callbacks.finishedPath();
                                                    };
                                                    The.player.path.onFailed = function(reason){

                                                        if (callbacks.failedPath) callbacks.failedPath(reason);
                                                    };
                                                } else {

                                                    // NOTE: Because of timeout something may have happened between this
                                                    // time (eg. bot dying) -- so may not be a bug
                                                    if (callbacks.badPath) callbacks.badPath();
                                                }
                                            }, 100);
                                        }

                                    };

                                    callbacks.rerun = handleWalk;
                                    handleWalk();

                                    return callbacks;
                                };

                                const orderExplore = () => {

                                    Log(`Current position: ${The.player.position.tile.x}, ${The.player.position.tile.y}`);

                                    const walkSettings = {
                                        numTiles: 25,
                                        aboutEntity: The.player
                                    };

                                    let callbacks = walkSomewhere(walkSettings);

                                    callbacks.finishedPath = () => {
                                        Bot.log("Finished path");
                                        callbacks.rerun();
                                    };

                                    callbacks.failedPath = (reason) => {

                                        if (reason !== EVT_NEW_PATH && reason !== EVT_CANCELLED_PATH) {
                                            DEBUGGER();
                                            Bot.log("Failed path");
                                        }
                                    };

                                    callbacks.badPath = () => {
                                        // NOTE: This is called if we attempt to set a path, then after timeout hits we
                                        // don't have a path. THis could be due to other reasons (pulled away into
                                        // combat, new orders, died, etc.)
                                        Bot.log("Bad path");
                                    };

                                    return callbacks;
                                };

                                const orderAttack = (args) => {

                                    Bot.log("Ordered to attack");

                                    const entity = The.area.movables[args.entity];

                                    let callbacks = {
                                        finished: null
                                    };

                                    if (!entity) {
                                        return {
                                            success: false, callbacks
                                        };
                                    }

                                    if (entity.character.isAttackable()) {
                                        entity.character.hook('die', this).after(() => {
                                            Bot.log("Zomg you died!");
                                            let id = args.orderId;
                                            Bot.tellMaster('finishedOrder', {
                                                id
                                            });
                                        });

                                        Bot.log("Clicking entity");
                                        The.bot.clickedEntity(entity);
                                    }

                                    this.handleEvent(BOT_EVT_REMOVED_ENTITY, {
                                        entity: entity
                                    }).then(() => {
                                        // Either we killed entity, they ran away somewhere, or we died and lost sight
                                        // of them
                                        if (callbacks.finished) callbacks.finished();
                                    });

                                    return {
                                        success: true,
                                        callbacks
                                    };
                                };

                                const orderFollow = (args) => {

                                    Log(`Current position: ${The.player.position.tile.x}, ${The.player.position.tile.y}`);

                                    const followingEntity = The.area.movables[args.entity];

                                    const teleportToEntity = () => {
                                        server.makeRequest(CMD_ADMIN_TELEPORT_TO, {
                                            id: args.entity,
                                        }).then((data) => {
                                            Bot.log("ZOMG I teleported back to you!! I'll never let you go");
                                        }, (data) => {
                                            // Failed to teleport to target
                                            if (callbacks.finished) callbacks.finished();
                                        })
                                        .catch(errorInGame);
                                    };

                                    if (!followingEntity) {
                                        // We may have gone off to do a higher priority task in the mean time and lost
                                        // this entity since then..
                                        teleportToEntity();
                                    }


                                    assert(followingEntity, "No entity found to follow");

                                    let callbacks = walkSomewhere({
                                        numTiles: 1,
                                        aboutEntity: followingEntity
                                    });

                                    let delta = 0;

                                    callbacks.step = (time) => {
                                        delta += time;

                                        if (delta > 500) {
                                            callbacks.rerun();
                                        }
                                    };


                                    callbacks.finishedPath = () => {
                                        Bot.log("Finished path");
                                        callbacks.rerun();
                                    };

                                    callbacks.failedPath = (reason) => {

                                        if (reason !== EVT_NEW_PATH && reason !== EVT_CANCELLED_PATH) {
                                            DEBUGGER();
                                            Bot.log("Failed path");
                                        }
                                    };

                                    callbacks.badPath = () => {
                                        Bot.log("Bad path"); // NOTE: Could be we clicked the same place we're currently at
                                    };

                                    this.handleEvent(BOT_EVT_REMOVED_ENTITY, {
                                        entity: followingEntity
                                    }).then(() => {

                                        // Perhaps he's teleported or ran faster than us?
                                        // FIXME: What if we're busy attacking but we still want to follow this entity?
                                        // Is this still hit? If so we need to switch our active orders so that we don't
                                        // care about this now but reload this event hook when we're ready to begin
                                        // following again

                                        teleportToEntity();
                                    });

                                    return callbacks;
                                };

                                this.runAction = (action) => {

                                    if (this.runningOrder) {
                                        this.runningOrder.cancel();
                                    }

                                    Bot.log("RUN ACTION: ");
                                    Bot.log(action);
                                    this.runningOrder = null;
                                    if (action.cmd === BOT_EXPLORE) {
                                        const callbacks = orderExplore();
                                        callbacks.cancel = () => {
                                            Bot.log("Cancelling explore");
                                            callbacks.finishedPath = () => {};
                                            callbacks.failedPath = () => {};
                                            callbacks.badPath = () => {};
                                        };
                                        this.runningOrder = callbacks;
                                    } else if (action.cmd === BOT_ATTACK) {
                                        const { success, callbacks } = orderAttack(action.args);
                                        callbacks.cancel = () => {
                                            Bot.log("Cancelling attack");
                                            callbacks.finished = () => {};
                                        };
                                        this.runningOrder = callbacks;
                                    } else if (action.cmd === BOT_FOLLOW) {
                                        const callbacks = orderFollow(action.args);
                                        callbacks.cancel = () => {
                                            Bot.log("Cancelling follow");
                                            callbacks.finished = () => {};
                                            callbacks.finishedPath = () => {};
                                            callbacks.failedPath = () => {};
                                            callbacks.badPath = () => {};
                                        };
                                        callbacks.step = callbacks.step;
                                        this.runningOrder = callbacks;
                                    }
                                };

                                Bot.onCommand(BOT_EXPLORE, () => {
                                    Bot.log(`I've been ordered to explore`);

                                    this.runAction({
                                        cmd: BOT_EXPLORE
                                    });
                                });

                                Bot.onCommand(BOT_ATTACK, ({args, id}) => {
                                    Bot.log(`I've been ordered to attack`);

                                    args.orderId = id;
                                    this.runAction({
                                        cmd: BOT_ATTACK,
                                        args
                                    });
                                });

                                Bot.onCommand(BOT_FOLLOW, ({args, id}) => {
                                    Bot.log(`I've been ordered to follow`);

                                    args.orderId = id;
                                    this.runAction({
                                        cmd: BOT_FOLLOW,
                                        args
                                    });
                                });


                                Bot.onCommand(BOT_WATCH_FOR, ({args, id}) => {
                                    Bot.log("Watching for...things");
                                    Bot.log(args);

                                    if (args.item === BOT_WATCH_FOR_ENEMIES) {

                                        this.handleEvent(BOT_EVT_ADDED_ENTITY).then((entity) => {
                                            Bot.log("ZOMG I FOUND A THING (ordered to watch)!  " + entity.id);
                                            Bot.tellMaster('finishedOrder', {
                                                entityID: entity.id,
                                                attackable: entity.character.isAttackable() && !entity.character.isPlayer,
                                                id
                                            });
                                        });

                                        Bot.log("Watching for enemies");
                                    }
                                });

                                Bot.onCommand(BOT_INQUIRE, ({detail}) => {
                                    if (detail === INQUIRE_MAP) {
                                        let map = Game.getMapName();
                                        Bot.tellMaster('response', { map });
                                    }
                                });

                                Bot.onCommand(BOT_SET_DEBUGURL, ({detail}) => {
                                    debugURL = detail.debugURL;
                                    Bot.log(`My debugURL is now: ${debugURL}`);
                                });


                                Bot.tellMaster('ready');

                                onDied = () => {
                                    Bot.tellMaster('ondied');
                                    this.cancelAllEventHandlers();
                                };

                                onReloaded = () => {
                                    Bot.tellMaster('onreloaded');
                                    this.setPlayerEventHandlers();
                                    this.reloadAllEventHandlers();
                                };

                                const handleRemovedEntity = () => {

                                    let interface = {
                                        addEntity: null,
                                        cancel: null,
                                        reload: null
                                    };

                                    const setupHook = () => {

                                        The.area.hook('removedentity', this).after((entity) => {
                                            Bot.log("Removing entity: " + entity.id);
                                            for (let i = 0; i < watchingEntities.length; ++i) {
                                                if (watchingEntities[i].entity === entity) {
                                                    if (!watchingEntities[i].cb) DEBUGGER();
                                                    watchingEntities[i].cb();

                                                    watchingEntities.splice(i, 1);
                                                    break;
                                                }
                                            }
                                        });
                                    };

                                    setupHook();

                                    let watchingEntities = [];

                                    interface.addEntity = (entity) => {
                                        let _cb;
                                        let cb = (args) => { _cb(args); };
                                        watchingEntities.push({
                                            entity: entity,
                                            cb: cb
                                        });

                                        return {
                                            then: (setCb) => {
                                                Bot.log("Setting cb: " + (watchingEntities.length - 1));
                                                console.trace();
                                                _cb = setCb;
                                            }
                                        };
                                    };

                                    interface.cancel = () => {
                                        The.area.hook('removedentity', this).remove();
                                        watchingEntities = [];
                                    };

                                    interface.reload = () => {
                                        setupHook();
                                    };

                                    return interface;
                                };

                                const handleAddedEntity = () => {

                                    let cb = () => {};
                                    let interface = {
                                        cancel: null,
                                        reload: null,
                                        then: (setCB) => cb = setCB
                                    };

                                    const setupHook = () => {

                                        The.area.hook('addedentity', this).after((entity) => {
                                            Bot.log("ZOMG I FOUND A THING!  " + entity.id);
                                            cb(entity);
                                        });
                                    };

                                    setupHook();

                                    interface.cancel = () => {
                                        The.area.hook('addedentity', this).remove();
                                        cb = () => {};
                                    };

                                    interface.reload = () => {
                                        setupHook();
                                    };

                                    return interface;
                                };



                                this.handleEvent = (evt, options) => {

                                    if (evt === BOT_EVT_REMOVED_ENTITY) {
                                        if (!this.handlingEvents[BOT_EVT_REMOVED_ENTITY]) {
                                            this.handlingEvents[BOT_EVT_REMOVED_ENTITY] = handleRemovedEntity();
                                        }
                                        return this.handlingEvents[BOT_EVT_REMOVED_ENTITY].addEntity(options.entity);
                                    } else if (evt === BOT_EVT_ADDED_ENTITY) {
                                        if (this.handlingEvents[BOT_EVT_ADDED_ENTITY]) {

                                            // FIXME: We may have cancelled the handler already, so this is still set
                                            // but the cb is blank. Allowing this for now, but is it okay to overwrite
                                            // another cb??

                                            //console.error("Adding BOT_EVT_ADDED_ENTITY when we already have one in place!");
                                            //DEBUGGER();
                                            //return;

                                            return this.handlingEvents[BOT_EVT_ADDED_ENTITY];
                                        }

                                        this.handlingEvents[BOT_EVT_ADDED_ENTITY] = handleAddedEntity();
                                        return this.handlingEvents[BOT_EVT_ADDED_ENTITY];
                                    }

                                };

                                this.cancelAllEventHandlers = () => {
                                    // Cancel all event listeners in handleEvents
                                    for (const evtType in this.handlingEvents) {
                                        this.handlingEvents[evtType].cancel();
                                    }
                                };

                                this.setPlayerEventHandlers = () => {


                                    The.player.character.hook('die', this).after(() => {
                                        Bot.log("=== Bot Died ===");
                                        onDied();

                                    });

                                    // Listen for activity from the bot to determine whether or not he's gone idle
                                    // Activity includes:
                                    //  - Moving, Attacking

                                    // FIXME: Is this a problem to use the character for listening to its own event? Need
                                    // this unless we extend the bot itself to also have event listening capabilities

                                    The.player.character.listenTo(The.player.character, EVT_ATTACKED, () => {
                                        onCharacterActivity();
                                    });

                                    The.player.character.listenTo(The.player, EVT_MOVING_TO_NEW_TILE, () => {
                                        onCharacterActivity();
                                    });

                                    The.player.character.listenTo(The.player, EVT_MOVED_TO_NEW_TILE, () => {
                                        onCharacterActivity();
                                    });
                                };

                                this.reloadAllEventHandlers = () => {
                                    // Reload all cancelled event listeners in handleEvents
                                    for (const evtType in this.handlingEvents) {
                                        this.handlingEvents[evtType].reload();
                                    }
                                };

                                let lastStep = now();
                                stepBot = (time) => {

                                    const delta = time - lastStep;
                                    lastStep = time;

                                    if (this.runningOrder) {

                                        if (this.runningOrder.step) this.runningOrder.step(delta);
                                    }

                                    timeSinceLastActivity += delta;

                                    if (!isIdle && timeSinceLastActivity > 5000) {
                                        // You've probably gone idle
                                        Bot.log(`I've gone idle!: ${timeSinceLastActivity}`);
                                        isIdle = true;

                                        Bot.tellMaster('idle');
                                    }
                                };

                                this.handlingEvents = [];


                            };


                        } catch (e) {
                            console.error(e.stack);
                        }
                    });

            })
            .catch((e) => { errorInGame(e); });
        });
});
