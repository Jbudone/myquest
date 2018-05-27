
const InteractionMgr = (new function(){

    this.canvasEl = null;

    let interactables = [];

    const hoveringInteractables = [];
    const hittingInteractable = (worldPt, interactable) => {

        return (
            worldPt.x >= interactable.x &&
            worldPt.x < (interactable.x + interactable.w) &&
            worldPt.y >= interactable.y &&
            worldPt.y < (interactable.y + interactable.h)
        );
    };

    const mouseToCanvasCoords = (evt) => {
        const offset = $(this.canvasEl).offset();
        const worldPt = { x: evt.pageX - offset.left, y: evt.pageY - offset.top };

        return worldPt;
    };

    const onMouseMove = (evt) => {

        //console.log(evt.layerY);
        //console.log(evt.pageY);
        //console.log(evt.offsetY);
        const worldPt = mouseToCanvasCoords(evt);

        // What interactables have we hit?
        const hitInteractions = [];
        interactables.forEach((interactable) => {
            if (hittingInteractable(worldPt, interactable)) {
                hitInteractions.push(interactable);
            }
        });

        // Diff against interactables that we were already hitting
        const newHitInteractions = [],
            oldHitInteractions = [];
        for (let i = 0; i < hitInteractions.length; ++i) {
            const alreadyHitInteraction = hoveringInteractables.find((el) => {
                return el.id === hitInteractions[i].id;
            });

            if (!alreadyHitInteraction) {
                newHitInteractions.push(hitInteractions[i]);
            }
        }

        // Are there any interactions that we're no longer hitting?
        for (let i = 0; i < hoveringInteractables.length; ++i) {
            const interactable = hoveringInteractables[i];
            const stillHovering = (
                worldPt.x >= interactable.x &&
                    worldPt.x < (interactable.x + interactable.w) &&
                    worldPt.y >= interactable.y &&
                    worldPt.y < (interactable.y + interactable.h)
            );

            if (!stillHovering) {
                oldHitInteractions.push(interactable);

                hoveringInteractables.splice(i, 1);
                --i;
            }
        }

        // Hover In new interactions
        newHitInteractions.forEach((hitInteraction) => {
            hitInteraction.onHoverIn();

            hoveringInteractables.push(hitInteraction);
        });

        // Hover Out old interactions
        oldHitInteractions.forEach((hitInteraction) => {
            hitInteraction.onHoverOut();
        });
    };

    const onMouseUp = (evt) => {

        const worldPt = mouseToCanvasCoords(evt);

        // What interactables have we hit?
        const hitInteractions = [];
        hoveringInteractables.forEach((interactable) => {
            if (hittingInteractable(worldPt, interactable)) {
                hitInteractions.push(interactable);
            }
        });

        hitInteractions.forEach((hitInteraction) => {
            hitInteraction.onClick();
        });
    };


    this.load = (canvasEl) => {
        this.canvasEl = canvasEl;

        canvasEl.addEventListener('mousemove', onMouseMove);
        canvasEl.addEventListener('mouseup', onMouseUp);
    };

    this.unload = () => {
        interactables = [];
        entityId = 0;

        this.canvasEl.removeEventListener('mousemove', onMouseMove);
        this.canvasEl.removeEventListener('mouseup', onMouseUp);
    };

    let entityId = 0;
    this.addEntity = (x, y, w, h) => {

        const interaction = {
            x, y, w, h,
            id: (++entityId),

            onHoverIn: () => {},
            onHoverOut: () => {},
            onClick: () => {}
        };

        const setCallbacks = {
            onHoverIn: (cb) => { interaction.onHoverIn = cb; return setCallbacks; },
            onHoverOut: (cb) => { interaction.onHoverOut = cb; return setCallbacks; },
            onClick: (cb) => { interaction.onClick = cb; return setCallbacks; }
        };

        interactables.push(interaction);
        return setCallbacks;
    };
});
