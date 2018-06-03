
const ModTilesheet = (function(containerEl){

    let resImg       = null,
        canvasEl     = $('#tilesheetCanvas')[0],
        canvasCtx    = canvasEl.getContext('2d'),
        resource     = null,
        sprites      = null,
        spriteGroups = null;

    // Virtual Canvas
    // In some cases we may manipulate the canvas (move around groups of sprites in generated spritesheets); to do this
    // we need to draw changes to a virtual canvas, and use that for drawing to the actual canvas
    let virtualCanvasEl  = $('#tilesheetVirtualCanvas')[0],
        virtualCanvasCtx = virtualCanvasEl.getContext('2d'),
        virtualCanvasImg = null;

    let imgReady = false,
        pendingChanges = false;

    let highlights = [],
        highlightedIslands = [];

    let activeAction = null,
        activeActionEl = null;

    const ACTION_COLLISION = 1,
        ACTION_FLOATING    = 2,
        ACTION_SHOOTABLE   = 3,
        ACTION_OBJECT      = 4,
        ACTION_EXTRACT     = 5;

    const entities = {
        collision: [],
        floating: [],
        shootable: [],
        objects: {},
        extracts: {}
    };

    let extractGroups = {};

    const addObjectEntity = (obj, id) => {

        const objectEl = $('<a/>')
                            .attr('href', '#')
                            .addClass('tilesheetObject')
                            .text(id)
                            .click(() => {
                                return false;
                            });

        entities.objects[obj] = {
            id,
            el: objectEl
        };
        $('#tilesheetObjects').append(objectEl);
    };

    const addExtractGroup = (groupId, sheetId) => {

        const groupEl = $('<div/>')
                            .addClass('tilesheetGroup');
        extractGroups[groupId] = {
            sheetId,
            list: [],
            el: null
        };
    };

    const addEntityExtraction = (obj, groupId) => {

        if (!extractGroups[groupId]) {
            addExtractGroup(groupId, 'autoSheet');
        }

        const extractGroup = extractGroups[groupId];
        extractGroup.list.push({
            obj
        });

        entities.extracts[obj] = {
            groupId,
            extractGroup
        };
    };

    const toggleEntity = (ent) => {

        let entityGroup = null;
             if (activeAction === ACTION_COLLISION) entityGroup = entities.collision;
        else if (activeAction === ACTION_FLOATING)  entityGroup = entities.floating;
        else if (activeAction === ACTION_SHOOTABLE) entityGroup = entities.shootable;
        else if (activeAction === ACTION_OBJECT)    entityGroup = entities.objects;
        else if (activeAction === ACTION_EXTRACT)   entityGroup = entities.extracts;

        if (entityGroup) {

            if (activeAction === ACTION_OBJECT) {
                // Special case: object list
                if (entityGroup[ent]) {
                    entityGroup[ent].el.remove();
                    delete entityGroup[ent];
                } else {
                    addObjectEntity(ent, 'New item');
                }
            } else if (activeAction === ACTION_EXTRACT) {
                // Special case: object list
                if (entityGroup[ent]) {
                    delete entityGroup[ent];
                } else {

                    let extractGroupId = 'newGroup',
                        extractGroupList = Object.keys(extractGroups);
                    if (extractGroupList.length > 0) {
                        extractGroupId = extractGroupList[0];
                    }

                    addEntityExtraction(ent, extractGroupId);
                }
            } else {

                // Do we already have this entity in the group?
                const idx = entityGroup.findIndex((e) => parseInt(e, 10) === ent);
                if (idx >= 0) {
                    // Already had this entity, remove it
                    entityGroup.splice(idx, 1);
                } else {
                    // Add entity
                    entityGroup.push(ent);
                }
            }

            this.flagPendingChanges();
        }
    };

    this.load = (_resource) => {

        resource = _resource;


        if (resource.generated) {
            spriteGroups = [];
            sprites = [];
            resource.sprites.forEach((sprite) => {
                sprites.push({
                    source: sprite.source,
                    sprite: sprite.sprite,
                    dstX: sprite.dstX,
                    dstY: sprite.dstY,
                    newDstX: sprite.dstX,
                    newDstY: sprite.dstY,
                    spriteGroup: null
                });
            });
        }

        InteractionMgr.load(canvasEl);

        // Draw image
        resImg = new Image();
        resImg.onload = () => {
            imgReady = true;

            canvasEl.width = resImg.width;
            canvasEl.height = resImg.height;
            virtualCanvasEl.width = resImg.width;
            virtualCanvasEl.height = resImg.height;

            $(canvasEl).width(resImg.width);
            $(canvasEl).height(resImg.height);
            $(virtualCanvasEl).width(resImg.width);
            $(virtualCanvasEl).height(resImg.height);

            // Add grid interaction
            const tilesize = parseInt(resource.tilesize, 10);
            for (let y = 0; y < resImg.height; y += tilesize) {
                for (let x = 0; x < resImg.width; x += tilesize) {

                    const entity = { x: x, y: y, w: tilesize, h: tilesize };
                    InteractionMgr.addEntity(entity.x, entity.y, entity.w, entity.h)
                                    .onHoverIn(() => {
                                        highlights.push(entity);
                                    })
                                    .onHoverOut(() => {
                                        const idx = highlights.findIndex((e) => {
                                            return e.id === entity.id;
                                        });

                                        highlights.splice(idx, 1);
                                    })
                                    .onClick(() => {
                                        const ent = ((entity.x / tilesize) % resource.columns) + ((entity.y / tilesize) * parseInt(resource.columns, 10));
                                        toggleEntity(ent);
                                    });
                }
            }

            // Generated tilesheets: Add sprite groups/island interaction
            if (resource.generated) {
                resource.spriteGroups.forEach((spriteGroup) => {

                    let augmentedSpriteGroup = [];
                    spriteGroup.spriteIsland.forEach((sprite) => {

                        let spritesSprite = null; 
                        for (let i = 0; i < sprites.length; ++i) {
                            if
                            (
                                (sprite.dstX * tilesize) === sprites[i].dstX && 
                                (sprite.dstY * tilesize) === sprites[i].dstY
                            )
                            {
                                sprites[i].spriteGroup = spriteGroup;
                                augmentedSpriteGroup.push({
                                    sprite: sprites[i]
                                });
                                spritesSprite = sprites[i];
                                break;
                            }
                        }

                        const entity = {
                            x: sprite.dstX * tilesize,
                            y: sprite.dstY * tilesize,
                            w: tilesize,
                            h: tilesize
                        };
                        const interactable = InteractionMgr.addEntity(entity.x, entity.y, entity.w, entity.h)
                                        .onHoverIn(() => {
                                            highlightedIslands.push(augmentedSpriteGroup);
                                        })
                                        .onHoverOut(() => {
                                            for (let i = 0; i < highlightedIslands.length; ++i) {
                                                if (highlightedIslands[i] === augmentedSpriteGroup) {
                                                    highlightedIslands.splice(i, 1);
                                                    break;
                                                }
                                            }
                                        })
                                        .setCanDrag(true)
                                        .onBeginDrag(() => {
                                            for (let j = 0; j < augmentedSpriteGroup.length; ++j) {
                                                const sprite = augmentedSpriteGroup[j].sprite;
                                                sprite.dragStartX = sprite.newDstX;
                                                sprite.dragStartY = sprite.newDstY;
                                            }
                                        })
                                        .onDrag((dist) => {

                                            // FIXME: Potential area that we could translate sprites to. This could
                                            // make it feel smoother/natural when its colliding w/ other sprites and
                                            // can't translate to the exact position that you specified
                                            const potentialTranslations = [{
                                                x: Math.floor(Math.abs(dist.x / tilesize)) * (dist.x < 0 ? -1 : 1),
                                                y: Math.floor(Math.abs(dist.y / tilesize)) * (dist.y < 0 ? -1 : 1)
                                            }];

                                            if (potentialTranslations[0].x === 0 && potentialTranslations[0].y === 0) return;


                                            // FIXME: Should setup a collision bitmask over each row for quicker
                                            // collision detection; then update collisions on sprite moved
                                            const isAcceptableTranslation = (sprite, translation) => {
                                                const x = (sprite.dragStartX / tilesize) + translation.x,
                                                    y = (sprite.dragStartY / tilesize) + translation.y;

                                                if (x < 0 || x >= resource.columns || y < 0 || y >= resource.rows) {
                                                    return false;
                                                }

                                                for (let i = 0; i < sprites.length; ++i) {
                                                    const existingSprite = sprites[i];
                                                    if (existingSprite.spriteGroup === sprite.spriteGroup) continue;

                                                    if (existingSprite.newDstX === (x * tilesize) && existingSprite.newDstY === (y * tilesize)) {
                                                        return false;
                                                    }
                                                }
                                                return true;
                                            };

                                            // Go through each sprite and see if the translation is okay for it (won't
                                            // collide w/ anything)
                                            for (let i = 0; i < potentialTranslations.length; ++i) {
                                                let isAcceptable = true;
                                                for (let j = 0; j < augmentedSpriteGroup.length; ++j) {
                                                    if (!isAcceptableTranslation(augmentedSpriteGroup[j].sprite, potentialTranslations[i])) {
                                                        isAcceptable = false;
                                                        break;
                                                    }
                                                }

                                                // Acceptable translation?
                                                if (isAcceptable) {

                                                    // Translate sprite to new position
                                                    const spritesToUpdate = [];
                                                    for (let j = 0; j < augmentedSpriteGroup.length; ++j) {
                                                        const sprite = augmentedSpriteGroup[j].sprite,
                                                            prevPos  = {
                                                                x: sprite.newDstX,
                                                                y: sprite.newDstY
                                                            };
                                                        sprite.newDstX = sprite.dragStartX + potentialTranslations[i].x * tilesize;
                                                        sprite.newDstY = sprite.dragStartY + potentialTranslations[i].y * tilesize;

                                                        spritesToUpdate.push({
                                                            sprite, prevPos
                                                        });
                                                    }

                                                    this.updateSpritePositions(spritesToUpdate);
                                                    this.redrawVirtualCanvas();
                                                    break;
                                                }
                                            }
                                        })
                                        .onEndDrag(() => {
                                            //console.log("END DRAGGING");
                                        });

                        spritesSprite.interactable = interactable;
                    });
                    spriteGroups.push(augmentedSpriteGroup);
                });
            }

            // Add entities
            if (resource.data.collisions) {
                resource.data.collisions.forEach((e) => { entities.collision.push( parseInt(e, 10) ); });
            }

            if (resource.data.floating) {
                resource.data.floating.forEach((e) => { entities.floating.push( parseInt(e, 10) ); });
            }

            if (resource.data.shootable) {
                resource.data.shootable.forEach((e) => { entities.shootable.push( parseInt(e, 10) ); });
            }

            if (resource.data.objects) {
                _.forEach(resource.data.objects, (o, e) => {
                    addObjectEntity(e, o);
                });
            }

            if (resource.data.extracts) {
                _.forEach(resource.data.extracts, (o, e) => {
                    addEntityExtraction(e, o);
                });
            }

            // Draw image to virtual canvas
            virtualCanvasCtx.clearRect(0, 0, virtualCanvasEl.width, virtualCanvasEl.height);
            virtualCanvasCtx.drawImage(resImg, 0, 0, resImg.width, resImg.height, 0, 0, virtualCanvasEl.width, virtualCanvasEl.height);

            virtualCanvasImg  = new Image();
            virtualCanvasImg.src = virtualCanvasEl.toDataURL("image/png");

            this.redraw();
        };

        if (resource.image) {
            resImg.src = `/resources/${resource.image}`;
        } else if (resource.output) {
            resImg.src = `/dist/resources/${resource.output}`;
        } else {
            throw Error("No source found for resource!");
        }

        $('#tilesheetName').text(resource.id);
        $('#tilesheetImage').text(resource.image);
    };

    this.updateSpritePositions = (sprites) => {


        // Translate any necessary collisions/etc. along w/ the sprite
        const updateGroups = [ 'collision', 'floating', 'shootable' ];
        updateGroups.forEach((updateGroupKey) => {

            const translatedGroup = [],
                updateGroup       = entities[updateGroupKey];

            updateGroup.forEach((item) => translatedGroup.push({
                oldItem: item,
                newItem: item
            }));

            sprites.forEach((spriteToUpdate) => {
                const { sprite, prevPos } = spriteToUpdate;

                sprite.interactable.move(sprite.newDstX, sprite.newDstY);

                // Were there any items under this sprite?
                const tilesize = parseInt(resource.tilesize, 10);
                for (let i = 0; i < translatedGroup.length; ++i) {
                    let item = translatedGroup[i].oldItem,
                        itemX = (item % parseInt(resource.columns, 10)) * tilesize,
                        itemY = Math.floor(item / parseInt(resource.columns, 10)) * tilesize;

                    if (prevPos.x === itemX && prevPos.y === itemY) {
                        const newItem = (sprite.newDstY / tilesize) * parseInt(resource.columns, 10) + sprite.newDstX / tilesize;
                        translatedGroup[i].newItem = newItem;
                        break;
                    }
                };
            });

            // Copy over modified items
            entities[updateGroupKey] = [];
            translatedGroup.forEach((item) => { entities[updateGroupKey].push(item.newItem); });
        });
    };

    this.redrawVirtualCanvas = () => {

        virtualCanvasCtx.clearRect(0, 0, virtualCanvasEl.width, virtualCanvasEl.height);
        sprites.forEach((sprite) => {
            const tilesize = parseInt(resource.tilesize, 10),
                srcX = sprite.dstX,
                srcY = sprite.dstY,
                dstX = sprite.newDstX,
                dstY = sprite.newDstY;
            virtualCanvasCtx.drawImage(resImg, srcX, srcY, tilesize, tilesize, dstX, dstY, tilesize, tilesize);
        });

        virtualCanvasImg  = new Image();
        virtualCanvasImg.src = virtualCanvasEl.toDataURL("image/png");
    };

    this.unload = () => {
        imgReady = false;
        resource = null;

        entities.collision = [];
        entities.floating  = [];
        entities.shootable = [];
        entities.objects   = {};
        entities.extracts  = {};

        InteractionMgr.unload();

        this.onSave = () => {};
    };

    this.redraw = () => {
        canvasCtx.clearRect(0, 0, canvasEl.width, canvasEl.height);
        canvasCtx.drawImage(virtualCanvasImg, 0, 0, virtualCanvasImg.width, virtualCanvasImg.height, 0, 0, canvasEl.width, canvasEl.height);

        // Draw highlighted sprites
        for (let i = 0; i < highlights.length; ++i) {
            const highlight = highlights[i];
            canvasCtx.save();
            canvasCtx.fillStyle = '#F00';
            canvasCtx.globalAlpha = 0.4;
            canvasCtx.fillRect(highlight.x, highlight.y, highlight.w, highlight.h);
            canvasCtx.restore();
        }

        // Draw highlighted islands
        for (let i = 0; i < highlightedIslands.length; ++i) {

            const island = highlightedIslands[i],
                tilesize = 16;
            for (let j = 0; j < island.length; ++j) {
                const highlight = island[j].sprite;
                canvasCtx.save();
                canvasCtx.fillStyle = '#00F';
                canvasCtx.globalAlpha = 0.4;
                canvasCtx.fillRect(highlight.newDstX, highlight.newDstY, tilesize, tilesize);
                canvasCtx.restore();
            }
        }

        // Draw entities
        const drawGroups = [
            {
                list: entities.collision,
                color: '#F00'
            },
            {
                list: entities.floating,
                color: '#0F0'
            },
            {
                list: entities.shootable,
                color: '#00F'
            },
            {
                list: Object.keys(entities.objects),
                color: '#0FF'
            },
            {
                list: Object.keys(entities.extracts),
                color: '#008'
            }
        ]

        const tilesize = parseInt(resource.tilesize, 10);
        drawGroups.forEach((drawGroup) => {

            canvasCtx.save();
            canvasCtx.fillStyle = drawGroup.color;
            canvasCtx.globalAlpha = 0.4;
            for (let i = 0; i < drawGroup.list.length; ++i) {
                const ent = drawGroup.list[i],
                    x = (ent % parseInt(resource.columns, 10)) * tilesize,
                    y = Math.floor(ent / parseInt(resource.columns, 10)) * tilesize,
                    w = tilesize,
                    h = tilesize;

                canvasCtx.fillRect(x, y, w, h);
            }
            canvasCtx.restore();
        });


        // Draw Grid
        canvasCtx.save();
        for (let y = 0; y < resImg.height; y += tilesize) {
            for (let x = 0; x < resImg.width; x += tilesize) {

                const gridLineWidth = 2,
                    gridAlpha       = 0.4;
                canvasCtx.globalAlpha = gridAlpha;
                canvasCtx.strokeRect(x - (gridLineWidth/2), y - (gridLineWidth/2), tilesize + (gridLineWidth/2), tilesize + (gridLineWidth/2));
            }
        }
        canvasCtx.restore();
    };

    this.step = (time) => {
        if (imgReady) {
            this.redraw();

        }
    };

    this.initialize = () => {
        containerEl.addClass('activeModule');
    };

    this.uninitialize = () => {
        containerEl.removeClass('activeModule');
    };

    this.onSave = () => {};
    this.save = () => {

        // Copy over changes
        resource.data.collisions = entities.collision;
        resource.data.floating = entities.floating;
        resource.data.shootable = entities.shootable;

        resource.data.objects = {};
        _.forEach(entities.objects, (obj, o) => {
            resource.data.objects[o] = obj.id;
        });

        resource.data.extracts = {};
        _.forEach(entities.extracts, (ext, o) => {
            resource.data.extracts[o] = ext.groupId;
        });

        resource.data.extractGroups = {};
        _.forEach(extractGroups, (ext, groupId) => {
            resource.data.extractGroups[groupId] = {
                sheetId: ext.sheetId
            }
        });

        if (resource.generated) {

            const tilesize = parseInt(resource.tilesize, 10);

            // Copy over sprites, spriteGroups
            resource.sprites = [];
            sprites.forEach((sprite) => {
                resource.sprites.push({
                    source: sprite.source,
                    dstX: sprite.newDstX,
                    dstY: sprite.newDstY,
                    sprite: sprite.sprite
                });
            });

            resource.spriteGroups = [];
            spriteGroups.forEach((spriteGroup) => {

                const newSpriteGroup = {
                    spriteIsland: []
                };

                spriteGroup.forEach((sprite) => {

                    // FIXME: ...seriously?
                    const _sprite = sprite.sprite.spriteGroup.spriteIsland.find((s) => s.sprite === sprite.sprite.sprite)
                    newSpriteGroup.spriteIsland.push({
                        sprite: _sprite.sprite,
                        x: _sprite.x,
                        y: _sprite.y,
                        dstX: sprite.sprite.newDstX / tilesize, // NOTE: Need updated pos
                        dstY: sprite.sprite.newDstY / tilesize
                    });
                });

                resource.spriteGroups.push(newSpriteGroup);
                resource.dirty = true;
            });

            console.log(sprites);
            console.log(spriteGroups);
        }

        this.onSave();
    };

    this.flagPendingChanges = () => {

        $('#tilesheetControls').addClass('pendingChanges');

        pendingChanges = true;
    };

    // First time initialization
    $('#tilesheetBtnCollision').click(() => {
        console.log("Clicked collision");
        activeAction = ACTION_COLLISION;

        if (activeActionEl) activeActionEl.removeClass('active');
        activeActionEl = $('#tilesheetBtnCollision');
        activeActionEl.addClass('active');
    });

    $('#tilesheetBtnFloating').click(() => {
        console.log("Clicked floating");
        activeAction = ACTION_FLOATING;

        if (activeActionEl) activeActionEl.removeClass('active');
        activeActionEl = $('#tilesheetBtnFloating');
        activeActionEl.addClass('active');
    });

    $('#tilesheetBtnShootable').click(() => {
        console.log("Clicked shootable");
        activeAction = ACTION_SHOOTABLE;

        if (activeActionEl) activeActionEl.removeClass('active');
        activeActionEl = $('#tilesheetBtnShootable');
        activeActionEl.addClass('active');
    });

    $('#tilesheetBtnObject').click(() => {
        console.log("Clicked object");
        activeAction = ACTION_OBJECT;

        if (activeActionEl) activeActionEl.removeClass('active');
        activeActionEl = $('#tilesheetBtnObject');
        activeActionEl.addClass('active');
    });

    $('#tilesheetBtnExtract').click(() => {
        console.log("Clicked extract");
        activeAction = ACTION_EXTRACT;

        if (activeActionEl) activeActionEl.removeClass('active');
        activeActionEl = $('#tilesheetBtnExtract');
        activeActionEl.addClass('active');
    });

    $('#tilesheetSave').click(() => {
        this.save();
        return false;
    });
});
