define(['SCRIPTINJECT'], (SCRIPTINJECT) => {

    /* SCRIPTINJECT */

    const Commands = [
        {
            typedCommand: 'admin',
            command: CMD_ADMIN,
            requiresAdmin: false,
            description: "/admin [password] : gives admin permissions",
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
            description: "/crash : crashes locally",
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
            description: "/admin_crash : sends a crash to the server",
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
            description: "/gain_xp [amount] : gives some amount of XP",
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
            description: "/suicide : kills yourself",
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
            description: "/give_buff [buff] : give yourself a specified buff",
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
            command: CMD_ADMIN_TELEPORT,
            requiresAdmin: true,
            description: "/teleport [x] [y] : teleport to a given location",
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

    Resources.commands = Commands;
    return Commands;
});
