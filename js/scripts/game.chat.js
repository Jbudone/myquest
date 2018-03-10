define(['SCRIPTINJECT', 'scripts/commands'], (SCRIPTINJECT, Commands) => {

    /* SCRIPTINJECT */

    const Chatter = function() {

        const _self = this; // Static reference to Chatter object

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

                Commands.forEach((cmd) => {
                    if (cmd.server && cmd.requiresAdmin) {
                        console.log("Registering command " + cmd.typedCommand);

                        // Register this command
                        player.registerHandler(cmd.command, 'admin');
                        player.handler(cmd.command).set((evt, data) => {
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

                if (localStorage.getItem('autoadmin') === "true") {
                    setTimeout(() => {
                        const command = _self.transformMessage(`/admin 42`);
                        _self.handleCommand(command);
                    }, 2000);
                }
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
