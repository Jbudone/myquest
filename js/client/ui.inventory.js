define(['loggable'], (Loggable) => {

    const UI_Inventory = function(UI) {

        let inventory = null,
            slots = [];

        const MOUSE_LEFT = 1,
            MOUSE_RIGHT = 3;

        this.touchSlot = (index, action) => {

            const slot = slots[index];

            // Do we have an item here?
            if (slot.slot.stack === 0 || !slot.slot.item) {
                return;
            }

            // TODO: Interact with slot
            // Need to handle a few interactions with slots:
            //  - Use/Wear item
            //  - Grab/Drop item (used for re-ordering items in slots)
            //  - Context menu
            // 
            // It may be best to have one button (left?) mouseup for using the item, and the other for
            // activating the context menu. To grab an item we could use left but make the player hold the
            // mouse down or move it in order to activate the grab action. Once we have an item in hand,
            // clicking anywhere on the map or inventory results in dropping that item. One problem however
            // is if we drop it into another slot that has an item. We may need to use a workaround of
            // switching places for the items rather than holding onto the 2nd item afterwards
            if (action === MOUSE_LEFT) {

                // Left Click: grab/drop item
                // TODO
                inventory.useSlot(index);
            } else if (action === MOUSE_RIGHT) {

                // Right Click: use/wear
                inventory.useSlot(index);
            }
        };

        // Setup Inventory
        //
        // This is our initialization/setup routine. After this we load the inventory to correctly link the UI to the
        // script. Since scripts can reload, we'll need the UI to re-hook into the script
        this.setupInventory = () => {
            inventory = The.player.character.inventory;

            const uiInventoryBag = $('#ui-inventory-bag');

            // How many slots do we have? Check and add a canvas for each slot
            for (let i = 0; i < inventory.slots.length; ++i) {
                const uiSlot = $('<canvas/>')
                    .addClass('ui-inventory-slot');

                const uiSlotStack = $('<div/>')
                    .addClass('ui-inventory-slot-stack');

                const slotContainer = $('<div/>')
                    .addClass('ui-inventory-slot-container')
                    .append(uiSlot)
                    .append(uiSlotStack)
                    .appendTo(uiInventoryBag)
                    .mouseenter(() => {

                        if (inventory.slots[i].item) {
                            slotContainer.addClass('hover');
                            uiSlot.addClass('hover');
                        }

                        FX.event('click', $(this), {});
                    }).mouseleave(() => {
                        slotContainer.removeClass('hover');
                        uiSlot.removeClass('hover');
                    }).click((evt) => {
                        this.touchSlot(i, evt.which);
                    });

                const ctxSlot = uiSlot[0].getContext('2d');

                const slot = {
                    ui: uiSlot,
                    uiStack: uiSlotStack,
                    ctx: ctxSlot,
                    slot: inventory.slots[i],
                    needsUpdate: true
                };

                slots.push(slot);
            }

            inventory.hook('updatedSlot', this).after((slotIndex) => {
                slots[slotIndex].needsUpdate = true;
            });
        };

        this.reloadInventory = () => {

            assert(inventory !== The.player.character.inventory, "We're reloading the UI Inventory without even having a new inventory");

            inventory = The.player.character.inventory;

            // Need to rehook the inventory. Since the inventory script could have been reloaded, we'll need to update
            // our slots to hook into the new inventory script
            for (let i = 0; i < slots.length; ++i) {

                const uiSlot = slots[i];
                uiSlot.slot = inventory.slots[i];
                uiSlot.needsUpdate = true;
            }

            inventory.hook('updatedSlot', this).after((slotIndex) => {
                slots[slotIndex].needsUpdate = true;
            });
        };

        this.initialize = () => {

            // When the user's character has been created then begin loading the inventory
            The.user.hook('initializedUser', this).after(() => {

                // NOTE: This will be called everytime we recreate our character (eg. zoning, respawning)

                if (inventory) {
                    // We already have our inventory setup from before, however the inventory script has been recreated
                    // due to reloadScripts. Just need to sync up and rehook to the new inventory
                    this.reloadInventory();
                } else {
                    // This is our first time creating the inventory; setup from scratch
                    this.setupInventory();
                }
            });
        };

        this.step = (time) => {

            if (!inventory) {
                return;
            }

            // TODO: Draw each slot
            for (let i = 0; i < slots.length; ++i) {

                const uiSlot = slots[i];

                if (!uiSlot.needsUpdate) {
                    continue;
                }

                uiSlot.needsUpdate = false;

                const active = uiSlot.slot.active;
                let w = uiSlot.ui[0].width;
                let h = uiSlot.ui[0].height;
                uiSlot.ctx.clearRect(0, 0, w, h);

                if (active) {
                    uiSlot.ui.addClass('active');
                    uiSlot.ui.parent().addClass('active');
                } else {
                    uiSlot.ui.removeClass('active');
                    uiSlot.ui.parent().removeClass('active');
                }

                if (!uiSlot.slot.item) {
                    uiSlot.uiStack.text("");
                    continue;
                }


                // Rendering Inventory
                // This either needs to be done through canvas or pure html. Since we're using spritesheets to represent
                // sprites we would end up wasting cycles on unecessary drawing operations for the entire spritesheet as
                // opposed to just the single sprite. HTML is obviously less flexible too, so I'm writing the renderer
                // through the canvas approach instead.
                //
                // Intuitively it makes sense that the renderer handles all drawing operations, however abstracting the
                // renderer just for UI components seems kind of overkill right now, so I'm stealing some of the
                // renderer operations and running them here instead. It may be worth it to abstract the renderer and
                // push all drawing operations onto the base renderer instead later.
                //
                // TODO: Abstract renderer and handle UI components through renderer rather than here
                // TODO: It may make more sense to have 1 canvas for the entire inventory

                const sprite    = uiSlot.slot.item.sprite,
                    sheetData   = The.renderer.sheetFromGID(sprite),
                    tilesPerRow = sheetData.tilesPerRow,
                    sy          = Math.max(-1, Math.floor((sprite - sheetData.gid.first) / tilesPerRow)),
                    sx          = Math.max(-1, (sprite - sheetData.gid.first) % tilesPerRow),
                    tileSize    = sheetData.tileSize.width;

                const px = 0, py = 0;

                uiSlot.ctx.drawImage(
                    sheetData.image,
                    tileSize * sx, tileSize * sy,
                    tileSize, tileSize,
                    px, py,
                    w, h
                );

                let stackText = "";
                if (uiSlot.slot.stack > 1) {
                    stackText = uiSlot.slot.stack;
                }
                uiSlot.uiStack.text(stackText);

                // Activated item
                if (active) {
                    uiSlot.ctx.fillStyle = 'rgba(100, 0, 0, 0.5)';
                    uiSlot.ctx.fillRect(0, 0, w, h);
                }
            }
        };
    };

    return UI_Inventory;
});
