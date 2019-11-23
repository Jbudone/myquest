const MapEditor = (new function(){

    this.mapWindowEl = null;
    let canvasEl, canvasCtx;
    let interactionMgr;

    const mapProperties = { tilesets: [], avatars: {} };

    const Settings = {
        minAvatarSizeShowName: 16,
        drawSpriteFlags: true,

        highlight: {
            add: {
                spriteGroup: 'saturate(180%) contrast(160%)',
                avatar: 'saturate(180%) contrast(160%)'
            },
            remove: {
                spriteGroup: 'saturate(0%) contrast(10%)',
                avatar: 'saturate(180%) contrast(160%)'
            },
            selected: {
                spriteGroup: 'saturate(180%) contrast(160%)',
                avatar: 'saturate(180%) contrast(160%)'
            }
        }
    };

    const TILE_SIZE = 16;
    const NORTH = 0, WEST = 1, EAST = 2, SOUTH = 3;

    const CURSOR_PLACE_SPRITE = 0,
        CURSOR_ERASE          = 1,
        CURSOR_PLACE_AVATAR   = 2,
        CURSOR_PLACE_OBJECT   = 3;

    const OBJ_INTERACTION = 0,
        OBJ_ZONE          = 1;

    const HIGHLIGHT_ADD    = 1,
        HIGHLIGHT_REMOVE   = 2,
        HIGHLIGHT_SELECTED = 3;

    const SELECTION_SPAWN     = 0,
        SELECTION_SPRITEGROUP = 1,
        SELECTION_AREA        = 2;

    const DefaultProperties = {
        columns: 100,
        rows: 100,
    };

    let cursor = { x: 0, y: 0, tool: null, selected: null };

    let mapLayers = {
        base: [],
        ground: [],
        floating: [],
        spawns: [],

        objects: []
    };

    // List of operations made, so that we can ctrl+z to undo and redo changes
    let mapOperations = (new function() {

        this.pendingOps = [];
        this.committedOps = [];
        this.committedCursor = 0;

        const Op = function() {

            this.removeSprite = [];
            this.addSprites = [];
            this.moveSprites = [];

            this.pend = () => {

                this.removeSprites.forEach((sprite) => {
                    sprite.group.highlighted = HIGHLIGHT_REMOVE;
                });

                this.moveSprites.forEach((moveSprite) => {
                    const sprite = moveSprite.sprite;
                    sprite.group.highlighted = HIGHLIGHT_SELECTED;

                    sprite.x = moveSprite.to.x;
                    sprite.y = moveSprite.to.y;
                });

                mapOperations.pendingOps.push(this);
            };

            this.unpend = () => {

                this.removeSprites.forEach((sprite) => {
                    delete sprite.group.highlighted;
                });

                this.moveSprites.forEach((moveSprite) => {
                    const sprite = moveSprite.sprite;
                    delete sprite.group.highlighted;

                    sprite.x = moveSprite.from.x;
                    sprite.y = moveSprite.from.y;
                });

                const idx = mapOperations.pendingOps.indexOf(this);
                if (idx >= 0) {
                    mapOperations.pendingOps.splice(idx, 1);
                }
            };

            this.perform = () => {

                this.removeSprites.forEach((sprite) => {
                    let spriteIdx = sprite.layer.indexOf(sprite);
                    sprite.layer.splice(spriteIdx, 1);
                });

                this.moveSprites.forEach((moveSprite) => {
                    const sprite = moveSprite.sprite;
                    sprite.x = moveSprite.to.x;
                    sprite.y = moveSprite.to.y;
                });
            };

            this.undo = () => {

                this.removeSprites.forEach((sprite) => {
                    sprite.layer.push(sprite);
                });

                this.moveSprites.forEach((moveSprite) => {
                    const sprite = moveSprite.sprite;
                    sprite.x = moveSprite.from.x;
                    sprite.y = moveSprite.from.y;
                });
            };

            this.redo = () => {
                this.perform();
            };

            this.commit = () => {

                this.unpend();
                this.perform();

                // Nuke anything that was previously undone
                if (mapOperations.committedCursor < mapOperations.committedOps.length) {
                    mapOperations.committedOps.splice(mapOperations.committedCursor, mapOperations.committedOps.length - mapOperations.committedCursor);
                }

                mapOperations.committedOps.push(this);
                mapOperations.committedCursor = mapOperations.committedOps.length;
            };
        };

        this.clearPending = () => {
            this.pendingOps.forEach((pendingOp) => {
                pendingOp.unpend();
            });

            this.pendingOps = [];
        };

        this.newOp = () => {
            return new Op();
        };

        this.undo = () => {

            if (this.committedCursor > 0 && this.committedOps.length > 0) {
                this.committedOps[this.committedCursor - 1].undo();
                --this.committedCursor;
            }
        };

        this.redo = () => {

            if (this.committedCursor < this.committedOps.length) {
                this.committedOps[this.committedCursor].redo();
                ++this.committedCursor;
            }
        };
    }());



    // Camera
    // This is the top/left point in the map visible to the camera
    const mapCamera = {
        x: 0,
        y: 0,
        w: 1200, // canvas size
        h: 800,
        translate: (mapPos) => {
            const cameraPos = { x: 0, y: 0 };
            cameraPos.x = Math.ceil((mapPos.x - mapCamera.x) * (canvasEl.width / mapCamera.w));
            cameraPos.y = Math.ceil((mapPos.y - mapCamera.y) * (canvasEl.height / mapCamera.h));
            return cameraPos;
        },
        scaleX: (x) => Math.ceil(x * (canvasEl.width / mapCamera.w)),
        scaleY: (y) => Math.ceil(y * (canvasEl.height / mapCamera.h)),
    };

    const flagPendingChanges = () => {
        $('#workingWindow').addClass('pendingChanges');
    };

    const clearFlagPendingChanges = () => {
        $('#workingWindow').removeClass('pendingChanges');
    };

    const deselect = () => {

        if (cursor.selected) {
            if (cursor.selected.type === SELECTION_SPAWN) {
                delete cursor.selected.spawns[0].highlighted;
            } else if (cursor.selected.type === SELECTION_SPRITEGROUP) {
                delete cursor.selected.group.highlighted;
            }

            cursor.selected = null;
        }
    };

    const addInteractable = ((xPos, yPos) => {

        const entity = { x: xPos, y: yPos, w: TILE_SIZE, h: TILE_SIZE };
        interactionMgr.addEntity(entity.x, entity.y, entity.w, entity.h)
            .onHoverIn(() => {

                cursor.x = entity.x;
                cursor.y = entity.y;

                // Move selections
                if
                (
                    !cursor.tool &&
                    cursor.selected &&
                    (cursor.selected.type === SELECTION_SPRITEGROUP || cursor.selected.type === SELECTION_SPAWN) &&
                    cursor.downEnt
                )
                {

                    if (cursor.selected.type === SELECTION_SPAWN) {
                        const avatar = cursor.selected.spawns[0];

                        // FIXME: Re-using the same logic for placing avatars; need to abstract somewhere
                        let canMove = true;

                        // Can we move the avatar here?
                        // Is there already a sprite here?
                        let collisionSprite = null;
                        [mapLayers.base, mapLayers.ground].forEach((spriteLayer) => {
                            if (collisionSprite) return;
                            collisionSprite = spriteLayer.find((eSprite) => {
                                if (eSprite.x !== entity.x || eSprite.y !== entity.y) {
                                    return false;
                                }

                                const eSpriteRow = eSprite.sheetY / eSprite.sheet.data.tilesize,
                                    eSpriteCol   = eSprite.sheetX / eSprite.sheet.data.tilesize,
                                    eSpriteIdx   = eSpriteRow * eSprite.sheet.data.columns + eSpriteCol;

                                // Is this a collision?
                                return(eSprite.sheet.data.data.collisions.indexOf(eSpriteIdx) >= 0);
                            });
                        });

                        if (collisionSprite) {
                            canMove = false;
                        }

                        // Is there another spawn here?
                        const existingSpawn = mapLayers.spawns.findIndex((eSpawn) => {
                            if (eSpawn.x === entity.x && eSpawn.y === entity.y) {
                                return true;
                            }
                        });

                        if (existingSpawn >= 0) {
                            canMove = false;
                        }


                        if (canMove) {
                            avatar.x = entity.x;
                            avatar.y = entity.y;

                            cursor.selected.autoDeselect = true; // We probably only wanted to move the sprite
                        }
                    } else if (cursor.selected.type === SELECTION_SPRITEGROUP) {

                        // FIXME: Re-using the same logic for placing spritegroup; need to abstract somewhere
                        const spriteGroup = cursor.selected.group,
                            selectedSprite = cursor.selected.sprite;
                        
                        const mapWidth = mapProperties.columns * TILE_SIZE,
                            mapHeight = mapProperties.rows * TILE_SIZE;

                        const pendingRemoveSprites = [];

                        const newSpriteGroupPos = [];
                        let canMove = true;
                        for (let i = 0; i < spriteGroup.length; ++i) {

                            const sprite = spriteGroup[i];

                            // Can we move the sprite over here?
                            const offX = sprite.x - selectedSprite.x,
                                offY = sprite.y - selectedSprite.y,
                                newX = entity.x + offX,
                                newY = entity.y + offY;

                            // Outside of map bounds? Skip
                            if
                            (
                                newX < 0 ||
                                newY < 0 ||
                                newX >= mapWidth ||
                                newY >= mapHeight
                            )
                            {
                                canMove = false;
                                break;
                            }

                            // Which layer for this particular sprite? Base if opaque, floating if float, otherwise ground
                            let spriteRow = (sprite.sheetX / sprite.sheet.data.tilesize),
                                spriteCol = (sprite.sheetY / sprite.sheet.data.tilesize),
                                spriteIdx = spriteRow * sprite.sheet.data.columns + spriteCol;


                            // Is there already a sprite here?
                            const existingSprite = sprite.layer.find((eSprite) => {
                                if
                                (
                                    eSprite.group !== spriteGroup &&
                                    eSprite.x === newX &&
                                    eSprite.y === newY
                                )
                                {
                                    // Is spriteGroup in pendingRemoveSprites?
                                    if (pendingRemoveSprites.indexOf(eSprite) >= 0) return false;

                                    return true;
                                }

                                return false;
                            });

                            if (existingSprite) {
                                existingSprite.group.forEach((eSprite) => {
                                    pendingRemoveSprites.push(eSprite);
                                });
                            }

                            newSpriteGroupPos[i] = { x: newX, y: newY };
                        }

                        // Move sprites if we can move
                        if (canMove) {

                            // NOTE: Need to clear pending first in order to fetch non-pended position of sprites
                            mapOperations.clearPending();
                            const pendingMoveSprites = new Array(spriteGroup.length);
                            for (let i = 0; i < spriteGroup.length; ++i) {

                                pendingMoveSprites[i] = {
                                    sprite: spriteGroup[i],
                                    from: { x: spriteGroup[i].x, y: spriteGroup[i].y },
                                    to: { x: newSpriteGroupPos[i].x, y: newSpriteGroupPos[i].y },
                                };
                            }

                            const pendingOp = mapOperations.newOp();
                            pendingOp.removeSprites = pendingRemoveSprites;
                            pendingOp.moveSprites = pendingMoveSprites;
                            pendingOp.pend();
                        }
                    }
                }
                else if
                (
                    !cursor.tool &&
                    cursor.selected &&
                    cursor.selected.type === SELECTION_AREA &&
                    cursor.downEnt
                )
                {
                    cursor.selected.to = entity;
                }



                this.dirtyCanvas = true;
            })
            .onHoverOut(() => {
                //this.dirtyCanvas = true;
            })
            .onMouseDown((evt) => {
                cursor.downEnt = entity;

                if (cursor.selected) {
                    // Deselect
                    deselect();
                    mapOperations.clearPending();
                    this.dirtyCanvas = true;
                }

                // Shfit+Left mouse for handling sprites
                const spriteModifier = evt.button === 0 && evt.shiftKey,
                    selectionModifier = evt.button === 0;

                if (spriteModifier && !cursor.tool) {
                    // Select entity

                    // Is there a spawn here?
                    const existingSpawn = mapLayers.spawns.find((eSpawn) => {
                        if (eSpawn.x === entity.x && eSpawn.y === entity.y) {
                            return true;
                        }
                    });

                    if (existingSpawn) {
                        cursor.selected = { type: SELECTION_SPAWN, spawns: [existingSpawn] };
                        existingSpawn.highlighted = HIGHLIGHT_SELECTED;
                        this.dirtyCanvas = true;
                    } else {

                        // Is there a spritegroup here?
                        let existingSprite = null;
                        [mapLayers.floating, mapLayers.ground, mapLayers.base].forEach((spriteLayer) => {
                            if (existingSprite) return;
                            existingSprite = spriteLayer.find((eSprite) => {
                                return (eSprite.x === entity.x && eSprite.y === entity.y);
                            });
                        });

                        if (existingSprite) {

                            cursor.selected = { type: SELECTION_SPRITEGROUP, group: existingSprite.group, sprite: existingSprite };
                            existingSprite.group.highlighted = HIGHLIGHT_SELECTED;
                            this.dirtyCanvas = true;
                        }
                    }

                    return;
                } else if (!spriteModifier && selectionModifier && !cursor.tool) {
                    // Area selection
                    cursor.selected = { type: SELECTION_AREA, from: cursor.downEnt, to: cursor.downEnt };
                    this.dirtyCanvas = true;
                }
            })
            .onMouseUp(() => {
                cursor.upEnt = entity;
                cursor.downEnt = null;
                this.dirtyCanvas = true;

                // Pending operation that's waiting on mouse up? Commit that now
                mapOperations.pendingOps.forEach((pendingOp) => {
                    pendingOp.commit();
                });
            })
            .onClick(() => {

                if (!cursor.tool) {

                    if (cursor.selected && cursor.selected.autoDeselect) {
                        deselect();
                    }

                    return;
                }


                if (cursor.tool.op === CURSOR_PLACE_SPRITE) {

                    const spriteGroup = [],
                        mapWidth = mapProperties.columns * TILE_SIZE,
                        mapHeight = mapProperties.rows * TILE_SIZE;
                    cursor.tool.sprite.sprites.forEach((sprite) => {

                        const offX = sprite.x - cursor.tool.sprite.left,
                            offY = sprite.y - cursor.tool.sprite.top,
                            spriteEnt = {
                                sheet: cursor.tool.sprite.sheet,
                                img: cursor.tool.sprite.img,
                                sheetX: sprite.x,
                                sheetY: sprite.y,
                                x: cursor.x + offX,
                                y: cursor.y + offY,
                                group: spriteGroup,
                                layer: null
                            };

                        // Outside of map bounds? Skip
                        if (spriteEnt.x >= mapWidth || spriteEnt.y >= mapHeight) {
                            return;
                        }

                        // Which layer for this particular sprite? Base if opaque, floating if float, otherwise ground
                        let spriteRow = (sprite.y / cursor.tool.sprite.sheet.data.tilesize),
                            spriteCol = (sprite.x / cursor.tool.sprite.sheet.data.tilesize),
                            spriteIdx = spriteRow * cursor.tool.sprite.sheet.data.columns + spriteCol,
                            spriteLayer = mapLayers.base;


                        const isFloating = cursor.tool.sprite.sheet.mapper.isTileFloating(spriteIdx),
                            isTransparent = cursor.tool.sprite.sheet.mapper.isTileTransparent(spriteIdx),
                            isCollision = cursor.tool.sprite.sheet.data.data.collisions.indexOf(spriteIdx) >= 0;

                        if (isFloating) { // Floating
                            spriteLayer = mapLayers.floating;
                        } else if (isCollision || isTransparent) { // Ground
                            spriteLayer = mapLayers.ground;
                        }

                        // Is there already a sprite here?
                        const existingSprite = spriteLayer.find((eSprite) => {
                            if (eSprite.x === spriteEnt.x && eSprite.y === spriteEnt.y) {
                                return true;
                            }
                        });

                        if (existingSprite) {
                            // Kill existing sprite group
                            existingSprite.group.forEach((eSprite) => {
                                let eSpriteIdx = spriteLayer.indexOf(eSprite);
                                spriteLayer.splice(eSpriteIdx, 1);
                            });
                        }

                        spriteEnt.layer = spriteLayer;
                        spriteGroup.push(spriteEnt);
                        spriteLayer.push(spriteEnt);
                    });
                } else if (cursor.tool.op === CURSOR_ERASE) {

                    const topToBottomLayers = [mapLayers.floating, mapLayers.ground, mapLayers.base];
                    for (let i = 0; i < topToBottomLayers.length; ++i) {

                        const spriteLayer = topToBottomLayers[i];

                        // Is there already a sprite here?
                        const existingSprite = spriteLayer.find((eSprite) => {
                            if (eSprite.x === cursor.x && eSprite.y === cursor.y) {
                                return true;
                            }
                        });

                        if (existingSprite) {
                            // Kill existing sprite group
                            existingSprite.group.forEach((eSprite) => {
                                let eSpriteIdx = spriteLayer.indexOf(eSprite);
                                spriteLayer.splice(eSpriteIdx, 1);
                            });

                            break;
                        }
                    }

                } else if (cursor.tool.op === CURSOR_PLACE_OBJECT) {

                    const objEnt = {
                        type: cursor.tool.type,
                        x: cursor.x,
                        y: cursor.y,
                        data: cursor.tool.data
                    };

                    if (cursor.tool.type === OBJ_INTERACTION) {

                        // Is there another interaction here?
                        const existingObj = mapLayers.objects.findIndex((eObj) => {
                            if (eObj.type === OBJ_INTERACTION && eObj.x === objEnt.x && eObj.y === objEnt.y) {
                                return true;
                            }
                        });

                        if (existingObj >= 0) {
                            mapLayers.objects.splice(existingObj, 1);
                        }

                        mapLayers.objects.push(objEnt);
                    } else if (cursor.tool.type === OBJ_ZONE) {

                        // Is there another zone here?
                        const existingObj = mapLayers.objects.findIndex((eObj) => {
                            if (eObj.type === OBJ_ZONE && eObj.x === objEnt.x && eObj.y === objEnt.y) {
                                return true;
                            }
                        });

                        if (existingObj >= 0) {
                            mapLayers.objects.splice(existingObj, 1);
                        }

                        mapLayers.objects.push(objEnt);
                    }

                } else if (cursor.tool.op === CURSOR_PLACE_AVATAR) {

                    const avatarEnt = {
                        id: cursor.tool.avatar.id,
                        img: cursor.tool.avatar.img,
                        x: cursor.x,
                        y: cursor.y,
                        tilesize: cursor.tool.avatar.tilesize // FIXME: This is redundant since all avatars will have the same tilesize
                    };


                    // Is there already a sprite here?
                    let collisionSprite = null;
                    [mapLayers.base, mapLayers.ground].forEach((spriteLayer) => {
                        if (collisionSprite) return;
                        collisionSprite = spriteLayer.find((eSprite) => {
                            if (eSprite.x !== avatarEnt.x || eSprite.y !== avatarEnt.y) {
                                return false;
                            }

                            const eSpriteRow = eSprite.sheetY / eSprite.sheet.data.tilesize,
                                eSpriteCol   = eSprite.sheetX / eSprite.sheet.data.tilesize,
                                eSpriteIdx   = eSpriteRow * eSprite.sheet.data.columns + eSpriteCol;

                            // Is this a collision?
                            return(eSprite.sheet.data.data.collisions.indexOf(eSpriteIdx) >= 0);
                        });
                    });

                    if (collisionSprite) {
                        return;
                    }

                    // Is there another spawn here?
                    const existingSpawn = mapLayers.spawns.findIndex((eSpawn) => {
                        if (eSpawn.x === avatarEnt.x && eSpawn.y === avatarEnt.y) {
                            return true;
                        }
                    });

                    if (existingSpawn >= 0) {
                        // Get rid of existing spawn first
                        mapLayers.spawns.splice(existingSpawn, 1);
                    }

                    mapLayers.spawns.push(avatarEnt);
                }

                flagPendingChanges();
                this.dirtyCanvas = true;
            });
    });

    this.setupInteractions = () => {
        interactionMgr.reset();


        interactionMgr.setCameraOffset(mapCamera.x, mapCamera.y);
        interactionMgr.setBounds((mapProperties.columns - 1) * TILE_SIZE, (mapProperties.rows - 1) * TILE_SIZE);
        interactionMgr.setCanvasScale(mapCamera.w / canvasEl.width, mapCamera.h / canvasEl.height);

        for (let y = 0; y < mapProperties.rows; ++y) {
            for (let x = 0; x < mapProperties.columns; ++x) {

                const xPos = x * TILE_SIZE,
                    yPos = y * TILE_SIZE;
                addInteractable(xPos, yPos);
            }
        }

        interactionMgr.onMouseMove = onMouseMove;
        interactionMgr.onMiddleMouseClick = onMiddleMouseClick;
        interactionMgr.onMiddleMouseDrag = onMiddleMouseDrag;
        interactionMgr.onRightMouseClick = onRightMouseClick;
        interactionMgr.onRightMouseDrag = onRightMouseDrag;
        interactionMgr.onMouseScroll = onMouseScroll;
    };

    this.initialize = () => {

        this.mapWindowEl = $('#mapperWindow');

        $('#mapperToolCursor').click(() => {
            cursor.tool = null;
            this.dirtyCanvas = true;
            return false;
        });


        $('#mapperToolErase').click(() => {
            cursor.tool = {
                op: CURSOR_ERASE
            };

            return false;
        });

        $('#mapperToolInteraction').click(() => {
            cursor.tool = {
                op: CURSOR_PLACE_OBJECT,
                type: OBJ_INTERACTION,
                data: {
                    name: 'interactable'
                }
            };

            return false;
        });

        $('#mapperToolZone').click(() => {
            cursor.tool = {
                op: CURSOR_PLACE_OBJECT,
                type: OBJ_ZONE,
                data: {
                    name: 'zone'
                }
            };

            return false;
        });

        $('#mapperToolUndo').click(() => {
            mapOperations.undo();
            this.dirtyCanvas = true;
            return false;
        });

        $('#mapperToolRedo').click(() => {
            mapOperations.redo();
            this.dirtyCanvas = true;
            return false;
        });

        canvasEl  = $('#mapEditorCanvas')[0];
        canvasCtx = canvasEl.getContext('2d');

        canvasEl.width = $(canvasEl).width();
        canvasEl.height = $(canvasEl).height();

        mapCamera.w = canvasEl.width;
        mapCamera.h = canvasEl.height;

        interactionMgr = new InteractionMgr();
        interactionMgr.load(canvasEl);

        this.reset();
        this.setupInteractions();
    };

    this.addTileset = (sheet) => {
        if (mapProperties.tilesets.indexOf(sheet) === -1) {
            mapProperties.tilesets.push(sheet);

            const sheetCanvas = document.createElement('canvas'),
                ctx = sheetCanvas.getContext('2d');

            sheetCanvas.width = sheet.mapper.img.width;
            sheetCanvas.height = sheet.mapper.img.height;
            ctx.drawImage(sheet.mapper.img, 0, 0, sheet.mapper.img.width, sheet.mapper.img.height);

            sheet.mapper.tileinfo = {};
            sheet.mapper.isTileTransparent = (idx) => {
                if (!sheet.mapper.tileinfo[idx]) {
                    sheet.mapper.tileinfo[idx] = {};
                }

                if (!sheet.mapper.tileinfo[idx].hasOwnProperty('transparent')) {

                    let isTransparent = false,
                        row = Math.floor(idx / sheet.data.columns),
                        col = idx % sheet.data.columns,
                        y   = row * sheet.data.tilesize,
                        x   = col * sheet.data.tilesize;

                    const tileData = ctx.getImageData(x, y, sheet.data.tilesize, sheet.data.tilesize);
                    for (let i = 3; i < tileData.data.length; i += 4) {
                        if (tileData.data[i] !== 255) {
                            isTransparent = true;
                            break;
                        }
                    }

                    sheet.mapper.tileinfo[idx].transparent = isTransparent;
                }

                return sheet.mapper.tileinfo[idx].transparent;
            };

            sheet.mapper.isTileFloating = (idx) => {
                if (!sheet.mapper.tileinfo[idx]) {
                    sheet.mapper.tileinfo[idx] = {};
                }

                if (!sheet.mapper.tileinfo[idx].hasOwnProperty('floating')) {
                    const isFloating = sheet.data.data.floating.indexOf(idx) >= 0;
                    sheet.mapper.tileinfo[idx].floating = isFloating;
                }

                return sheet.mapper.tileinfo[idx].floating;
            };
        }
    };

    this.adjustMapBounds = (direction, expansion) => {

        if (expansion > 0) {
            // Growing the map

            let growFromX = 0, growToX = mapProperties.columns,
                growFromY = 0, growToY = mapProperties.rows;

            // NOTE: If we expand the top/left edges of the map then all sprites need to be shifted forwards to make up for
            // the new bounds
            if (direction === NORTH) {
                growFromY = mapProperties.rows;
                mapProperties.rows += expansion;
                growToY = mapProperties.rows;

                for (const layer in mapLayers) {
                    const spriteLayer = mapLayers[layer];
                    spriteLayer.forEach((sprite) => {
                        sprite.y += (expansion * 16);
                    });
                }

            } else if (direction === SOUTH) {
                growFromY = mapProperties.rows;
                mapProperties.rows += expansion;
                growToY = mapProperties.rows;
            } else if (direction === WEST) {
                growFromX = mapProperties.columns;
                mapProperties.columns += expansion;
                growToX = mapProperties.columns;

                for (const layer in mapLayers) {
                    const spriteLayer = mapLayers[layer];
                    spriteLayer.forEach((sprite) => {
                        sprite.x += (expansion * 16);
                    });
                }

            } else if (direction === EAST) {
                growFromX = mapProperties.columns;
                mapProperties.columns += expansion;
                growToX = mapProperties.columns;
            }

            for (let y = growFromY; y < growToY; ++y) {
                for (let x = growFromX; x < growToX; ++x) {
                    const xPos = x * TILE_SIZE,
                        yPos   = y * TILE_SIZE;
                    addInteractable(xPos, yPos);
                }
            }
            
            interactionMgr.setBounds((mapProperties.columns - 1) * TILE_SIZE, (mapProperties.rows - 1) * TILE_SIZE);

        } else {
            ConsoleMgr.log('Shrinking the map not supported yet!', LOG_ERROR);
            console.error("Shrinking the map, not supported yet!");
            return;
        }

        flagPendingChanges();
        this.dirtyCanvas = true;
    };

    window['AdjustMapBounds'] = this.adjustMapBounds;

    this.setSprite = (sheet, entity) => {

        // Add sheet to tilesets
        if (mapProperties.tilesets.indexOf(sheet) === -1) {
            mapProperties.tilesets.push(sheet);
        }

        cursor.tool = {
            op: CURSOR_PLACE_SPRITE,
            sprite: {
                sheet,
                img: sheet.mapper.img,
                sprites: entity.sprites,
                left: entity.left,
                top: entity.top,
                tilesize: sheet.data.tilesize
            }
        };

        $(canvasEl).addClass('holdingSprite');

        this.dirtyCanvas = true;
    };

    this.setAvatar = (avatar) => {

        // Add sheet to avatar sheets
        if (!mapProperties.avatars[avatar.id]) {
            mapProperties.avatars[avatar.id] = avatar.img;
        }

        cursor.tool = {
            op: CURSOR_PLACE_AVATAR,
            avatar
        };
    };

    this.addAvatar = (avatar) => {
        mapProperties.avatars[avatar.id] = avatar.img;
    };

    let accumulatedStepDelta = 0;
    this.step = (delta) => {

        accumulatedStepDelta += delta;
        if (accumulatedStepDelta >= 100 && this.dirtyCanvas) {
            accumulatedStepDelta = 0;
            this.redraw();
            this.dirtyCanvas = false;
        }
    };

    this.clearCanvas = () => {

        canvasCtx.save();
        canvasCtx.fillStyle = '#000';
        canvasCtx.fillRect(0, 0, canvasEl.width, canvasEl.height);

        let left = mapCamera.scaleX(mapCamera.x),
            top  = mapCamera.scaleY(mapCamera.y),
            right = mapCamera.scaleX(mapCamera.w),
            bottom = mapCamera.scaleY(mapCamera.h);

        if (left < right && top < bottom) {

            const leftEdge = Math.max(0, -left),
                topEdge = Math.max(0, -top),
                rightEdge = Math.max(0, Math.min(right, mapCamera.scaleX(mapProperties.columns * TILE_SIZE)) - left),
                bottomEdge = Math.max(0, Math.min(bottom, mapCamera.scaleY(mapProperties.rows * TILE_SIZE)) - top),
                drawWidth = rightEdge - leftEdge,
                drawHeight = bottomEdge - topEdge;

            canvasCtx.fillStyle = '#222';
            canvasCtx.fillRect(leftEdge, topEdge, drawWidth, drawHeight);
        }
        canvasCtx.restore();
    };

    this.redraw = () => {
        this.clearCanvas();

        const cameraOffX = -mapCamera.x,
            cameraOffY = -mapCamera.y;

        const rightEdge = mapCamera.w,
            bottomEdge = mapCamera.h;

        const mapWidth = mapCamera.scaleX(mapProperties.columns * TILE_SIZE),
            mapHeight = mapCamera.scaleY(mapProperties.rows * TILE_SIZE);

        let sizeX = mapCamera.scaleX(TILE_SIZE),
            sizeY = mapCamera.scaleY(TILE_SIZE);

        const drawSprite = (sprite) => {
            const tilesize = sprite.sheet.data.tilesize;

            let pos = mapCamera.translate({ x: sprite.x, y: sprite.y });

            if (sprite.group.highlighted) {

                if (sprite.group.highlighted === HIGHLIGHT_SELECTED) {
                    canvasCtx.filter = Settings.highlight.selected.spriteGroup;
                } else if (sprite.group.highlighted === HIGHLIGHT_ADD) {
                    canvasCtx.filter = Settings.highlight.add.spriteGroup;
                } else if (sprite.group.highlighted === HIGHLIGHT_REMOVE) {
                    canvasCtx.filter = Settings.highlight.remove.spriteGroup;
                }

                canvasCtx.drawImage(sprite.img, sprite.sheetX, sprite.sheetY, tilesize, tilesize, pos.x, pos.y, sizeX, sizeY);
                canvasCtx.filter = 'none';
            } else {
                canvasCtx.drawImage(sprite.img, sprite.sheetX, sprite.sheetY, tilesize, tilesize, pos.x, pos.y, sizeX, sizeY);
            }

            if (Settings.drawSpriteFlags) {
                if (sprite.layer === mapLayers.ground) {
                    canvasCtx.fillStyle = '#FF000055';
                    canvasCtx.fillRect(pos.x, pos.y, sizeX, sizeY);
                } else if (sprite.layer === mapLayers.floating) {
                    canvasCtx.fillStyle = '#0000FF55';
                    canvasCtx.fillRect(pos.x, pos.y, sizeX, sizeY);
                }
            }
        };

        const drawAvatar = (avatar) => {
            const tilesize = avatar.tilesize;
            let pos = mapCamera.translate({ x: avatar.x, y: avatar.y });


            if (avatar.highlighted) {
                const movableHighlight = {
                    borderThickness: 1,
                    borderColor: 'yellow'
                };


                if (avatar.highlighted === HIGHLIGHT_SELECTED) {
                    movableHighlight.filter = Settings.highlight.selected.avatar;
                } else if (avatar.highlighted === HIGHLIGHT_ADD) {
                    movableHighlight.filter = Settings.highlight.add.avatar;
                } else if (avatar.highlighted === HIGHLIGHT_REMOVE) {
                    movableHighlight.filter = Settings.highlight.remove.avatar;
                }

                //const avatar = cursor.selected.spawns[0];
                if (!avatar.highlightedImg) {


						const scrapCanvas  = document.createElement('canvas'),
							scrapCtx       = scrapCanvas.getContext('2d');

						scrapCanvas.height = avatar.tilesize;
						scrapCanvas.width  = avatar.tilesize;


                        for (let dOffY = -1; dOffY <= 1; ++dOffY) {
                            for (let dOffX = -1; dOffX <= 1; ++dOffX) {
                                scrapCtx.drawImage(
                                    avatar.img,
                                    0, 0,
                                    avatar.tilesize, avatar.tilesize,
                                    dOffX * movableHighlight.borderThickness,
                                    dOffY * movableHighlight.borderThickness,
                                    avatar.tilesize, avatar.tilesize,
                                );
                            }
                        }

                        scrapCtx.globalCompositeOperation = "source-in";
                        scrapCtx.fillStyle = movableHighlight.borderColor;
                        scrapCtx.fillRect(0, 0, scrapCanvas.width, scrapCanvas.height);

						const scrapImg  = new Image();
						scrapImg.src = scrapCanvas.toDataURL("image/png");
                        avatar.highlightedImg = scrapImg;
                }

                const tilesize = avatar.tilesize;
                let pos = mapCamera.translate({ x: avatar.x, y: avatar.y });
                canvasCtx.drawImage(avatar.highlightedImg, 0, 0, tilesize, tilesize, pos.x, pos.y, sizeX, sizeY);

                canvasCtx.filter = movableHighlight.filter;

                canvasCtx.drawImage(avatar.img, 0, 0, tilesize, tilesize, pos.x, pos.y, sizeX, sizeY);
                canvasCtx.filter = 'none';
            } else {
                canvasCtx.drawImage(avatar.img, 0, 0, tilesize, tilesize, pos.x, pos.y, sizeX, sizeY);
            }


            // Draw name over head if we're zoomed in enough
            if (sizeX >= Settings.minAvatarSizeShowName) {
                canvasCtx.font = '12px serif';
                canvasCtx.fillStyle = '#000';
                const name = avatar.id,
                    nameWidth = canvasCtx.measureText(name).width, // TODO: Is this expensive? Could easily cache and dirty on zoom
                    xPos = pos.x - Math.floor(nameWidth / 2) + (TILE_SIZE / 2);
                canvasCtx.fillText(name, xPos, pos.y);
            }
        };

        const drawObject = (obj) => {

            canvasCtx.fillStyle = '#00000055';
            let pos = mapCamera.translate({ x: obj.x, y: obj.y });
            canvasCtx.fillRect(pos.x, pos.y, sizeX, sizeY);
        };

        [mapLayers.base, mapLayers.ground, mapLayers.floating].forEach((layer) => {
            layer.forEach((spriteData) => {
                drawSprite(spriteData);
            });
        });

        mapLayers.spawns.forEach((avatarData) => {
            drawAvatar(avatarData);
        });

        mapLayers.objects.forEach((objData) => {
            drawObject(objData);
        });

        const pos = mapCamera.translate({ x: cursor.x, y: cursor.y });
        if (cursor.tool) {
            
            if (cursor.tool.op === CURSOR_PLACE_SPRITE && cursor.tool.sprite) {

                const tilesize = cursor.tool.sprite.tilesize,
                    offCamera = {
                        x: mapCamera.scaleX(mapCamera.x),
                        y: mapCamera.scaleY(mapCamera.y)
                    };
                cursor.tool.sprite.sprites.forEach((sprite) => {
                    const xPos = sprite.x,
                        yPos = sprite.y,
                        offX = mapCamera.scaleX(xPos - cursor.tool.sprite.left),
                        offY = mapCamera.scaleY(yPos - cursor.tool.sprite.top);


                    if ((pos.x + offX + offCamera.x) >= mapWidth || (pos.y + offY + offCamera.y) >= mapHeight) {
                        return;
                    }

                    canvasCtx.drawImage(cursor.tool.sprite.img, xPos, yPos, tilesize, tilesize, pos.x + offX, pos.y + offY, sizeX, sizeY);

                    // Draw overlay over sprites to show what parts are base/ground/floating
                    let spriteRow = (sprite.y / cursor.tool.sprite.sheet.data.tilesize),
                        spriteCol = (sprite.x / cursor.tool.sprite.sheet.data.tilesize),
                        spriteIdx = spriteRow * cursor.tool.sprite.sheet.data.columns + spriteCol;

                    const isFloating = cursor.tool.sprite.sheet.mapper.isTileFloating(spriteIdx),
                        isTransparent = cursor.tool.sprite.sheet.mapper.isTileTransparent(spriteIdx);

                    if (!isTransparent) { // Base
                        canvasCtx.fillStyle = '#FF000055';
                    } else if (isFloating) { // Floating
                        canvasCtx.fillStyle = '#0000FF55';
                    } else { // Ground
                        canvasCtx.fillStyle = '#00FF0055';
                    }

                    canvasCtx.fillRect(pos.x + offX, pos.y + offY, sizeX, sizeY);
                });
            } else if (cursor.tool.op === CURSOR_PLACE_AVATAR && cursor.tool.avatar) {

                const tilesize = cursor.tool.avatar.tilesize;
                canvasCtx.drawImage(cursor.tool.avatar.img, 0, 0, tilesize, tilesize, pos.x, pos.y, sizeX, sizeY);
                canvasCtx.fillStyle = '#FF550055';
                canvasCtx.fillRect(pos.x, pos.y, sizeX, sizeY);
            } else if (cursor.tool.op === CURSOR_ERASE) {
                canvasCtx.fillStyle = '#5555AA55';
                canvasCtx.fillRect(pos.x, pos.y, sizeX, sizeY);
            } else if (cursor.tool.op === CURSOR_PLACE_OBJECT) {
                canvasCtx.fillStyle = '#55550055';
                canvasCtx.fillRect(pos.x, pos.y, sizeX, sizeY);
            }
        } else {
            canvasCtx.fillStyle = '#FF000055';
            canvasCtx.fillRect(pos.x, pos.y, sizeX, sizeY);
        }

        if (cursor.selected && cursor.selected.type === SELECTION_AREA) {

            const topLeft = { 
                x: Math.min(cursor.selected.from.x, cursor.selected.to.x),
                y: Math.min(cursor.selected.from.y, cursor.selected.to.y)
            }, botRight = {
                x: Math.max(cursor.selected.from.x, cursor.selected.to.x) + TILE_SIZE,
                y: Math.max(cursor.selected.from.y, cursor.selected.to.y) + TILE_SIZE
            };

            const pos = mapCamera.translate(topLeft),
                size  = {
                    x: mapCamera.scaleX(botRight.x - topLeft.x),
                    y: mapCamera.scaleY(botRight.y - topLeft.y)
                };


            canvasCtx.fillStyle = '#FF550055';
            canvasCtx.fillRect(pos.x, pos.y, size.x, size.y);
        }
    };

    const onMouseMove = (worldPt) => {
        // NOTE: Probably don't want to set cursor pos here since its real coords as opposed to tiles
        //cursor.x = worldPt.x;
        //cursor.y = worldPt.y;
        //this.dirtyCanvas = true;
    };

    const onMiddleMouseClick = (worldPt) => {
        lastMapDrag.x = 0;
        lastMapDrag.y = 0;
    };

    const onRightMouseClick = (worldPt) => {
        lastMapDrag.x = 0;
        lastMapDrag.y = 0;
    };

    let lastMapDrag = { x: 0, y: 0 };
    const onMiddleMouseDrag = (worldPt, draggedDist) => {
        mapCamera.x -= (draggedDist.x - lastMapDrag.x);
        mapCamera.y -= (draggedDist.y - lastMapDrag.y);

        lastMapDrag.x = draggedDist.x;
        lastMapDrag.y = draggedDist.y;

        interactionMgr.setCameraOffset(mapCamera.x, mapCamera.y);
        this.dirtyCanvas = true;
    };

    const onRightMouseDrag = (worldPt, draggedDist) => {
        // Laptop doesn't have a middle mouse button, so simulate middle mouse drag w/ shift + right mouse
        if (interactionMgr.hasModifier(SHIFT_KEY)) {
            onMiddleMouseDrag(worldPt, draggedDist);
        }
    };

    let lastScrollTime = Date.now();
    let scrollMult = 1.0;
    const onMouseScroll = (worldPt, scroll) => {
        console.log(`Scroll: ${scroll.y}`);

        // TODO: Fix up scroll multiplier when we get larger maps, this allow us to accelerate scrolling
        const maxScrollMult = 10.0,
            minScrollMult = 1.0;

        const now = Date.now();
        const timeDiff = 200 - Math.min(now - lastScrollTime, 200); // [0, 200]
        if (timeDiff > 0) {
            scrollMult += 0.1;
            scrollMult = Math.min(maxScrollMult, scrollMult);
        } else {
            scrollMult = minScrollMult;
        }

        let oldScale = { x: mapCamera.w / canvasEl.width, y: mapCamera.h / canvasEl.height };
        const aspectRatio = (canvasEl.height / canvasEl.width),
            scrollAmtX = 32 * scrollMult,
            scrollAmtY = scrollAmtX * aspectRatio,
            maxScroll = 1024 * 4,
            minScroll = 1024;
        console.log(`Scroll by: ${scrollAmtX} (mult: ${scrollMult})`);
        if (scroll.y > 0) {
            mapCamera.w = Math.max(mapCamera.w - scrollAmtX, minScroll);
            mapCamera.h = Math.max(mapCamera.h - scrollAmtY, minScroll * aspectRatio);
        } else if (scroll.y < 0) {
            mapCamera.w = Math.min(mapCamera.w + scrollAmtX, maxScroll);
            mapCamera.h = Math.min(mapCamera.h + scrollAmtY, maxScroll * aspectRatio);
        }

        // Re-center the camera on the cursor after zooming
        let newScale = { x: mapCamera.w / canvasEl.width, y: mapCamera.h / canvasEl.height };
        let newWorldPt = {
            x: (worldPt.x - mapCamera.x) * (newScale.x / oldScale.x) + mapCamera.x,
            y: (worldPt.y - mapCamera.y) * (newScale.y / oldScale.y) + mapCamera.y
        };

        mapCamera.x -= newWorldPt.x - worldPt.x;
        mapCamera.y -= newWorldPt.y - worldPt.y;

        interactionMgr.setCanvasScale(newScale.x, newScale.y);
        interactionMgr.setCameraOffset(mapCamera.x, mapCamera.y);

        lastScrollTime = Date.now();
        this.dirtyCanvas = true;
    };

    this.exportMap = () => {

        console.log(mapLayers);

        const mapJson = {};

        mapJson.height = mapProperties.rows;
        mapJson.width  = mapProperties.columns;

        const tilecount = mapJson.width * mapJson.height;

        const baseTiles = new Array(tilecount),
            groundTiles = new Array(tilecount),
            floatTiles  = new Array(tilecount),
            spawnLayer  = {};

        baseTiles.fill(0);
        groundTiles.fill(0);
        floatTiles.fill(0);

        mapJson.layers = [
            {
                data: baseTiles,
                name: 'base',
            },
            {
                data: groundTiles,
                name: 'sprites',
            },
            {
                data: floatTiles,
                name: 'floating', // FIXME
            },
            {
                objects: [],
                name: 'zoning',
            },
            {
                data: spawnLayer,
                name: 'spawns',
            },
            {
                objects: [],
                name: 'interactables',
            }
        ];

        mapJson.tilesets = [];
        /*
        mapJson.tilesets = [
            {
                "name":"tilesheet",
                "image":"..\/tilesheet.png",
                "firstgid":1,

                "tileheight":16,
                "tilewidth":16,
                "imageheight":1568,
                "imagewidth":320,

                "columns":20,
                "tilecount":1960,
            }, 
        ];
        */

        const tilesets = [];
        let tilesetGid = 1;

        const exportLayers = [
            { src: mapLayers.base, dst: baseTiles },
            { src: mapLayers.ground, dst: groundTiles },
            { src: mapLayers.floating, dst: floatTiles }
        ];

        exportLayers.forEach((layer) => {

            layer.src.forEach((sprite) => {
                const tileset = sprite.sheet;
                if (tilesets.indexOf(tileset) === -1) {
                    tilesets.push(tileset);

                    tileset.firstGid = tilesetGid;
                    tileset.tileCount = tileset.data.gid.last - tileset.data.gid.first + 1;
                    tilesetGid += tileset.tileCount;
                }

                const sheetY = sprite.sheetY / sprite.sheet.data.tilesize,
                    sheetX = sprite.sheetX / sprite.sheet.data.tilesize,
                    spriteLid = sheetY * tileset.data.columns + sheetX,
                    tileGid = tileset.firstGid + spriteLid;

                const mapGid = (sprite.y / TILE_SIZE) * mapProperties.columns + (sprite.x / TILE_SIZE);
                layer.dst[mapGid] = tileGid;
            });
        });

        mapLayers.spawns.forEach((spawn) => {

            const spawnRow = spawn.y / TILE_SIZE,
                spawnCol   = spawn.x / TILE_SIZE,
                spawnCoord = spawnRow * mapProperties.columns + spawnCol;
            spawnLayer[spawnCoord] = {
                id: spawn.id
            };
        });


        tilesets.forEach((tileset) => {
            mapJson.tilesets.push({
                name: tileset.data.id,
                image: tileset.data.output, // FIXME: Need relpath?

                firstgid: tileset.firstGid,
                tilecount: tileset.tileCount,

                tilewidth: 16,
                tileheight: 16,
                imagewidth: tileset.mapper.previewWidth,
                imageheight: tileset.mapper.previewHeight,

                columns: tileset.data.columns,
                rows: tileset.data.rows
            });
        });

        return mapJson;
    };

    this.reset = () => {
        mapProperties.columns = DefaultProperties.columns;
        mapProperties.rows = DefaultProperties.rows;
        mapProperties.tilesize = TILE_SIZE;

        //mapProperties.tilesets = [];

        mapCamera.x = 0;
        mapCamera.y = -12; // NOTE: Offset for consolemgr
        mapCamera.w = 1200;
        mapCamera.h = mapCamera.w * (canvasEl.height / canvasEl.width);

        cursor.tool = null;
        cursor.x = 0;
        cursor.y = 0;

        mapLayers.base = [];
        mapLayers.ground = [];
        mapLayers.floating = [];

        clearFlagPendingChanges();
        this.setupInteractions();
        this.dirtyCanvas = true;
    };

    this.load = (data) => {
        console.log(data);

        mapProperties.columns = data.width;
        mapProperties.rows = data.height;

        this.setupInteractions();
        
        // TODO: Confirm all tilesets in data.tilesets are in our tilesets list
        //data.tilesets.forEach((tileset) => {
        //    //{"name":"grasslands","image":"sprites/grasslands.png","firstgid":1,"tilecount":672,"tilewidth":16,"tileheight":16,"imagewidth":336,"imageheight":509,"columns":21,"rows":32}
        //    mapProperties.tilesets.push(tileset);
        //});

        const layers      = [],
            baseLayer     = data.layers.find((layer) => layer.name === 'base'),
            groundLayer   = data.layers.find((layer) => layer.name === 'sprites'),
            floatingLayer = data.layers.find((layer) => layer.name === 'floating'),
            spawnsLayer   = data.layers.find((layer) => layer.name === 'spawns');

        if (baseLayer)     layers.push({ src: baseLayer.data,     dst: mapLayers.base });
        if (groundLayer)   layers.push({ src: groundLayer.data,   dst: mapLayers.ground });
        if (floatingLayer) layers.push({ src: floatingLayer.data, dst: mapLayers.floating });


        let mapSpriteGroups = {};

        layers.forEach((layer) => {
            if (!layer.src) return;

            // FIXME: Catch spriteGroups from copy -- but what if we have multiple spriteGroups at the same position but
            // on different layers?
            for (let i = 0; i < layer.src.length; ++i) {
                if (layer.src[i] === 0) continue;

                const spriteGid = layer.src[i],
                    mapY = Math.floor(i / mapProperties.columns),
                    mapX = i % mapProperties.columns;

                const jsonTileset = data.tilesets.find((tileset) => {
                    return (spriteGid >= tileset.firstgid && spriteGid < (tileset.firstgid + tileset.tilecount));
                }),
                spritesPath = "sprites/",
                jsonSpriteRelPath = jsonTileset.image.substr(jsonTileset.image.indexOf(spritesPath) + spritesPath.length),
                sheet = mapProperties.tilesets.find((tileset) => {
                    const tilesetRelPath = tileset.data.output.substr(tileset.data.output.indexOf(spritesPath) + spritesPath.length);

                    return jsonSpriteRelPath === tilesetRelPath;
                });

                const spriteLid = spriteGid - jsonTileset.firstgid,
                    sheetX = spriteLid % jsonTileset.columns,
                    sheetY = Math.floor(spriteLid / jsonTileset.columns);

                // Find sprite group
                let spriteGroup;
                if (mapSpriteGroups[i]) {
                    spriteGroup = mapSpriteGroups[i];
                } else if (sheet.data.spriteGroups) {
                    spriteGroup = [];
                    let spriteIsland = sheet.data.spriteGroups.find((spriteGroup) => {
                        return (spriteGroup.dstX === (sheetX * 16) && spriteGroup.dstY === (sheetY * 16));
                    });

                    if (spriteIsland) {

                        for (let sgY = 0; sgY < Math.ceil(spriteIsland.height / 16); ++sgY) {
                            for (let sgX = 0; sgX < Math.ceil(spriteIsland.width / 16); ++sgX) {
                                let sgMapY = mapY + sgY,
                                    sgMapX = mapX + sgX,
                                    sgMapI = sgMapY * mapProperties.columns + sgMapX;

                                mapSpriteGroups[sgMapI] = spriteGroup;
                            }
                        }
                    }
                } else {
                    spriteGroup = [];
                }

                const sprite = {
                    sheet: sheet,
                    img: sheet.mapper.img,
                    sheetX: sheetX * 16,
                    sheetY: sheetY * 16,
                    x: mapX * 16,
                    y: mapY * 16,
                    group: spriteGroup,
                    layer: layer.dst
                };

                spriteGroup.push(sprite);
                layer.dst.push(sprite);
            }
        });



        // Add spawns
        if (spawnsLayer) {

            if (spawnsLayer.data instanceof Array) {
                console.error("Spawns layer using wrong format: Array instead of Object");
            } else {

                _.forEach(spawnsLayer.data, (spawnData, spawnCoordI) => {

                    const spawnCoord = parseInt(spawnCoordI, 10),
                        mapY         = Math.floor(spawnCoord / mapProperties.columns),
                        mapX         = spawnCoord % mapProperties.columns;

                    mapLayers.spawns.push({

                        id: spawnData.id,
                        img: mapProperties.avatars[spawnData.id],
                        tilesize: 32, // FIXME: Yuck
                        y: mapY * TILE_SIZE,
                        x: mapX * TILE_SIZE
                    });
                });
            }
        }
    };
}());
