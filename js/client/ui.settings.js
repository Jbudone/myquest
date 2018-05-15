define(['loggable'], (Loggable) => {

    const UI_Settings = function(UI) {

        const uiSettings = $('#ui-settings');

        let settingsContainer = null;

        this.settings = {
            muted: false
        };

        this.loadSettings = () => {

            Object.keys(this.settings).forEach((key) => {
                const setting = localStorage.getItem(`settings.${key}`);
                if (setting !== null) {
                    this.settings[key] = setting === "true";
                }
            });

            if (this.settings.muted) {
                FX.setVolume(0.0);
            } else {
                FX.setVolume(1.0);
            }
        };

        this.saveSettings = () => {

            _.forEach(this.settings, (setting, key) => {
                localStorage.setItem(`settings.${key}`, setting);
            });
        };

        this.initialize = () => {

            if (FX.settings.volume === 0) this.settings.muted = true;

            this.loadSettings();

            const saveSettings = this.saveSettings;
            const volumeContainerEl = $('<div/>')
                    .attr('id', 'settings-volume')
                    .appendTo(uiSettings),
                volumeLinkEl = $('<a/>')
                    .attr('href', '#')
                    .appendTo(volumeContainerEl)
                    .click(() => {
                        this.settings.muted = !this.settings.muted;
                        FX.setVolume(this.settings.muted ? 0.0 : 1.0);
                        saveSettings();

                        if (this.settings.muted) {
                            volumeMutedImgEl.removeClass('hidden');
                            volumeUnmutedImgEl.addClass('hidden');
                        } else {
                            volumeUnmutedImgEl.removeClass('hidden');
                            volumeMutedImgEl.addClass('hidden');
                        }

                        return false;
                    });

            let volumeMutedImgEl, volumeUnmutedImgEl;

            Resources.fetchImage('muted').then((img) => {
                volumeMutedImgEl = $(img).clone()
                                        .addClass('settings-volume-img')
                                        .addClass('volume-muted')
                                        .addClass('hidden')
                                        .appendTo(volumeLinkEl);

                if (this.settings.muted) {
                    volumeMutedImgEl.removeClass('hidden');
                }
            });

            Resources.fetchImage('unmuted').then((img) => {
                volumeUnmutedImgEl = $(img).clone()
                                            .addClass('settings-volume-img')
                                            .addClass('volume-unmuted')
                                            .appendTo(volumeLinkEl);

                if (this.settings.muted) {
                    volumeUnmutedImgEl.addClass('hidden');
                }
            });
        };

        this.step = () => { };
    };

    return UI_Settings;
});
