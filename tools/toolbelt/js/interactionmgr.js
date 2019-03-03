
const InteractionMgr = (new function(){

    this.canvasEl = null;

    let interactables = [],
        dragging = {
            interactions: [],
            mouseDownPos: null
        };

    let lastMouseDown = (new Date()).getTime();

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

        let couldDrag = false;

        // What interactables have we hit?
        const hitInteractions = [];
        interactables.forEach((interactable) => {
            if (hittingInteractable(worldPt, interactable)) {
                hitInteractions.push(interactable);
                if (interactable.canDrag) couldDrag = true;
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

        // Draging interaction
        if (dragging.interactions.length > 0) {
            const draggedDist = {
                x: worldPt.x - dragging.mouseDownPos.x,
                y: worldPt.y - dragging.mouseDownPos.y
            };
            dragging.interactions.forEach((interaction) => {
                interaction.onDrag(draggedDist, worldPt);
            });
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

        if (couldDrag && evt.ctrlKey) {
            $(this.canvasEl).addClass('interactionGrab');
        } else {
            $(this.canvasEl).removeClass('interactionGrab');
        }
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

        if (dragging.interactions.length > 0) {

            // Stop dragging interactions
            dragging.interactions.forEach((interaction) => {
                interaction.onEndDrag();

                $(this.canvasEl).removeClass('interactionGrabbing');
            });
            dragging.interactions = [];
        } else {

            // Otherwise handle as a click event
            hitInteractions.forEach((hitInteraction) => {
                hitInteraction.onClick();
            });
        }
    };

    const onMouseDown = (evt) => {

        const worldPt = mouseToCanvasCoords(evt);

        // What interactables have we hit?
        const hitInteractions = [];
        hoveringInteractables.forEach((interactable) => {
            if (hittingInteractable(worldPt, interactable)) {
                hitInteractions.push(interactable);
            }
        });

        // Dragging interactions
        if (evt.ctrlKey) {
            hitInteractions.forEach((hitInteraction) => {
                if (hitInteraction.canDrag) {
                    hitInteraction.onBeginDrag();
                    dragging.interactions.push(hitInteraction);

                    $(this.canvasEl).addClass('interactionGrabbing');
                }
                dragging.mouseDownPos = worldPt;
            });
        }

        const now = (new Date()).getTime(),
            timeSinceLastClick = now - lastMouseDown;
        if (timeSinceLastClick < 150) {
            onMouseDblClick(hitInteractions, evt);
        } else {
            lastMouseDown = now;
        }
        
    };

    const onMouseDblClick = (hitInteractions, evt) => {

        if (evt.ctrlKey) {
            return;
        }

        // Are we hitting any spriteGroups?
        hitInteractions.forEach((hitInteraction) => {
            if (hitInteraction.canDblClick) {
                hitInteraction.onDblClick();
            }
        });
    };

    const onKeyUp = (evt) => {
        if (!evt.ctrlKey) {
            $(this.canvasEl).removeClass('interactionGrab');
        }
    };

    const onKeyDown = (evt) => {
        let couldDrag = hoveringInteractables.find((int) => int.canDrag) !== undefined;
        if (couldDrag && evt.ctrlKey) {
            $(this.canvasEl).addClass('interactionGrab');
        }
    };


    this.load = (canvasEl) => {
        this.canvasEl = canvasEl;

        canvasEl.addEventListener('mousemove', onMouseMove);
        canvasEl.addEventListener('mouseup', onMouseUp);
        canvasEl.addEventListener('mousedown', onMouseDown);

        // FIXME: Couldn't get this to work off canvasEl
        window.addEventListener('keyup', onKeyUp);
        window.addEventListener('keydown', onKeyDown);
    };

    this.unload = () => {
        interactables = [];
        entityId = 0;

        this.canvasEl.removeEventListener('mousemove', onMouseMove);
        this.canvasEl.removeEventListener('mouseup', onMouseUp);
        this.canvasEl.removeEventListener('mousedown', onMouseDown);

        // FIXME
        window.removeEventListener('keyup', onKeyUp);
        window.removeEventListener('keydown', onKeyDown);
    };

    let entityId = 0;
    this.addEntity = (x, y, w, h) => {

        const interaction = {
            x, y, w, h,
            id: (++entityId),

            canDrag: false,
            canDblClick: false,

            onHoverIn: () => {},
            onHoverOut: () => {},
            onClick: () => {},
            onBeginDrag: () => {},
            onEndDrag: () => {},
            onDrag: () => {},
            onDblClick: () => {}
        };

        const interactionFunctions = {

            // Callbacks
            onHoverIn: (cb) => { interaction.onHoverIn = cb; return interactionFunctions; },
            onHoverOut: (cb) => { interaction.onHoverOut = cb; return interactionFunctions; },
            onClick: (cb) => { interaction.onClick = cb; return interactionFunctions; },
            onDblClick: (cb) => { interaction.onDblClick = cb; interaction.canDblClick = !!cb; return interactionFunctions; },
            onDrag: (cb) => { interaction.onDrag = cb; return interactionFunctions; },
            onBeginDrag: (cb) => { interaction.onBeginDrag = cb; return interactionFunctions; },
            onEndDrag: (cb) => { interaction.onEndDrag = cb; return interactionFunctions; },

            // Functions
            setCanDrag: (canDrag) => { interaction.canDrag = canDrag; return interactionFunctions; },
            move: (x, y) => { interaction.x = x; interaction.y = y; return interactionFunctions; },
            remove: () => { const idx = interactables.findIndex((ent) => ent === interaction); interactables.splice(idx, 1); },
            stopDragging: () => {
                interaction.onEndDrag();
                $(this.canvasEl).removeClass('interactionGrabbing');
                dragging.interactions = [];

                return interactionFunctions;
            }
        };

        interactables.push(interaction);
        return interactionFunctions;
    };
});
