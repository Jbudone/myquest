
// Inventory
define(
    [
        'SCRIPTINJECT', 'hookable', 'loggable'
    ],
    (
        SCRIPTINJECT, Hookable, Loggable
    ) => {

        /* SCRIPTINJECT */

        const Slot = function(slot) {
            this.item   = null;
            this.stack  = 0;
            this.active = false;

            if (slot) {
                const item  = slot.item;
                this.item   = Resources.items.list[item];
                this.stack  = slot.stack;
                this.active = slot.active;
            }
        };

        const Inventory = function(character, inventory) {

            extendClass(this).with(Loggable);
            extendClass(this).with(Hookable);
            this.setLogGroup('Inventory');

            // TODO: Its dumb to hook this since there's no need for a pre hook, find something better
            this.registerHook('updatedSlot');

            const _inventory = this;

            // TODO: Item instance? (Symbol fine? Or do we need extra stuff like enchantments etc.?)
            this.slots = [];

            // Copy items from inventory into this
            for (let i = 0; i < inventory.length; ++i) {
                let slot = inventory[i];
                this.slots[i] = new Slot(slot);

                // If this slot was active, then activate it now
                if (slot.active) {

                    // TODO: Should check itmRef, itmBase
                    // TODO: Should abstract this activation with activation/deactivation requests
                    const item   = slot.item,
                        itmRef   = Resources.items.list[item],
                        itmBase  = Resources.items.base[itmRef.base],
                        itemArgs = {
                            args: itmRef.args,
                            action: EVT_ACTIVATE
                        };

                    // TODO: Clean this up and abstract invocation
                    // Since item base scripts may not be loaded yet, may need to queue invocation (eg. when loading
                    // initially and invoking equipped items)
                    if (!itmBase) {
                        Resources.items.loading[itmRef.base].then(() => {

                            const itmBase = Resources.items.base[itmRef.base];
                            const result = itmBase.invoke(item, character, itemArgs);
                            if (_.isError(result)) {
                                throw result;
                            }
                        });
                    } else {
                        const result = itmBase.invoke(item, character, itemArgs);
                        if (_.isError(result)) {
                            throw result;
                        }
                    }
                }
            }


            this.addItem = (itmRef, slot) => {

                this.doHook('updatedSlot').pre(slot);

                if (_.isNumber(slot)) {

                    // TODO: Is there a stack here? Add to the stack
                    // TODO: What if there's another item in the slot?
                    assert(this.slots[slot].item === itmRef || this.slots[slot].stack === 0, "Force adding item to slot which already has another item");
                    this.slots[slot].item = itmRef;
                    ++this.slots[slot].stack;
                    this.doHook('updatedSlot').post(slot);
                } else {

                    // Do we already have the item somewhere? Can we add to its stack?
                    // Otherwise add to the first available empty slot
                    let addToSlotI = null;
                    for (let i = 0; i < this.slots.length; ++i) {
                        let slot = this.slots[i];
                        if (!slot.item && addToSlotI === null) {
                            addToSlotI = i;
                        } else if (slot.item === itmRef && slot.stack < slot.item.stack) {
                            addToSlotI = i;
                            break;
                        }
                    }

                    if (addToSlotI !== null) {
                        const addToSlot = this.slots[addToSlotI];
                        addToSlot.item = itmRef;
                        ++addToSlot.stack;

                        // TODO: Sync w/ db

                        this.doHook('updatedSlot').post(addToSlotI);
                        return addToSlotI;
                    }

                }

                return false;
            };

            this.clearInventory = () => {

                for (let i = 0; i < this.slots.length; ++i) {
                    const slot = this.slots[i],
                        item   = slot.item;
                    if (item) {
                        this.doHook('updatedSlot').pre(i);
                        slot.item = null;
                        slot.stack = 0;
                        this.doHook('updatedSlot').post(i);
                    }
                }
            };

            this.serialize = () => {

                // TODO: Could cache the serialized data and only re-do when dirty
                const serialized = [];
                for (let i = 0; i < this.slots.length; ++i) {
                    const invSlot = this.slots[i],
                        savedSlot = {};

                    savedSlot.stack = invSlot.stack;
                    savedSlot.item = "";
                    savedSlot.active = invSlot.active;

                    if (invSlot.item) {
                        savedSlot.item = invSlot.item.id;
                    }

                    serialized.push(savedSlot);
                }

                return serialized;
            };

            this.getEquipped = (filterType) => {

                const equipped = [];
                for (let i = 0; i < this.slots.length; ++i) {
                    const invSlot = this.slots[i];

                    if (invSlot.active) {
                        // FIXME: We should symbolize itemTypes so that we don't do unnecessary string cmp
                        if (!filterType || invSlot.item.types.indexOf(filterType) > -1) {
                            equipped.push(invSlot.item);
                        }
                    }
                }

                return equipped;
            };

            if (Env.isServer) {

                const player = character.entity.player;

                // TODO: Stealing this function from character.js, should abstract this somewhere
                const confirm = (assertion, evt, errorMessage) => {
                    if (!assertion) {
                        player.respond(evt.id, false, {
                            msg: errorMessage
                        });
                        return false;
                    }

                    return true;
                };


                const useSlot = (evt, data) => {
                    const slotI = data.slot;

                    if
                    (
                        (
                            confirm(_.isObject(data), evt, "No args given") &&
                            confirm('slot' in data && _.isFinite(data.slot), evt, "Bad slot argument given") &&
                            confirm(inRange(data.slot, 0, this.slots.length - 1), evt, "Bad slot index given")
                        ) === false
                    )
                    {
                        return;
                    }


                    const slot = this.slots[slotI];

                    // TODO: Stealing similar code from character.js pickup item; should abstract this in some way

                    if
                    (
                        (
                            confirm(slot.item, evt, "No item in slot") &&
                            confirm(slot.stack > 0, evt, "Not enough items on the stack in slot")
                        ) === false
                    )
                    {
                        return;
                    }

                    const item = slot.item,
                        itmRef = Resources.items.list[item.id];

                    if
                    (
                        (
                            confirm(itmRef.base, evt, "Item does not contain a base script") &&
                            confirm(Resources.items.base[itmRef.base], `Base script (${itmRef.base}) not found`)
                        ) === false
                    )
                    {
                        return;
                    }

                    const itmBase = Resources.items.base[itmRef.base];

                    if (confirm(itmBase.invoke, evt, "Base item script not prepared") === false) {
                        return;
                    }


                    // Use Item
                    if (itmRef.type & ITM_USE) {

                        // Invoke item
                        const result = itmBase.invoke(item.id, character, itmRef.args);

                        if (_.isError(result)) {
                            confirm(false, evt, result.message);
                            return;
                        }

                        // Use up item in slot
                        --slot.stack;
                        if (slot.stack === 0) {
                            slot.item = null;
                        }
                    } else if (itmRef.type & ITM_WEARABLE) {

                        // Wear/Take off item
                        const itemArgs = {
                            args: itmRef.args,
                            action: slot.active ? EVT_DEACTIVATE : EVT_ACTIVATE
                        };

                        const result = itmBase.invoke(item.id, character, itemArgs);

                        if (_.isError(result)) {
                            confirm(false, evt, result.message);
                            return;
                        }

                        slot.active = !slot.active;
                    }

                    player.respond(evt.id, true);
                };

                player.registerHandler(EVT_INV_USE_SLOT);
                player.handler(EVT_INV_USE_SLOT).set(useSlot);


                this.dropSlot = (slotI) => {

                    const slot = this.slots[slotI],
                        item   = slot.item;
                    if (item) {

                        const character = player.movable.character,
                            inventory   = character.inventory,
                            game        = character.entity.page.area.game,
                            sourceTile  = character.entity.position.tile;

                        // Drop items
                        let dropped = null;
                        for (let i = 0; i < slot.stack; ++i) {
                            dropped = game.dropItem(sourceTile, item.id);
                            if (!dropped) break;
                        }

                        slot.item = null;
                        slot.stack = 0;
                    }
                };

            } else {

                this.useSlot = (slotI) => {

                    const slot = this.slots[slotI];

                    if (!slot.item || slot.stack === 0) {
                        return;
                    }
                    
                    server.request(EVT_INV_USE_SLOT, {
                        slot: slotI
                    })
                    .then(() => {

                        // TODO: Should get reply from server to keep track of current stack count, activation status,
                        // etc. (in case there's weird issues with users spam clicking slot and getting out of sync?)
                        this.doHook('updatedSlot').pre(slotI);

                        const item = slot.item;

                        let action = null;

                        if (item.type & ITM_USE) {

                            // Use item in stack
                            const slot = this.slots[slotI];
                            --slot.stack;
                            if (slot.stack === 0) {
                                slot.item = null;
                            }
                        } else if (item.type & ITM_WEARABLE) {

                            // Changed activated status of item in slot
                            if (slot.active) {
                                slot.active = false;
                            } else {
                                slot.active = true;
                            }


                            // TODO: Should abstract this activation with activation/deactivation requests
                            const itmRef   = Resources.items.list[item.id],
                                itmBase    = Resources.items.base[itmRef.base],
                                itemArgs   = {
                                    args: itmRef.args,
                                    action: slot.active ? EVT_ACTIVATE : EVT_DEACTIVATE
                                };

                            // TODO: Clean this up and abstract invocation
                            // Since item base scripts may not be loaded yet, may need to queue invocation (eg. when loading
                            // initially and invoking equipped items)
                            if (!itmBase) {
                                Resources.items.loading[itmRef.base].then(() => {

                                    const itmBase = Resources.items.base[itmRef.base];
                                    const result = itmBase.invoke(item.id, character, itemArgs);
                                    if (_.isError(result)) {
                                        throw result;
                                    }
                                });
                            } else {
                                const result = itmBase.invoke(item.id, character, itemArgs);
                                if (_.isError(result)) {
                                    throw result;
                                }
                            }
                        }

                        this.doHook('updatedSlot').post(slotI);

                    }, (reply) => {
                        The.UI.postMessage(`Could not use item: ${reply.msg}`);
                    })
                    .catch(errorInGame);
                };
            }
        };

        return Inventory;
    });
