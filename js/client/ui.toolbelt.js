define(['loggable'], (Loggable) => {

    const UI_Toolbelt = function(UI) {

        const uiToolbelt = $('#ui-toolbelt');

        let toolbeltContainerEl = $('#toolbelt-container');

        this.initialize = () => {

            const toolbeltBtnEl = $('<div/>')
                    .attr('id', 'toolbelt-btn')
                    .prependTo(uiToolbelt),
                toolbeltLinkEl = $('<a/>')
                    .attr('href', '#')
                    .attr('id', 'toolbelt-link')
                    .appendTo(toolbeltBtnEl)
                    .click(() => { return false; });

            Resources.fetchImage('toolbelt').then((img) => {
                toolbeltImgEl = $(img).clone()
                                    .attr('id', 'toolbelt-img')
                                    .appendTo(toolbeltLinkEl);
            });

            this.addOption("Full Heal", () => {
                The.scripting.server.request(CMD_HEAL, {}
                ).then((data) => {
                    The.UI.postMessage("Heal Command: Success");
                }, (data) => {
                    The.UI.postMessage("Heal Command: Failed");
                })
                .catch(errorInGame);

                The.UI.postMessage("FULLY HEAL REQUEST");
            });

            this.addOption("Set Random Health", () => {
                The.scripting.server.request(CMD_RAND_HEALTH, {}
                ).then((data) => {
                    The.UI.postMessage("Random Health Command: Success");
                }, (data) => {
                    The.UI.postMessage("Random Health Command: Failed");
                })
                .catch(errorInGame);

                The.UI.postMessage("SET RANDOM HEALTH REQUEST");
            });
        };

        this.addOption = (label, callback) => {

            const optionEl = $('<a/>')
                .attr('href', '#')
                .addClass('toolbelt-option')
                .append( $('<span/>')
                        .addClass('toolbelt-option-label')
                        .text(label) )
                .click(() => {
                    callback();
                    return false;
                })
                .appendTo(toolbeltContainerEl);
        };

        this.step = () => { };
    };

    return UI_Toolbelt;
});
