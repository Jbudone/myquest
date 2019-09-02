
const CTRL_KEY = 1, ALT_KEY = 2, SHIFT_KEY = 3;

const InteractionMgr = (function(){

    this.canvasEl = null;

    let interactables = [],
        dragging = {
            interactions: [],
            mouseDownPos: null
        },
        mouseButtons = [],
        modifiers = [];

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

    let scaleX = 1.0, scaleY = 1.0;
    this.setCanvasScale = (x, y) => {
        scaleX = x;
        scaleY = y;
    };

    let offsetX = 0.0, offsetY = 0.0;
    this.setCameraOffset = (x, y) => {
        offsetX = x;
        offsetY = y;
    };

    const mouseToCanvasCoords = (evt) => {
        const offset = $(this.canvasEl).offset();
        const worldPt = { x: evt.pageX - offset.left, y: evt.pageY - offset.top };
        worldPt.x *= scaleX;
        worldPt.y *= scaleY;

        worldPt.x += offsetX;
        worldPt.y += offsetY;

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
        const draggedDist = {
            x: 0, y: 0
        };

        if (dragging.mouseDownPos) {
            draggedDist.x = worldPt.x - offsetX - dragging.mouseDownPos.x;
            draggedDist.y = worldPt.y - offsetY - dragging.mouseDownPos.y;
        }

        if (dragging.interactions.length > 0) {
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

        this.onMouseMove(worldPt);

        if (mouseButtons[1]) {
            this.onMiddleMouseDrag(worldPt, draggedDist);
        } else if (mouseButtons[2]) {
            this.onRightMouseDrag(worldPt, draggedDist);
        }

        modifiers[SHIFT_KEY] = evt.shiftKey;
        modifiers[CTRL_KEY]  = evt.ctrlKey;
        modifiers[ALT_KEY]   = evt.altKey;
    };

    const onMouseUp = (evt) => {

        const worldPt = mouseToCanvasCoords(evt);

        mouseButtons[evt.button] = false;
        dragging.mouseDownPos = null;

        if (evt.button === 1) {
            this.onMiddleMouseClick(worldPt);
            return;
        } else if (evt.button === 2) {
            this.onRightMouseClick(worldPt);
            return;
        }

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
            });
        }
        dragging.mouseDownPos = { x: worldPt.x - offsetX, y: worldPt.y - offsetY };

        const now = (new Date()).getTime(),
            timeSinceLastClick = now - lastMouseDown;
        if (timeSinceLastClick < 150) {
            onMouseDblClick(hitInteractions, evt);
        } else {
            lastMouseDown = now;
        }
        
        mouseButtons[evt.button] = true;

        modifiers[SHIFT_KEY] = evt.shiftKey;
        modifiers[CTRL_KEY]  = evt.ctrlKey;
        modifiers[ALT_KEY]   = evt.altKey;

        evt.cancelBubble = true;
        evt.stopPropagation();
        evt.preventDefault();
        return false;
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

        modifiers[SHIFT_KEY] = evt.shiftKey;
        modifiers[CTRL_KEY]  = evt.ctrlKey;
        modifiers[ALT_KEY]   = evt.altKey;
    };

    const onKeyDown = (evt) => {
        let couldDrag = hoveringInteractables.find((int) => int.canDrag) !== undefined;
        if (couldDrag && evt.ctrlKey) {
            $(this.canvasEl).addClass('interactionGrab');
        }

        modifiers[SHIFT_KEY] = evt.shiftKey;
        modifiers[CTRL_KEY]  = evt.ctrlKey;
        modifiers[ALT_KEY]   = evt.altKey;
    };


    this.load = (canvasEl) => {
        this.canvasEl = canvasEl;

        canvasEl.addEventListener('mousemove', onMouseMove);
        canvasEl.addEventListener('mouseup', onMouseUp);
        canvasEl.addEventListener('mousedown', onMouseDown);

        // FIXME: Couldn't get this to work off canvasEl
        window.addEventListener('keyup', onKeyUp);
        window.addEventListener('keydown', onKeyDown);

        document.addEventListener("contextmenu", function(e){
            e.preventDefault();
        }, false);
    };

    this.reset = () => {
        interactables = [];
        entityId = 0;

        this.setCanvasScale(1.0, 1.0);
        this.setCameraOffset(0.0, 0.0);
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

    this.hasEntity = (x, y) => {
        return interactables.find((interactable) => interactable.x === x && interactable.y === y);
    };

    this.hasModifier = (modifier) => {
        return modifiers[modifier];
    };

    this.onMouseMove = () => {};
    this.onMiddleMouseClick = () => {};
    this.onMiddleMouseDrag = () => {};
    this.onRightMouseClick = () => {};
    this.onRightMouseDrag = () => {};
});
