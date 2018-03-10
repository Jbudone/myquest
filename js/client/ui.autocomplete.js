define(['loggable'], (Loggable) => {

    const UI_Autocomplete = function(UI) {

        const uiAutocomplete = $('#ui-autocomplete'),
            uiContainer      = $('#ui-autocomplete-container'),
            cmdEls           = [];

        let searchCmd        = '',
            activeCmdEl      = null,
            activeCmdElIdx   = -1;

        this.resize = () => {

            const top = -1 * (uiContainer.height() - 2);
            uiAutocomplete.css({
                'margin-top': top
            });
        };

        this.selectOption = (cmd) => {

            UI.setInput(cmd);
            this.hideWindow();
        };

        this.focusOption = (cmdEl) => {

            // FIXME: Keep track of our current position w/in cmd elements list
            // FIXME: Select option w/out hiding  (autocomplete in textbox)
        };

        this.addOption = (cmd, desc) => {

            const uiCmd = $('<div/>')
                            .addClass('ui-autocomplete-cmd')
                            .append( $('<a/>')
                                .attr('href', '#')
                                .addClass('autocomplete-cmd')
                                .click(() => {
                                    this.selectOption(cmd);
                                    return false;
                                })
                                .append( $('<span/>')
                                    .addClass('autocomplete-typedcmd')
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
                            )
                            .appendTo( uiContainer );
                                    
            cmdEls.push(uiCmd);
        };

        this.clearOptions = () => {
            cmdEls.forEach((cmdEl) => {
                cmdEl.remove();
            });
        };

        this.findMatchingCommands = (search) => {

            const matches = [];
            Resources.commands.forEach((cmd) => {
                if (cmd.typedCommand.indexOf(search) === 0) {
                    matches.push(cmd);
                }
            });

            return matches;
        };

        this.refreshResults = () => {

            const matches = this.findMatchingCommands(searchCmd);

            // TODO: Of these matches, find the best ones
            const bestMatches = matches.splice(0, 5);

            this.clearOptions();

            bestMatches.forEach((cmd) => {
                const typedCmd = '/' + cmd.typedCommand;
                this.addOption(typedCmd, cmd.desc || "lol this one doesn't even have a description!");
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

                msg = msg.trim();

                searchCmd = '';

                if (msg[0] === '/') {
                    uiAutocomplete.removeClass('hidden');

                    searchCmd = msg.substr(1);
                    this.refreshResults();

                    if (cmdEls.length === 0) {
                        this.hideWindow();
                    }
                } else {
                    this.hideWindow();
                }
            });

            UI.hook('inputSubmit', this).after((msg) => {
                this.hideWindow();
            });

            UI.hook('inputTab', this).after((msg) => {

                ++activeCmdElIdx;
                if (activeCmdElIdx > cmdEls.length) {
                    activeCmdElIdx = -1;
                }

                // Unselect the currently active cmd
                if (activeCmdEl) {
                    activeCmdEl.removeClass('active');
                    activeCmdEl = null;
                }

                if (activeCmdElIdx === -1) {

                } else {
                    activeCmdEl = cmdEls[activeCmdElIdx];
                    activeCmdEl.addClass('active');
                }
            });
        };

        this.step = () => { };
    };

    return UI_Autocomplete;
});
