
// Main module
// This is the starting point for the client. Main is responsible for initializing core modules, loading resources,
// establishing a connection with the server, and initializing the game
define(
    [
        'errorReporter',
        'resources', 'loggable', 'profiler',
        'client/serverHandler', 'client/user', 'client/game'
    ],
    (
        ErrorReporter,
        Resources, Loggable, Profiler,
        ServerHandler, User, GameClient
    ) => {

        try {

            extendClass(window).with(Loggable);
            Log = Log.bind(window);
            window.setLogPrefix('Main');

            const errorInGame = (e) => {

                Log(e, LOG_ERROR);
                debugger;
                console.error(e.stack);
                if (console.trace) console.trace();

                // Error Reporting
                // Report as much as possible
                if (window.ErrorReporter) {

                    if (e) {
                        window.ErrorReporter.printStack(e);
                    }

                    // FIXME: There should be an array or object of items we intend to dump
                    const dump = {
                        'area': The.area
                    };

                    window.ErrorReporter.report(e, dump);
                } else {
                    console.error("No error reporter yet!");
                }

                // FIXME: stop game! unexpected and uncaught error..
            };


            // Assertion
            // TODO: Find a better way to coordinate with node assertion
            // TODO: Setup option to disable in production
            const assert = (expr, message) => {
                if (!expr) throw Err(message);
            };


            window.errorInGame = errorInGame;
            window.assert      = assert;
            window.Profiler    = Profiler;
            window.ErrorReporter = ErrorReporter;


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
                retryConnection        = null;

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

                    // TODO: allow reconnecting..
                    // setTimeout(retryConnection, 1000);
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

                })
                .catch((e) => { errorInGame(e); });

            };

            // Load game resources
            loadResources = () => {
                loading('resources');

                Resources = (new Resources());
                window.Resources = Resources;
                Resources.initialize(['sheets', 'npcs', 'rules', 'items', 'buffs', 'quests', 'interactions', 'interactables', 'scripts', 'components']).then((assets) => {
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

                Game.start();
            };


        } catch (e) {
            console.error(e.stack);
        }
    });
