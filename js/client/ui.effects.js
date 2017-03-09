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
                    data: data,
                    id: effectID
                    //expires: now() + 1000,
                };

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
