// Server
// This is the starting point for the server


const requirejs = require('requirejs');
requirejs.config({
    nodeRequire: require,
    baseUrl: __dirname,
    paths: {
        lodash: "https://cdn.jsdelivr.net/lodash/4.14.1/lodash.min.js"
    }
});


// Error in Game
// If there is any issue whatsoever, crash the server immediately and drop into here. The intention is that any error
// whatsoever is a problem with the game, should not be ignored and should be investigated immediately. Crash the server
// and allow the startup service to restart the server automatically. Dump as much information as possible to help with
// the investigation
let shutdownGame = null,
    shuttingDown = false;

const waitForInspector = () => {

    const prompt = () => {

        const fd = fs.openSync('/dev/tty', 'rs');

        const wasRaw = process.stdin.isRaw;
        if (!wasRaw) { process.stdin.setRawMode(true); }

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
        process.stdin.setRawMode(wasRaw);
        return char;
    };

    Log(chalk.red.bold("Hit any key to open the inspector"));
    const n = prompt();
    if (n !== null) {
        const inspector = require('inspector');
        Log(chalk.red.bold("Waiting for inspector.."));
        inspector.open(9229, "127.0.0.1", true); // port, host, block
        debugger;
    }
};

const errorInGame = (e) => {

    const isAnError = e !== "SIGINT";
    if (shuttingDown) {

        // We may have already started shutting down, but could be waiting for the inspector. We may want to kill the
        // process without any debugging (ctrl-c)
        if (!isAnError) {
            process.exit(e);
        }

        return;
    }

    shuttingDown = true;

    if (isAnError) {
        console.error("Error in game");
        if (global['DumpLog']) DumpLog();

        if (console.trace) console.trace();


        // Error Reporting
        // Report as much as possible
        if (global.ErrorReporter && e) {

            global.ErrorReporter.printStack(e);

            // FIXME: There should be an array or object of items we intend to dump
            const dump = {
                'world': The.world
            };

            global.ErrorReporter.report(e, dump);
        } else {
            console.error("No error reporter yet!");
            console.log(e);
        }
    }

    // Just in case the above promises take too long
    if (GLOBAL.shutdownGame) {
        shutdownGame(e);
    }

    if (e) {
        waitForInspector();
    }

    process.exit(e);
};

GLOBAL.errorInGame = errorInGame;

// If anything happens make sure we go through the common error/exit routine
process.on('exit', errorInGame);
process.on('SIGINT', errorInGame);
process.on('uncaughtException', errorInGame);


    // ------------------------------------------------------------------------------------------------------ //
    // ------------------------------------------------------------------------------------------------------ //


const util          = require('util'),
    _               = require('lodash'),
    fs              = require('fs'),        // TODO: Promisify this
    Promise         = require('bluebird'),
    http            = require('http'),
    WebSocketServer = require('ws').Server,
    chalk           = require('chalk'),
    prettyjson      = require('prettyjson'),
    assert          = require('assert'),    // TODO: Disable in production
    filepath        = require('path'),
    SourceMap       = require('source-map');

GLOBAL.util = util;
GLOBAL._ = _;
GLOBAL.Promise = Promise;
GLOBAL.chalk = chalk;
GLOBAL.prettyjson = prettyjson;
GLOBAL.assert = assert;
GLOBAL.WebSocketServer = WebSocketServer;
GLOBAL.__dirname = __dirname; // FIXME: For some reason ErrorReporter  require('path').dirname('')  returns an empty string

GLOBAL.fs = fs;

GLOBAL.DEBUGGER = () => {
    waitForInspector();
};

// Promise.longStackTraces();

