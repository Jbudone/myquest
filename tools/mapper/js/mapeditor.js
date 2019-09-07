const MapEditor = (new function(){

    this.mapWindowEl = null;
    let canvasEl, canvasCtx;
    let interactionMgr;

    const mapProperties = { tilesets: [] };

    const TILE_SIZE = 16;
    const NORTH = 0, WEST = 1, EAST = 2, SOUTH = 3;

    const DefaultProperties = {
        columns: 100,
        rows: 100,
    };

    // Camera
    // This is the top/left point in the map visible to the camera
    const mapCamera = {
        x: 0,
        y: 0,
        w: 1200, // canvas size
        h: 800
    };

    const addInteractable = ((xPos, yPos) => {

        const entity = { x: xPos, y: yPos, w: TILE_SIZE, h: TILE_SIZE };
        interactionMgr.addEntity(entity.x, entity.y, entity.w, entity.h)
            .onHoverIn(() => {

                cursor.x = entity.x;
                cursor.y = entity.y;
                this.dirtyCanvas = true;
            })
            .onHoverOut(() => {
                //this.dirtyCanvas = true;
            })
            .onClick(() => {

                if (!cursorSprite) return;

                const spriteGroup = [],
                    mapWidth = mapProperties.columns * TILE_SIZE,
                    mapHeight = mapProperties.rows * TILE_SIZE;
                cursorSprite.sprites.forEach((sprite) => {

                    const offX = sprite.x - cursorSprite.left,
                        offY = sprite.y - cursorSprite.top,
                        spriteEnt = {
                            sheet: cursorSprite.sheet,
                            img: cursorSprite.img,
                            sheetX: sprite.x,
                            sheetY: sprite.y,
                            x: cursor.x + offX,
                            y: cursor.y + offY,
                            group: spriteGroup
                        };

                        // Outside of map bounds? Skip
                        if (spriteEnt.x >= mapWidth || spriteEnt.y >= mapHeight) {
                            return;
                        }

                        // Is there already a sprite here?
                        const existingSprite = sprites.find((eSprite) => {
                            if (eSprite.x === spriteEnt.x && eSprite.y === spriteEnt.y) {
                                return true;
                            }
                        });

                        if (existingSprite) {
                            // Kill existing sprite group
                            existingSprite.group.forEach((eSprite) => {
                                let eSpriteIdx = sprites.indexOf(eSprite);
                                sprites.splice(eSpriteIdx, 1);
                            });
                        }

                        spriteGroup.push(spriteEnt);
                        sprites.push(spriteEnt);
                });

                this.dirtyCanvas = true;
            });
    });

    this.setupInteractions = () => {
        interactionMgr.reset();

        interactionMgr.setBounds((mapProperties.columns - 1) * TILE_SIZE, (mapProperties.rows - 1) * TILE_SIZE);

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
    };

    this.initialize = () => {

        this.mapWindowEl = $('#mapperWindow');

        canvasEl  = $('#mapEditorCanvas')[0];
        canvasCtx = canvasEl.getContext('2d');

        canvasEl.width = $(canvasEl).width();
        canvasEl.height = $(canvasEl).height();

        interactionMgr = new InteractionMgr();
        interactionMgr.load(canvasEl);

        this.reset();
        this.setupInteractions();
    };

    let cursorSprite = null,
        cursor = { x: 0, y: 0 };

    let sprites = [];

    this.addTileset = (sheet) => {
        if (mapProperties.tilesets.indexOf(sheet) === -1) {
            mapProperties.tilesets.push(sheet);
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

                sprites.forEach((sprite) => {
                    sprite.y += (expansion * 16);
                });

            } else if (direction === SOUTH) {
                growFromY = mapProperties.rows;
                mapProperties.rows += expansion;
                growToY = mapProperties.rows;
            } else if (direction === WEST) {
                growFromX = mapProperties.columns;
                mapProperties.columns += expansion;
                growToX = mapProperties.columns;

                sprites.forEach((sprite) => {
                    sprite.x += (expansion * 16);
                });

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
            console.error("Shrinking the map, not supported yet!");
            return;
        }

        this.dirtyCanvas = true;
    };

    window['AdjustMapBounds'] = this.adjustMapBounds;

    this.setSprite = (sheet, entity) => {

        // Add sheet to tilesets
        if (mapProperties.tilesets.indexOf(sheet) === -1) {
            mapProperties.tilesets.push(sheet);
        }

        cursorSprite = {
            sheet,
            img: sheet.mapper.img,
            sprites: entity.sprites,
            left: entity.left,
            top: entity.top,
            tilesize: sheet.data.tilesize
        };

        $(canvasEl).addClass('holdingSprite');

        this.dirtyCanvas = true;
    };

    this.step = (delta) => {

        if (this.dirtyCanvas) {
            this.redraw();
            this.dirtyCanvas = false;
        }
    };

    this.clearCanvas = () => {

        canvasCtx.save();
        canvasCtx.fillStyle = '#000';
        canvasCtx.fillRect(0, 0, canvasEl.width, canvasEl.height);

        let left = mapCamera.x,
            top = mapCamera.y,
            right = mapCamera.x + mapCamera.w,
            bottom = mapCamera.y + mapCamera.h;

        if (left < right && top < bottom) {

            const leftEdge = Math.max(0, -left),
                topEdge = Math.max(0, -top),
                rightEdge = Math.max(0, Math.min(right, mapProperties.columns * TILE_SIZE) - left),
                bottomEdge = Math.max(0, Math.min(bottom, mapProperties.rows * TILE_SIZE) - top),
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

        const mapWidth = mapProperties.columns * TILE_SIZE,
            mapHeight = mapProperties.rows * TILE_SIZE;

        const drawSprite = (sprite) => {
            const tilesize = sprite.sheet.data.tilesize;
            canvasCtx.drawImage(sprite.img, sprite.sheetX, sprite.sheetY, tilesize, tilesize, sprite.x + cameraOffX, sprite.y + cameraOffY, TILE_SIZE, TILE_SIZE);
        };

        sprites.forEach((spriteData) => {
            drawSprite(spriteData);
        });

        if (cursorSprite) {

            const tilesize = cursorSprite.tilesize;
            cursorSprite.sprites.forEach((sprite) => {
                const xPos = sprite.x,
                    yPos = sprite.y,
                    offX = xPos - cursorSprite.left + cameraOffX,
                    offY = yPos - cursorSprite.top + cameraOffY;

                if ((offX + cursor.x) >= mapWidth || (offY + cursor.y) >= mapHeight) {
                    return;
                }

                canvasCtx.drawImage(cursorSprite.img, xPos, yPos, tilesize, tilesize, cursor.x + offX, cursor.y + offY, TILE_SIZE, TILE_SIZE);
            });
        }

        canvasCtx.fillStyle = '#F00';
        canvasCtx.fillRect(cursor.x + cameraOffX, cursor.y + cameraOffY, TILE_SIZE, TILE_SIZE);
        console.log(cursor);
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

    this.exportMap = () => {

        console.log(sprites);

        const mapJson = {};

        mapJson.height = mapProperties.rows;
        mapJson.width  = mapProperties.columns;

        const tilecount = mapJson.width * mapJson.height;

        const baseTiles = new Array(tilecount),
            spriteTiles = new Array(tilecount);

        baseTiles.fill(0);
        spriteTiles.fill(0);

        mapJson.layers = [
            {
                data: baseTiles,
                name: 'base',
            },
            {
                data: spriteTiles,
                name: 'sprites',
            },
            {
                objects: [],
                name: 'zoning',
            },
            {
                objects: [],
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

        sprites.forEach((sprite) => {
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
            if (baseTiles[mapGid]) {
                spriteTiles[mapGid] = tileGid;
            } else {
                baseTiles[mapGid] = tileGid;
            }
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
        mapCamera.y = 0;
        mapCamera.w = 1200;
        mapCamera.h = 800;

        cursorSprite = null;
        cursor.x = 0;
        cursor.y = 0;

        sprites = [];

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

        let baseTiles, spriteTiles;
        data.layers.forEach((layer) => {
            if (layer.name === 'base') {
                baseTiles = layer.data;
            } else if (layer.name === 'sprites') {
                spriteTiles = layer.data;
            }
        });

        let mapSpriteGroups = {};

        for (let i = 0; i < baseTiles.length; ++i) {
            if (baseTiles[i] === 0) continue;

            const spriteGid = baseTiles[i],
                mapY = Math.floor(i / mapProperties.columns),
                mapX = i % mapProperties.columns;

            const jsonTileset = data.tilesets.find((tileset) => {
                return (spriteGid >= tileset.firstgid && spriteGid < (tileset.firstgid + tileset.tilecount));
            }), sheet = mapProperties.tilesets.find((tileset) => {
                return (tileset.data.id === jsonTileset.name);
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
                group: spriteGroup
            };

            spriteGroup.push(sprite);
            sprites.push(sprite);
        }
    };
}());
