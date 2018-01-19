define(['SCRIPTINJECT'], (SCRIPTINJECT) => {

    /* SCRIPTINJECT */

    const Commands = [
        {
            typedCommand: 'admin',
            command: CMD_ADMIN,
            requiresAdmin: false,
            args: [
                {
                    name: 'password',
                    sanitize: (p) => p,
                    test: (p) => _.isString(p),
                    error: "Token expected to be a string"
                }
            ],
            client: {
                succeeded: (self) => {
                    UI.postMessage("Success in sending message! ", MESSAGE_GOOD);
                    self.admin = true;
                    UI.setAdminUI();
                },
                failed: () => {
                    UI.postMessage("Fail in sending message! ", MESSAGE_BAD);
                }
            },
            server: (evt, data, self, player) => {

                let success = false;
                if (_.isObject(data) && data.password === "42") {
                    success = true;
                    self.admin = true;
                    self.setupAdmin(player);
                }

                player.respond(evt.id, success, {

                });
            }
        },
        {
            typedCommand: 'crash',
            command: CMD_CRASH,
            requiresAdmin: false,
            args: [],
            client: () => {

                try {
                    throw Err("Crashing the game from script");
                } catch(e) {
                    errorInGame(e);
                }
            }
        },
        {
            typedCommand: 'admin_crash',
            command: CMD_ADMIN_CRASH,
            requiresAdmin: true,
            args: [],
            server: (evt, data, self) => {
                try {
                    throw Err("Crashing the game from script");
                } catch(e) {
                    errorInGame(e);
                }
            },
            client: {
                succeeded: (self) => {
                    UI.postMessage("Success in sending message! ", MESSAGE_GOOD);
                },
                failed: () => {
                    UI.postMessage("Fail in sending message! ", MESSAGE_BAD);
                }
            }
        },
        {
            typedCommand: 'gain_xp',
            command: CMD_ADMIN_GAIN_XP,
            requiresAdmin: true,
            args: [
                {
                    name: 'XP',
                    sanitize: (p) => parseInt(p, 10),
                    test: (p) => _.isFinite(p),
                    error: "Token should be a valid number"
                }
            ],
            server: (evt, data, self, player) => {

                let success = false;
                if (_.isObject(data) && _.isFinite(data.XP)) {
                    success = true;
                    // FIXME: Should check XP amount is reasonable -- cannot level more than once
                    this.Log(`Giving you some XP: ${data.XP}`);
                    player.movable.character.doHook('GainedXP').post({ XP: data.XP });
                }

                player.respond(evt.id, success, {

                });
            },
            client: {
                pre: () => {
                    UI.postMessage("So you think you can login eh?");
                },
                succeeded: (self) => {
                    UI.postMessage("Success in sending message! ", MESSAGE_GOOD);
                },
                failed: () => {
                    UI.postMessage("Fail in sending message! ", MESSAGE_BAD);
                }
            }
        },
        {
            typedCommand: 'suicide',
            command: CMD_ADMIN_SUICIDE,
            requiresAdmin: true,
            args: [],
            server: (evt, data, self, player) => {

                let success = true;
                // FIXME: Check if we can die (currently alive)
                this.Log(`Committing suicide`);
                player.movable.character.die(null);

                player.respond(evt.id, success, {

                });
            },
            client: {
                succeeded: (self) => {
                    UI.postMessage("Success in sending message! ", MESSAGE_GOOD);
                },
                failed: () => {
                    UI.postMessage("Fail in sending message! ", MESSAGE_BAD);
                }
            }
        },
        {
            typedCommand: 'give_buff',
            command: CMD_ADMIN_GIVE_BUFF,
            requiresAdmin: true,
            args: [
                {
                    name: 'buffres',
                    sanitize: (p) => p,
                    test: (p) => p in Buffs,
                    error: "BuffRes not valid"
                }
            ],
            server: (evt, data, self, player) => {

                let success = false;
                if
                (
                    _.isObject(data) &&
                    _.isString(data.buffres) &&
                    data.buffres in Buffs
                )
                {
                    success = true;
                    this.Log(`Giving you a buff: ${data.buffres}`);
                    player.movable.character.doHook('BuffEvt').post({
                        buff: Buffs[data.buffres]
                    });
                }

                player.respond(evt.id, success, {

                });
            },
            client: {
                succeeded: (self) => {
                    UI.postMessage("Success in sending message! ", MESSAGE_GOOD);
                },
                failed: () => {
                    UI.postMessage("Fail in sending message! ", MESSAGE_BAD);
                }
            }
        },
        {
            typedCommand: 'teleport',
            command: CMD_TELEPORT,
            requiresAdmin: true,
            args: [
                {
                    name: 'x',
                    sanitize: (p) => parseInt(p),
                    test: (p) => _.isFinite(p),
                    error: "coordinate X is not a number"
                },
                {
                    name: 'y',
                    sanitize: (p) => parseInt(p),
                    test: (p) => _.isFinite(p),
                    error: "coordinate Y is not a number"
                }
            ],
            server: (evt, data, self, player) => {

                let success = false;
                if
                (
                    _.isObject(data) &&
                    _.isFinite(data.x) &&
                    _.isFinite(data.y)
                )
                {

                    this.Log(`User wants to teleport: (${data.x}, ${data.y})`);
                    success = player.movable.teleport(data.x, data.y);
                }

                player.respond(evt.id, success, { });
            },
            client: {
                pre: (self) => {
                    The.player.cancelPath();
                },
                succeeded: (self) => {
                    UI.postMessage("Success in teleporting! ", MESSAGE_GOOD);
                },
                failed: () => {
                    UI.postMessage("Fail in teleport! ", MESSAGE_BAD);
                }
            }
        }
    ];

    const Chatter = function() {

        const _self = this;

        this.name  = "chatter";
        this.keys  = [];
        this.admin = false;

        this.initialize = function() {
            this.Log("Loaded chatter");
        };

        this.server = {
            initialize() {
                this.Log("Chatter is for Server");

                const game = this._script;
                game.hook('addedplayer', this).after(function(entity) {
                    this.Log(`Chatter would like to listen to [${entity.id}] for messages..`, LOG_DEBUG);

                    const player = entity.player;
                    player.registerHandler(EVT_CHAT, 'chat');
                    player.handler(EVT_CHAT).set(function(evt, data) {
                        const time = now();
                        if (time - player.timeSinceLastMessage < Env.chat.serverTimeBetweenMessages) {
                            this.Log("Ignoring user message.. too soon");
                            return;
                        }
                        player.timeSinceLastMessage = now();

                        const message = data.message.trim();
                        if (message.length === 0 || message.length > Env.chat.maxMessageLength) {
                            this.Log("Ignoring user message.. too long OR blank", LOG_DEBUG);
                            return;
                        }

                        const success = true;
                        player.respond(evt.id, success, {
                            message: data.message
                        });

                        if (success) {
                            // Broadcast to pages
                            player.movable.page.broadcast(EVT_CHAT, {
                                player: player.id,
                                message: `${entity.name} says ${data.message}`
                            });
                        }
                    });
                    player.timeSinceLastMessage = now();

                    Commands.forEach((cmd) => {
                        if (cmd.server && !cmd.requiresAdmin) {

                            // Register this command
                            player.registerHandler(cmd.command, 'chat');
                            player.handler(cmd.command).set((evt, data) => {
                                cmd.server(evt, data, _self, player);
                            });
                        }
                    });
                });

                game.hook('removedplayer', this).after(function(entity){

                    entity.player.handler(EVT_CHAT).unset();
                });
            },

            setupAdmin: (player) => {

                console.log("Setting player as admin");
                Commands.forEach((cmd) => {
                    if (cmd.server && cmd.requiresAdmin) {
                        console.log("Registering command " + cmd.typedCommand);

                        // Register this command
                        player.registerHandler(cmd.command, 'admin');
                        player.handler(cmd.command).set((evt, data) => {
                            // FIXME: _self is not accurate! Probably broken for other thinsg too
                            cmd.server(evt, data, _self, player);
                        });
                    }
                });
            },

            unload: () => {
                if (game) game.unhook(this);
            }
        };

        this.client = {
            initialize() {
                this.Log("Chatter is for Client");
                UI.hook('inputSubmit', _self).before((msg) => {
                    this.Log("Chatter[pre]: "+msg, LOG_DEBUG);
                    const time = now();
                    if (time - _self.timeSinceLastMessage < Env.chat.clientTimeBetweenMessages) {
                        this.Log("Ignoring user message.. too soon");
                        return false;
                    }
                    _self.timeSinceLastMessage = now();

                    msg = msg.trim();
                    if (msg.length === 0 || msg.length > Env.chat.maxMessageLength) {
                        this.Log("Ignoring user message.. too long OR blank");
                        return false;
                    }

                    return true;
                }).after((msg) => {
                    this.Log("Chatter[post]: "+msg, LOG_DEBUG);
                    msg = msg.trim();

                    // This message could be a command (eg. "/tell TSwift Will you marry me?")
                    const command = _self.transformMessage(msg);
                    if (command.type === CMD_MESSAGE) {

                        // Send server our chat message
                        server.request(EVT_CHAT, {
                            message: msg
                        }).then(function() {
                            this.Log("Success in sending message! "+msg, LOG_DEBUG);
                        }, function() {
                            this.Log("Fail in message! "+msg, LOG_ERROR);
                        })
                        .catch(errorInGame);
                    } else {
                        _self.handleCommand(command);
                    }
                });

                server.registerHandler(EVT_CHAT, 'chat');
                server.handler(EVT_CHAT).set(function(evt, data) {
                    UI.postMessage(data.message, MESSAGE_INFO);
                });

                _self.timeSinceLastMessage = now();
            },

            transformMessage: (msg) => {

                const cmd = {
                    type: CMD_MESSAGE
                };

                let tokens = msg.split(/\s+/g);
                    request = tokens[0];
                if (request[0] === "/") {
                    // Yup, its a command
                    cmd.type = CMD_BAD_COMMAND;

                    const commandRequest = request.substr(1).toLowerCase();
                    for (let i = 0; i < Commands.length; ++i) {
                        const commandDetails = Commands[i];
                        if (commandRequest === commandDetails.typedCommand) {
                            cmd.type = commandDetails.command;
                            cmd.ref = commandDetails;

                            // Setup Args
                            let badArg = false;
                            for (let j = 0; j < commandDetails.args.length; ++j) {
                                const arg = commandDetails.args[j];

                                let token = tokens[1 + j];
                                if (arg.sanitize) {
                                    token = arg.sanitize(token);
                                }

                                if (arg.test && !arg.test(token)) {
                                    badArg = true;
                                    cmd.type = CMD_BAD_COMMAND; // FIXME: This is incorrect find a better way to do this, as well as including the error message
                                    break;
                                }

                                cmd[arg.name] = token;
                            }

                            // Admin?
                            if (commandDetails.requiresAdmin && !this.admin) {
                                cmd.type = CMD_BAD_COMMAND; // FIXME: This is incorrect find a better way to do this, as well as including the error message
                            }
                            
                            break;
                        }
                    }
                }

                return cmd;
            },

            handleCommand: (cmd) => {

                if (cmd.type === CMD_BAD_COMMAND) {

                    UI.postMessage(`Wtf is ${request}?`, MESSAGE_BAD);
                } else if (cmd.ref.server) {

                    if (cmd.ref.client.pre) {
                        cmd.ref.client.pre();
                    }

                    server.request(cmd.type, cmd)
                        .then((data) => {
                            cmd.ref.client.succeeded(_self, data);
                        }, (data) => {
                            cmd.ref.client.failed(_self, data);
                        })
                        .catch(errorInGame);
                } else {
                    cmd.ref.client();
                }
            },

            unload: () => {
                if (UI) UI.unhook(_self);
                if (server) server.handler(EVT_CHAT).unset();
            }
        };
    };

    return Chatter;
});