requirejs(['keys', 'environment'], (Keys, Environment) => {

    // Initialize our environment as the server
    const Env = (new Environment());
    Env.isServer = true;
    GLOBAL.Env = Env;


    // Process Server arguments
    process.argv.forEach((val) => {

        if (val === "--test") {
            console.log("Enabling test mode");
            Env.isTesting = true;
        }
    });

    requirejs(
        [
            'objectmgr', 'utilities', 'extensions', 'event', 'errors', 'fsm', 'profiler'
        ],
        (
            The, Utils, Ext, Events, Errors, FSM, Profiler
        ) => {


            GLOBAL.Ext = Ext;
            GLOBAL.The = The;
            GLOBAL.Profiler = Profiler;

            // TODO: use Object.assign (when you can upgrade node)
            _.assign(GLOBAL, Utils);
            _.assign(GLOBAL, Events);
            _.assign(GLOBAL, Errors);
            _.assign(GLOBAL, FSM);

            // FIXME: Necessary?
            for(let i = 0; i < FSM['states'].length; ++i) {
                GLOBAL[FSM.states[i]] = i;
            }


            // Loaded Environment
            // This gets called once we have our extension/context defined
            const loadedEnvironment = () => {

                requirejs(
                    [
                        'errorReporter',
                        'resources', 'loggable',
                        'movable', 'world', 'area', 'scriptmgr', 'test/pseudofxmgr',
                        'server/db', 'server/redis', 'server/player', 'server/login'
                    ],
                    (
                        ErrorReporter,
                        ResourceMgr, Loggable,
                        Movable, World, Area, ScriptMgr, FXMgr,
                        DB, Redis, Player, LoginHandler
                    ) => {

                        // TODO: Shouldn't have to bind/setLogPrefix like this..find a way to make extendClass bind if
                        // using window/GLOBAL
                        extendClass(GLOBAL).with(Loggable);
                        Log = Log.bind(GLOBAL);
                        GLOBAL.setLogPrefix('Server');

                        // ----------------------------------------------------------------------------------------- //
                        // ----------------------------------------------------------------------------------------- //


                        // Module Loading
                        // The game depends on certain modules being loaded and initialized before the game can run.
                        //
                        // Core: Core modules which need to be initialized before we can begin loading resources. In
                        //          particular the database and Redis
                        //
                        // Resources: Scripts and content. Also load the world and areas here
                        //
                        // Scripts: Load scripts
                        //
                        // Start Game: Our core modules have been initialized, resources and scripts have been loaded,
                        //              we are now free to start the game. A connection handler is established here and
                        //              the game loop started
                        //
                        //
                        // All of this works by keeping track of our loading phase and executing
                        // `loading('moduleToLoad')`, then when the module is ready run `loaded('moduleToLoad')`. This
                        // way we can have multiple things loading and not move to the next phase until we've completed
                        // loading everything.
                        //
                        //
                        // TODO: Restructure the module loading to utilize promises
                        // TODO: This code is (mostly) duplicated for both client/server; find a way to better abstract
                        //          this

                        const modulesToLoad   = {},
                            LOADING_CORE      = 1,
                            LOADING_RESOURCES = 2,
                            LOADING_SCRIPTS   = 3,
                            LOADING_FINISHED  = 4;

                        let ready             = false,
                            loadingPhase      = LOADING_CORE,
                            loadResources     = null,
                            loadScripts       = null,
                            startGame         = null;


                        // Loading a module
                        // Add to the list of modules currently being loaded
                        const loading = (module) => {
                            Log(`Loading: ${module}`);
                            modulesToLoad[module] = false;
                        };


                        // Loaded a module
                        // Remove from the list of modules currently being loaded. If we have no more modules that we're
                        // waiting on then go to to the next loading phase
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
                                else if (loadingPhase === LOADING_SCRIPTS) loadScripts();
                                else if (loadingPhase === LOADING_FINISHED) startGame();
                            }
                        };

                        loading('database');
                        const db = new DB();
                        db.connect().then(() => { loaded('database'); },
                            (e) => { errorInGame(e); });


                        loading('redis');
                        const redis = new Redis();
                        redis.initialize().then(() => { loaded('redis'); },
                            (e) => { errorInGame(e); });


                        // Load game resources
                        loadResources = () => {

                            loading('resources');
                            const Resources = (new ResourceMgr());
                            GLOBAL.Resources = Resources;
                            Resources.initialize(
                                ['world', 'sheets', 'npcs', 'rules', 'items', 'buffs', 'quests', 'interactions', 'interactables', 'scripts', 'components', 'testing']
                            ).then((assets) => {

                                // Load World
                                const data = assets.world,
                                    json   = JSON.parse(data),
                                    world  = new World();

                                The.world = world;

                                // Load Areas
                                _.each(json.areas, (areaFile, areaID) => {
                                    loading(`area ${areaID}`);
                                    fs.readFile(`resources/maps/${areaFile}`, (e, areaRawData) => {

                                        if (e) errorInGame(e);

                                        const areaJson = JSON.parse(areaRawData),
                                            areaData   = areaJson.AreaFile;
                                        Resources.areas[areaData.Area.id] = {
                                            data: areaData.Area,
                                            properties: areaData.properties
                                        };

                                        world.addArea(areaID);
                                        loaded(`area ${areaID}`);
                                    });
                                });

                                Resources.onAssetChanged((resourceID, asset) => {

                                    Log(`I smell a change in an asset: ${resourceID}`);
                                    if (resourceID === 'npcs') {
                                        Log(`Reloading all npc's stats..`);
                                        _.each(The.world.areas, (area) => {
                                            _.each(area.movables, (movable) => {
                                                if (movable.playerID) return;
                                                movable.character.loadStats();
                                            });
                                        });
                                    }
                                });

                                loaded('resources');
                            })
                            .catch((e) => {
                                Log("Could not load resources", LOG_ERROR);
                                errorInGame(e);
                            });
                        };


                        // Load Scripts
                        loadScripts = () => {

                            loading('scripts');

                            // Scripts
                            The.scripting.world  = The.world;
                            The.scripting.redis  = redis;
                            The.scripting.Rules  = Resources.rules;
                            The.scripting.Buffs  = Resources.buffs;
                            The.scripting.Items  = Resources.items.list;
                            The.scripting.Quests = Resources.quests;
                            The.scripting.Interactions = Resources.interactions;
                            The.scripting.TestingData  = Resources.testing;

                            Resources.loadComponents().then(() => {
                                Resources.loadScripts(Resources._scriptRes).then(() => {

                                    Log("Starting script manager..", LOG_INFO);
                                    delete Resources._scriptRes;
                                    The.scriptmgr = new ScriptMgr();

                                    // TODO: Cleanup items-not-loaded technique for loading things..its weird and
                                    // unorthadox
                                    if ('items-not-loaded' in Resources.items) {

                                        delete Resources.items['items-not-loaded'];
                                        loading('items');
                                        Resources.loadItemScripts().then(() => { loaded('items'); })
                                            .catch((e) => { errorInGame(e); });
                                    }

                                    loaded('scripts');
                                })
                                .catch((e) => { errorInGame(e); });
                            })
                            .catch((e) => { errorInGame(e); });
                        };

                        // Start Game
                        // TODO: This should really load a script server/game.js (similar to the client's initialization
                        // of the game)
                        startGame = () => {

                            Log("Game has started. Hello, World!");
                            GLOBAL.FX = FXMgr;

                            // Queued request buffer
                            // This is a double buffer to allow queueing requests while safely reading from the previous
                            // set of queued requests
                            const requestBuffer = new BufferQueue();

                            // TODO: Should we re-enable the events archive?
                            // let eventsArchive = new EventsArchive();

                            const players = {};

                            // Shutdown Game
                            // TODO: Cleanup the shutdown routine by gracefully unloading each module, saving the state
                            // of (reliable) things (eg. players, areas), disconnecting from Mongo and Redis, and closing
                            // the process
                            shutdownGame = (e) => {

                                Log("Stopping Game, saving state");

                                _.each(players, (client, clientID) => {
                                    // TODO: save players & D/C
                                });

                                Log("Closing Mongo connection");
                                db.disconnect();

                                Log("Closing Redis connection");
                                redis.disconnect();

                                // NOTE: SIGINT gives e == "SIGINT"
                                if (e && !_.isString(e)) {
                                    waitForInspector();
                                } else {
                                    Log("No error in shutdown; skipping debugger");
                                }

                                Log("Closing server. Goodbye, World!");
                                process.exit();
                            };

                            GLOBAL.shutdownGame = shutdownGame;


                            // Establish a Server
                            const websocket = new WebSocketServer({ port: Env.connection.port });

                            // OnConnection
                            // A User has connected to us
                            // TODO: This should be abstracted to a better place
                            websocket.on('connection', (client) => {

                                Log("websocket connection open", LOG_INFO);

                                const you = new Player(client);

                                // Disconnected
                                // You've disconnected. Turns out we can't disconnect just yet, what if you're in the
                                // middle of a battle? Queue the disconnect to handle when we're ready to d/c you
                                you.onDisconnected = () => {
                                    return new Promise(() => {
                                        requestBuffer.queue({
                                            you, action: { evtType: EVT_DISCONNECTED }
                                        });
                                    });
                                };

                                // Login
                                you.onLogin = (username, password) => {
                                    return new Promise((resolved, failed) => {
                                        db.loginPlayer(username, password).then((savedState) => {

                                            // Are you already online?
                                            const player = _.find(players, (player) => player.movable.name === username);
                                            if (player) {
                                                const client = player.client;

                                                // Are you in a connected state?
                                                if (client.readyState !== 1) {
                                                    Log(`User ${username} is attempting to connect. Player is already
                                                    connected yet client state is in an unready/disconnected state`,
                                                        LOG_ERROR);
                                                }

                                                failed('Already connected!');
                                                return;
                                            }

                                            // User is not online already..safe to connect
                                            resolved({
                                                savedState,
                                                callback: () => { players[savedState.id] = you; }
                                            });
                                        }, (e) => {
                                            failed(e);
                                        })
                                        .catch((e) => { errorInGame(e); });
                                    });
                                };

                                you.onSomeEvent = (evt) => {
                                    requestBuffer.queue({
                                        you: this,
                                        action: evt
                                    });
                                };

                            });

                            // Listen for login/register related requests
                            const loginHandler = new LoginHandler(http, db);

                            // Listen for error reporting requests from the client
                            GLOBAL.ErrorReporter = ErrorReporter;
                            ErrorReporter.initListener(http);
                            ErrorReporter.onErrorReportRequest = (req) => {

                                // Perform an error report on behalf of the client
                                console.log("Requested error report");

                                // FIXME: There should be an array of objects we intend to dump, and we should have some
                                // way of filtering through only the necessary parts (eg. player from map 1 reports
                                // error, we only need to dump map 1)
                                const dump = {
                                    'world': The.world
                                };

                                ErrorReporter.report(false, dump, req);
                            };

                            // The Game Loop
                            const stepTimer         = 100; // TODO: Is this the best step timer?
                            let lastTime            = now(),
                                timeToBackupPlayers = Env.game.periodicBackupTime; // Time to backup the players? (done periodically)
                            const step = () => {


                                const time = now(),
                                    delta  = time - lastTime;
                                lastTime = time;

                                // FIXME: Is this the best way to run the gameloop again?
                                setTimeout(step, stepTimer);

                                requestBuffer.switch();

                                // TODO: Should we re-enable the events archive?
                                // eventsArchive.pushArchive();

                                // Read from buffer
                                // Handle all of the queued requests
                                const buffer = requestBuffer.read();
                                if (buffer.length) {
                                    Log("----Reading request buffer----");

                                    buffer.forEach((request) => {

                                        // Check if request & client still here
                                        if (!request) return;
                                        if (!players[request.you.id]) return;

                                        // TODO: handle events through a better abstraction structure
                                        const you = request.you,
                                            action = request.action;
                                        if (action.evtType === EVT_USER_ADDED_PATH) {

                                            you.handlePathRequest(action);
                                        } else if (action.evtType === EVT_DISCONNECTED) {

                                            you.wantToDisconnect();
                                        } else if (action.evtType === EVT_DISTRACTED) {
                                            // TODO: need to confirm same as current target?
                                            // you.player.brain.setTarget(null);
                                            you.movable.triggerEvent(EVT_DISTRACTED);
                                        } else {
                                            Log(` Unknown event (${action.evtType}) from player: ${you.id}`, LOG_ERROR);
                                        }
                                    });

                                    requestBuffer.clear();
                                    Log("----Cleared request buffer----", LOG_DEBUG);
                                }


                                // Timestep the world
                                const eventsBuffer = The.world.step(time);
                                The.scriptmgr.step(time);


                                // Pass events to each player
                                timeToBackupPlayers -= delta;
                                _.each(players, (player, clientID) => {

                                    const client = player.client;

                                    // Is the player queued for d/c?
                                    if (player.queuedDisconnect) {

                                        // If we're active doing something else reset our d/c countdown
                                        if (!player.canDisconnect()) {
                                            Log("Player can't disconnect, he's busy!");
                                            player.wantToDisconnect();
                                            return;
                                        }

                                        player.timeToDisconnect -= delta;
                                        Log(`Waiting to disconnect player: ${player.timeToDisconnect}`);
                                        if (player.timeToDisconnect <= 0) {
                                            // Allowed to disconnect now
                                            const page = player.movable.page;
                                            player.disconnectPlayer();
                                            page.area.removeEntity(player.movable);
                                            page.eventsBuffer.push({
                                                evtType: EVT_REMOVED_ENTITY,
                                                entity: { id: player.movable.id }
                                            });

                                            Log(`Removed player: ${player.id}`);
                                            db.savePlayer(player.movable);
                                            delete players[player.id];
                                        } else if (timeToBackupPlayers <= 0.0) {
                                            db.savePlayer(player.movable);
                                        }

                                        return;
                                    }

                                    if (timeToBackupPlayers <= 0.0) {
                                        db.savePlayer(player.movable);
                                    }

                                    if (client.readyState !== 1) return; // Not open (probably in the middle of d/c)


                                    // Step player and send the latest events to this player
                                    // TODO: Should probably separate this by stepping all players and then sending page
                                    // events to everyone
                                    player.step(time);
                                    _.each(player.pages, (page, pageID) => {

                                        // FIXME: for some reason old pages are still stored in player.pages.. this
                                        // could potentially be a BIG problem with bugs laying around the program. Make
                                        // sure to check why this is occuring and if its occuring elsewhere too!
                                        if (!player.pages[pageID]) {
                                            Log(`Bad page: ${pageID}`, LOG_ERROR);
                                            return;
                                        }

                                        const areaID = player.pages[pageID].area.id;
                                        if (eventsBuffer[areaID] && eventsBuffer[areaID][pageID]) {
                                            client.send(JSON.stringify({
                                                evtType: EVT_PAGE_EVENTS,
                                                page: pageID,
                                                events: eventsBuffer[areaID][pageID]
                                            }));
                                        }
                                    });

                                    // FIXME: find a better protocol for this.. need to send the player the last updates
                                    // from the page since they died, but need to immediately remove players pages
                                    // afterwards
                                    if (player.movable.character.alive === false) {
                                        player.pages = {};
                                    }
                                });

                                if (timeToBackupPlayers <= 0.0) {
                                    timeToBackupPlayers = Env.game.periodicBackupTime;
                                }
                            };

                            step();
                        };

                        ready = true;
                        loaded(); // In case resources somehow loaded INSTANTLY fast
                    });
            };

            // Load extensions
            // This is our environment context, used to extend loaded classes with their client/server counterpart
            let extendedEnvironment = Ext.SERVER;
            if (Env.isTesting) {
                extendedEnvironment |= Ext.SERVER_TEST;
            }

            Ext.ready(extendedEnvironment).then(() => {
                loadedEnvironment();

                Ext.extend(this, 'server');
            })
            .catch((e) => { errorInGame(e); });
        });
});
