define(['loggable'], (Loggable) => {

    const UI_Effects = function(UI) {

        const uiEffects = $('#ui-effects-buffs');

        let activeEffects = [];

        let effectID = 0;

        // Extend UI
        // UI hooks: UI.addEffect({ effectType: EFFECT_BUFF, data: { buff: BUFF_STINKY_BREATH, time: 10 } })  -- Resources.Effects.Buffs[BUFF_STINKY_BREATH] = { icon: "..", options: [EFFECT_BUFF_HOSTILE, EFFECT_BUFF_TIMER, EFFECT_BUFF_FADES], totalTime: 20 }
        UI.addEffect = (effectToAdd, refID) => {

            if (effectToAdd.effectType === EFFECT_BUFF) {

                const data  = effectToAdd.data,
                    effects = data.effects;

                const effectEl = $('<div/>')
                    .addClass('ui-effects-buff')
                    .append(
                        $('<img/>')
                        .addClass('ui-effects-buff-icon')
                        .attr('src', 'data/icons/deathsickness.png')
                    )
                    .appendTo(uiEffects);

                const effect = {
                    ui: effectEl,
                    tooltip: null,
                    data: data,
                    id: effectID
                    //expires: now() + 1000,
                };

                if (effects.tooltip) {
                    const tooltip = effects.tooltip,
                        tooltipEl = $('<div/>')
                        .addClass('buff-tooltip')
                        .append(
                            $('<div/>')
                            .addClass('buff-tooltip-header')
                            .append(
                                $('<img/>')
                                .addClass('buff-tooltip-icon')
                                .attr('src', 'data/icons/deathsickness.png')
                            )
                            .append(
                                $('<a/>')
                                .addClass('buff-tooltip-title')
                                .text(tooltip.name)
                            )
                        )
                        .append(
                            $('<div/>')
                            .addClass('buff-tooltip-title-sep')
                        )
                        .append(
                            $('<a/>')
                            .addClass('buff-tooltip-description')
                            .text(tooltip.description)
                        )
                        .addClass('hidden')
                        .insertAfter(effectEl);

                    effect.tooltip = tooltipEl;

                    let hoveringEffect = false,
                        hoveringTooltip = false;

                    const updateTooltipDisplay = () => {
                        if (hoveringEffect || hoveringTooltip) {
                            tooltipEl.removeClass('hidden');
                        } else {
                            tooltipEl.addClass('hidden');
                        }
                    };

                    effectEl.hover(() => {
                        // Hover In

                        // FIXME: Cannot get the height of tooltipEl while its hidden
                        const bottom = effectEl.offset().top,
                            top = bottom - tooltipEl.height() - 50; // 50 until we can find the actual height
                        tooltipEl.css({ top: top });
                        hoveringEffect = true;
                        updateTooltipDisplay();
                    }, () => {
                        // Hover Out

                        hoveringEffect = false;
                        updateTooltipDisplay();
                    });

                    tooltipEl.hover(() => {
                        hoveringTooltip = true;
                        updateTooltipDisplay();
                    }, () => {
                        hoveringTooltip = false;
                        updateTooltipDisplay();
                    });
                }

                ++effectID;

                activeEffects.push(effect);
                return effect;
            } else {
                throw Err(`Unknown effect type added: ${effectToAdd.effectType}`);
            }
        };

        UI.getEffects = () => activeEffects;

        UI.removeEffect = (effectID) => {

            let effect = null;
            for (let i = 0; i < activeEffects.length; ++i) {
                if (activeEffects.id === effectID) {
                    effect = activeEffects[i];
                    activeEffects.splice(i, 1);
                    break;
                }
            }

            effect.ui.remove();

            if (effect.tooltip) {
                effect.tooltip.remove();
            }
        };

        this.initialize = () => {

        };

        this.step = (time) => {

            /*
            for (let i = 0; i < activeEffects.length; ++i) {
                let activeEffect = activeEffects[i];
                if (activeEffect.expires <= time) {
                    activeEffect.ui.remove();
                    activeEffects.splice(i, 1);
                    --i;
                }
            }
            */
        };
    };

    return UI_Effects;
});
