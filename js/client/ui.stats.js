define(['loggable'], (Loggable) => {

    const UI_Stats = function(UI) {

        const uiStats = $('#ui-stats');

        let charStats         = null,
            statContainerList = [];

        this.initialize = () => {

            // When the user's character has been created then begin loading the stats
            The.user.hook('initializedUser', this).after(() => {

                // NOTE: This will be called everytime we recreate our character (eg. zoning, respawning)

                if (charStats) {
                    // We already have our stats setup from before, however the character script has been recreated
                    // due to reloadScripts. Just need to sync up and rehook to the new character
                    this.reloadStats();
                } else {
                    // This is our first time creating stats; setup from scratch
                    this.setupStats();
                }
            });
        };

        // Setup Stats
        //
        // This is our initialization/setup routine. After this we load the stats to correctly link the UI to the
        // script. Since scripts can reload, we'll need the UI to re-hook into the character script
        this.setupStats = () => {
            charStats = The.player.character.stats;

            // How many slots do we have? Check and add a canvas for each slot
            for (const statName in charStats) {
                const stat = charStats[statName];
                const uiStat = $('<div/>')
                    .addClass('ui-stats-stat')
                    .appendTo(uiStats);

                const uiStatName = $('<a/>')
                    .addClass('ui-stat-name')
                    .text(statName)
                    .appendTo(uiStat)
                    .after(
                        $('<a/>')
                        .addClass('ui-stats-namecolon')
                        .text(':') );

                const uiStatCurVal = $('<a/>')
                    .addClass('ui-stat-curVal')
                    .text(stat.cur)
                    .appendTo(uiStat)
                    .after(
                        $('<a/>')
                        .addClass('ui-stats-statslash')
                        .text('/') );

                const uiStatCurMaxVal = $('<a/>')
                    .addClass('ui-stat-curMaxVal')
                    .text(stat.curMax)
                    .appendTo(uiStat);
                    // .after(
                    //     $('<a/>')
                    //     .addClass('ui-stats-statslash')
                    //     .text('/') );

                /*
                const uiStatMaxVal = $('<a/>')
                    .addClass('ui-stat-maxVal')
                    .text(stat.max)
                    .appendTo(uiStat);
                */

                const statContainer = {
                    ui: {
                        container: uiStat,
                        name: uiStatName,
                        curVal: uiStatCurVal,
                        curMaxVal: uiStatCurMaxVal,
                        //maxVal: uiStatMaxVal
                    },
                    stat: stat,
                    name: statName,
                    curVal: stat.cur,
                    curMaxVal: stat.curMax,
                    //maxVal: stat.max
                };

                statContainerList.push(statContainer);
            }
        };

        this.reloadStats = () => {

            assert(charStats !== The.player.character.stats, "We're reloading the UI Stats without even having a new character");

            charStats = The.player.character.stats;

            // Need to rehook the stats containers.
            for (let i = 0; i < statContainerList.length; ++i) {
                const statContainer = statContainerList[i];

                statContainer.stat = charStats[statContainer.name];
            }
        }


        this.step = (time) => {

            // TODO: We could listen to an event on the character  statChanged, however that's likely unecessary. Should
            // measure this anyways to see if its worth doing that
            for (let i = 0; i < statContainerList.length; ++i) {
                const statContainer = statContainerList[i],
                    charStat = statContainer.stat;

                if (charStat.cur !== statContainer.curVal ||
                    charStat.curMax !== statContainer.curMaxVal) {// ||
                    //charStat.max !== statContainer.maxVal) {

                    statContainer.ui.curVal.text(charStat.cur);
                    statContainer.ui.curMaxVal.text(charStat.curMax);
                    //statContainer.ui.maxVal.text(charStat.max);

                    statContainer.curVal = charStat.cur;
                    statContainer.curMaxVal = charStat.curMax;
                    //statContainer.maxVal = charStat.max;
                }
            }
        };
    };

    return UI_Stats;
});
