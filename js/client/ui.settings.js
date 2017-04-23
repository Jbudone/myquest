define(['loggable'], (Loggable) => {

    const UI_Settings = function(UI) {

        const uiSettings = $('#ui-settings');

        let settingsContainer = null;

        this.settings = {
            muted: false
        };

        this.initialize = () => {

            if (FX.settings.volume === 0) this.settings.muted = true;

            const volumeContainerEl = $('<div/>')
                    .attr('id', 'settings-volume')
                    .appendTo(uiSettings),
                volumeLinkEl = $('<a/>')
                    .attr('href', '#')
                    .appendTo(volumeContainerEl)
                    .click(() => {
                        this.settings.muted = !this.settings.muted;
                        FX.setVolume(this.settings.muted ? 0.0 : 1.0);

                        volumeImgEl.attr('src', `data/icons/${this.settings.muted ? "muted" : "unmuted"}.png`);
                        return false;
                    }),
                volumeImgEl = $('<img/>')
                    .attr('src', `data/icons/${this.settings.muted ? "muted" : "unmuted"}.png`)
                    .addClass('settings-volume-img')
                    .appendTo(volumeLinkEl);
        };

        this.step = () => { };
    };

    return UI_Settings;
});
