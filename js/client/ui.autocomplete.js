define(['loggable'], (Loggable) => {

    const UI_Autocomplete = function(UI) {

        const uiAutocomplete = $('#ui-autocomplete'),
            uiContainer      = $('#ui-autocomplete-container');

        let cmdEls           = [],
            searchCmd        = '',
            activeCmdEl      = null,
            activeCmdElIdx   = -1;


        // We hook into both global (window) clicks and input clicks. However, since both will come we need a way to
        // tell if the window click has come from an input click. This way we can ignore the window click and handle it
        // purely as an input click
        let pendingInputClick = false;

        this.resize = () => {

            const top = -1 * (uiContainer.height() - 2);
            uiAutocomplete.css({
                'margin-top': top
            });
        };

        this.selectOption = (cmd) => {

            UI.setInput(cmd);
            UI.focusInput();
            this.hideWindow();
        };

        this.addOption = (cmd, desc) => {

            const uiCmd = $('<div/>')
                            .addClass('ui-autocomplete-cmd')
                            .data('cmd', cmd);

            if (desc) {
                // Typed command w/ full description
                const uiAutoCompleteCmd = $('<a/>')
                                            .attr('href', '#')
                                            .addClass('autocomplete')
                                            .addClass('autocomplete-command')
                                            .click(() => {
                                                this.selectOption(cmd);
                                                return false;
                                            })
                                            .append( $('<span/>')
                                                .addClass('autocomplete-typedcmd')
                                                .addClass('autocomplete-command-typedcmd')
                                                .text( cmd )
                                            )
                                            .append( $('<span/>')
                                                .addClass('autocomplete-hint')
                                                .text("Admin")
                                            )
                                            .append( $('<span/>')
                                                .addClass('autocomplete-desc')
                                                .text( desc )
                                            )
                                            .appendTo( uiCmd );
            } else {
                // History cmd?
                const uiAutoCompleteCmd = $('<a/>')
                                            .attr('href', '#')
                                            .addClass('autocomplete')
                                            .addClass('autocomplete-history')
                                            .click(() => {
                                                this.selectOption(cmd);
                                                return false;
                                            })
                                            .append( $('<span/>')
                                                .addClass('autocomplete-typedcmd')
                                                .addClass('autocomplete-history-typedcmd')
                                                .text( cmd )
                                            )
                                            .appendTo( uiCmd );
            }

            uiCmd.appendTo( uiContainer );
                                    
            cmdEls.push(uiCmd);
        };

        this.clearOptions = () => {
            cmdEls.forEach((cmdEl) => {
                cmdEl.remove();
            });

            cmdEls = [];
            activeCmdEl = null;
            activeCmdElIdx = -1;
        };

        this.findMatchingCommands = (search) => {

            const matches = [];
            Resources.commands.forEach((cmd) => {
                if (cmd.typedCommand.indexOf(search) === 0) {
                    matches.push(cmd);
                }
            });

            // FIXME: Search history
            // FIXME: We only want unique history
            const history = [
                { historyCmd: "teleport 100 100" },
                { historyCmd: "teleport 120 37" },
                { historyCmd: "give_buff DeathSickness" },
                { historyCmd: "give_xp 42" },
                { historyCmd: "teleport 0 0" }
            ];

            history.forEach((cmd) => {
                if (cmd.historyCmd.indexOf(search) === 0) {
                    matches.push(cmd);
                }
            });


            return matches;
        };

        this.refreshResults = () => {

            const searchFor = searchCmd.substr(1),
                matches     = this.findMatchingCommands(searchFor);

            // TODO: Of these matches, find the best matches
            const bestMatches = matches.splice(0, 5);

            this.clearOptions();

            bestMatches.forEach((cmd) => {

                if (cmd.typedCommand) {
                    // Command
                    const typedCmd = '/' + cmd.typedCommand;
                    this.addOption(typedCmd, cmd.desc || "lol this one doesn't even have a description!");
                } else {
                    // History
                    const typedCmd = '/' + cmd.historyCmd;
                    this.addOption(typedCmd);
                }
            });

            // TODO: If bestMatches.length !== matches.length then there's more commands; show ellipses to indicate more
            // cmds

            this.resize();
        };

        this.hideWindow = () => {
            this.clearOptions();
            uiAutocomplete.addClass('hidden');
        };

        this.initialize = () => {

            UI.hook('input', this).after((msg) => {

                const trailingWhitespace = (msg[msg.length - 1] === ' ');
                
                msg = msg.trim();
                searchCmd = '';

                if (msg[0] === '/') {
                    uiAutocomplete.removeClass('hidden');

                    searchCmd = msg;

                    // We need to keep a single trailing whitespace in order to search history properly
                    // (eg. '/teleport ' =>  "/teleport 1 1")
                    if (trailingWhitespace) searchCmd += ' ';
                    this.refreshResults();

                    if (cmdEls.length === 0) {
                        this.hideWindow();
                    }
                } else {
                    this.hideWindow();
                }
            });

            UI.hook('inputSubmit', this).before((msg) => {

                if (activeCmdEl) {
                    const cmd = activeCmdEl.data('cmd');
                    this.selectOption(cmd);
                    return false;
                }

                searchCmd = '';
                return true;
            }).after((msg) => {
                this.hideWindow();
            });

            UI.hook('inputTab', this).after((msg, e) => {

                if (e.shiftKey) {
                    --activeCmdElIdx;
                    if (activeCmdElIdx < -1) {
                        activeCmdElIdx = cmdEls.length - 1;
                    }
                } else {
                    ++activeCmdElIdx;
                    if (activeCmdElIdx >= cmdEls.length) {
                        activeCmdElIdx = -1;
                    }
                }

                // Unselect the currently active cmd
                if (activeCmdEl) {
                    activeCmdEl.removeClass('active');
                    activeCmdEl = null;
                }

                if (activeCmdElIdx === -1) {
                    UI.setInput(searchCmd);
                } else {
                    activeCmdEl = cmdEls[activeCmdElIdx];
                    activeCmdEl.addClass('active');

                    const trailingCmd = activeCmdEl.data('cmd').substr(searchCmd.length)
                    UI.setInput(searchCmd + trailingCmd);
                }
            });

            UI.hook('clickedInput', this).after(() => {

                if (searchCmd.length > 0) {
                    uiAutocomplete.removeClass('hidden');

                    this.refreshResults();
                    if (cmdEls.length === 0) {
                        this.hideWindow();
                    }
                }

                pendingInputClick = true;
            });

            UI.hook('clickedWindow', this).after(() => {
                if (!pendingInputClick) {
                    this.hideWindow();
                }

                pendingInputClick = false;
            });
        };

        this.step = () => { };
    };

    return UI_Autocomplete;
});
