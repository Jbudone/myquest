define(['loggable'], (Loggable) => {

    const UI_CharBars = function(UI) {

        const uiCharBars = $('#ui-charBars');

        let charComponentsContainer = null;

        this.initialize = () => {

            The.user.hook('initializedUser', this).after(() => {

                if (charComponentsContainer) {
                    this.reloadComponents();
                } else {
                    this.setupComponents();
                }
            });
        };

        // Setup Components
        //
        // This is our initialization/setup routine. After this we load the components to correctly link the UI to the
        // script. Since scripts can reload, we'll need the UI to re-hook into the character script
        this.setupComponents = () => {

            charComponentsContainer = {
                levelling: null
            };

            const component = The.player.character.charComponent('levelling'),
                levellingEl = $('<div/>')
                    .attr('id', 'charBar-levelling')
                    .appendTo(uiCharBars),
                levelContainerEl = $('<div/>')
                    .attr('id', 'charBar-levelling-level-container')
                    .appendTo(levellingEl),
                XPContainerEl = $('<div/>')
                    .attr('id', 'charBar-levelling-XP-container')
                    .appendTo(levellingEl),
                levelEl = $('<a/>')
                    .attr('id', 'charBar-levelling-level')
                    .appendTo(levelContainerEl)
                    .before(
                        $('<a/>')
                        .addClass('charBar-levelling-name')
                        .text('Level: ')
                    )
                XPEl = $('<a/>')
                    .attr('id', 'charBar-levelling-xp')
                    .appendTo(XPContainerEl)
                    .before(
                        $('<a/>')
                        .addClass('charBar-levelling-name')
                        .text('XP: ')
                    ),
                XPNextEl = $('<a/>')
                    .attr('id', 'charBar-levelling-xpNext')
                    .insertAfter(XPEl)
                    .before(
                        $('<a/>')
                        .attr('id', 'charBar-levelling-xpSep')
                        .text('/')
                    );

            charComponentsContainer.levelling = {
                component: component,
                level: null,
                XP: null,
                XPNext: null,
                levelEl: levelEl,
                XPEl: XPEl,
                XPNextEl: XPNextEl
            };
        };

        this.reloadComponents = () => {
            charComponentsContainer.levelling.component = The.player.character.charComponent('levelling');
        }


        this.step = (time) => {
            if (charComponentsContainer) {
                const componentContainer = charComponentsContainer.levelling,
                    component = charComponentsContainer.levelling.component;
                // Has anything changed?
                if
                (
                    component.level !== componentContainer.level ||
                    component.XP !== componentContainer.XP ||
                    component.nextLevelXP() !== componentContainer.XPNext
                )
                {
                    componentContainer.levelEl.text(charComponentsContainer.levelling.component.level);
                    componentContainer.XPEl.text(charComponentsContainer.levelling.component.XP);

                    const nextLevelXP = component.nextLevelXP();
                    componentContainer.XPNextEl.text(nextLevelXP);

                    componentContainer.level = component.level;
                    componentContainer.XP = component.XP;
                    componentContainer.XPNext = nextLevelXP;
                }
            }
        };
    };

    return UI_CharBars;
});
