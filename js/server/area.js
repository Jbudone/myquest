
// Server Area
define(
    [
        'page', 'movable'
    ],
    (
        Page, Movable
    ) => {

        const Area = {

            _init() {

                this.registerHook('addcharacterlessentity');
            },

            clients: {},
            zones: {},
            spawns: {},

            /* Area
             *
             *
             * AreaFile:
             *  Area: {
             *   [0]: {
             *      [0]: {
             *          tiles: [,,,,,,,50,,23,2,,38,83,,,,,,], // Sparse list of tiles
             *          base: 84,
             *      },
             *      [50]: {
             *          ...
             *      },
             *  },
             *  ...
             *}
             *******************************************************/
            loadArea() {

                // Initialize area
                const pageHeight   = Env.pageHeight, // TODO: global areas properties elsewhere
                    pageWidth      = Env.pageWidth,
                    areaHeight     = this.area.properties.height, // TODO: figure out height/width
                    areaWidth      = this.area.properties.width,
                    spawns         = this.area.data.spawns,
                    area           = this.area.data.pages,
                    zones          = this.area.data.zones,
                    interactables  = this.area.data.interactables,
                    areaPageHeight = this.area.properties.pageHeight,
                    areaPageWidth  = this.area.properties.pageWidth,
                    pages          = this.pages,
                    maxSheetGid    = this.area.properties.tilesets.reduce((maxGid, sheet) => Math.max(sheet.gid.last, maxGid), 0),
                    tileGidOffsets = new Array(maxSheetGid);


                this.sheets = [];
                this.area.properties.tilesets.forEach((tileset) => {
                    assert(tileset.image, `No image found for tileset. Did you forget to embed the tileset into the map?`);
                    const sheet = Resources.findSheetFromFile(tileset.image);
                    if (!_.isObject(sheet)) return;
                    sheet.exportedGid = {
                        first: tileset.gid.first,
                        last: tileset.gid.last
                    };
                    this.sheets.push(sheet);

                    const sheetOffset = sheet.gid.first - tileset.gid.first;
                    tileGidOffsets.fill(sheetOffset, tileset.gid.first, tileset.gid.last);
                });

                this.pagesPerRow = Math.ceil(areaWidth / pageWidth);
                this.areaWidth   = areaWidth;
                this.areaHeight  = areaHeight;

                if (Env.game.useJPS) {
                    this.jumpPoints       = new Int16Array(this.area.data.jumpPoints);
                    this.forcedNeighbours = this.area.data.forcedNeighbours;
                }

                // Build up the pages for each cell of the areafile
                for (let areaYCoord = 0; area[areaYCoord]; areaYCoord += areaPageHeight) {
                    const areaY = area[areaYCoord];
                    for (let areaXCoord = 0; areaY[areaXCoord]; areaXCoord += areaPageWidth) {


                        // Build up each page in this cell
                        //
                        //  Go through each row in the cell
                        //      Go through each page in the row
                        //          StartingPoint: y*width + x
                        //          Tiles: page[0:StartingPoint] . cell[0:EndOfPageOrCell] . page[]
                        //
                        //
                        //  GLOSSARY
                        //      eMAP, ePAGE: the area/page from the exported JSON file
                        //      area, page: the area/page in the game
                        //
                        //  areaCell: ePAGE
                        //  areaPageWH: ePAGE width/height
                        //  areaXYCoord: ePAGE x/y position
                        //
                        //  pageWH: page width/height
                        //  pgXY: page x/y index
                        //  pageXY: page x/y position
                        //
                        // NOTE: area starts at 0 since the cell.tiles is spliced each time, so those spliced tiles are
                        //      removed from the array
                        const areaCell = areaY[areaXCoord];

                        // Offset tiles to sheet gid (in resources, rather than the localized sheets in area)
                        areaCell.tiles = areaCell.tiles.map((tile) => tile + tileGidOffsets[tile]);
                        for (let y = 0; y < areaPageHeight; ++y) {
                            for (let pageX = Math.floor(areaXCoord / pageWidth); pageX * pageWidth < areaXCoord + areaPageWidth; ++pageX) {

                                const pageY      = Math.floor((areaYCoord + y) / pageHeight),
                                    cellY        = y, // y offset in current cell of areagrid
                                    cellX        = areaXCoord + pageX - Math.floor(areaXCoord / pageWidth),
                                    cellI        = cellY * areaPageWidth + cellX,
                                    pgY          = pageY * pageHeight, // Global position of page in entire area
                                    pgX          = pageX * pageWidth,
                                    pgBegin      = ((cellY + areaYCoord - pgY) % pageHeight) * pageWidth + Math.max(0, areaXCoord - pgX),
                                    count        = Math.min(pageWidth - (areaXCoord - pgX),
                                                            areaXCoord + areaPageWidth - pgX,
                                                            pageWidth),
                                    pageI    = pageY * this.pagesPerRow + pageX;

                                if (!pages[pageI]) {
                                    pages[pageI] = new Page(this);

                                    if (Env.game.useJPS) {
                                        pages[pageI].jumpPoints = this.area.data.pages[pgY][pgX].jumpPoints;
                                    }
                                }

                                const page = pages[pageI];

                                page.index = pageI;
                                page.y     = pgY;
                                page.x     = pgX;

                                // TODO: improve this by traversing through Y page blocks rather than each row of y
                                const tiles = []
                                    .concat
                                    (
                                        page.tiles.splice(0, pgBegin),
                                        areaCell.tiles.splice(0, count),
                                        page.tiles
                                    );

                                page.tiles = tiles;
                            }
                        }


                        // Add sprites from cell
                        _.forEach(areaCell.sprites, (sprite, spriteCoord) => {

                            const coord = parseInt(spriteCoord, 10),
                                eY      = Math.floor(coord / areaPageWidth),
                                eX      = coord - eY * areaPageWidth,
                                mY      = areaYCoord + eY,
                                mX      = areaXCoord + eX,
                                pageY   = Math.floor(mY / pageHeight),
                                pageX   = Math.floor(mX / pageWidth),
                                pageI   = pageY * this.pagesPerRow + pageX,
                                pY      = mY - pageY * pageHeight,
                                pX      = mX - pageX * pageWidth,
                                index   = pY * pageWidth + pX,
                                page    = pages[pageI];


                            if (pY < 0 || pX < 0) return; // Belongs in another page

                            page.sprites[index] = { sprite };

                            const sheet = this.sheets.find((s) =>
                                inRange(sprite, s.exportedGid.first, s.exportedGid.last)
                            );

                            if (sheet === undefined) {
                                throw Err(`Unexpected sprite (${sprite}) doesn't match any spritesheet gid range`);
                            }

                            // Convert the sprite from the exported gid to the resource's sheet's gid
                            areaCell.sprites[spriteCoord] += sheet.gid.first - sheet.exportedGid.first;

                            // set collision mask if necessary
                            if (sheet.data.collisions !== undefined && sheet.data.collisions.indexOf(sprite - 1) >= 0) {
                                page.collidables[pY] |= 1 << pX;
                                page.sprites[index].collidable = true;
                            }

                            // set floating details
                            if (sheet.data.floating !== undefined && sheet.data.floating.indexOf(sprite - 1) >= 0) {
                                page.sprites[index].floating = true;
                            }

                            // set shootable details
                            if (sheet.data.shootable !== undefined && sheet.data.shootable.indexOf(sprite - 1) >= 0) {
                                page.sprites[index].shootable = true;
                            }

                            // TODO: search if this sprite has any animations

                            if (!page.sprites[index].floating) {
                                page.sprites[index].static = true;
                            }
                        });

                        _.forEach(areaCell.items, (sprite, itemCoord) => {

                            const coord = parseInt(itemCoord, 10),
                                eY      = Math.floor(coord / areaPageWidth),
                                eX      = coord - eY * areaPageWidth,
                                mY      = areaYCoord + eY,
                                mX      = areaXCoord + eX,
                                pageY   = Math.floor(mY / pageHeight),
                                pageX   = Math.floor(mX / pageWidth),
                                pageI   = pageY * this.pagesPerRow + pageX,
                                pY      = mY - pageY * pageHeight,
                                pX      = mX - pageX * pageWidth,
                                index   = pY * pageWidth + pX,
                                page    = pages[pageI];


                            if (pY < 0 || pX < 0) return; // Belongs in another page

                            const item = {
                                sprite,
                                id: null,
                                coord: index,
                                page: pageI
                            };

                            // FIXME: Why was this using gid as opposed to exportedGid?
                            const sheet = this.sheets.find((s) =>
                                inRange(sprite, s.exportedGid.first, s.exportedGid.last)
                            );

                            if (sheet === null) {
                                throw Err(`Unexpected sprite (${sprite}) doesn't match any spritesheet gid range`);
                            }

                            item.id = sheet.data.objects[sprite - sheet.gid.first - 1];
                            page.items[index] = item;
                        });
                    }
                }

                // Setup Zones
                this.zones = zones;
                const pagesWithZones = {};
                this.zones.out.forEach((zone) => {
                    const pageY = parseInt(zone.y / Env.pageHeight, 10),
                        pageX   = parseInt(zone.x / Env.pageWidth, 10),
                        pageI   = this.pagesPerRow * pageY + pageX,
                        localY  = zone.y % Env.pageHeight,
                        localX  = zone.x % Env.pageWidth,
                        tile    = new Tile(localX, localY);

                    tile.page = pages[pageI];
                    tile.page.zones[localY * Env.pageWidth + localX] = zone;

                    if (!pagesWithZones[tile.page.index]) {
                        pagesWithZones[tile.page.index] = tile.page;
                    }
                });

                // Setup Spawns
                this.spawns = spawns;
                const pagesWithSpawns = {};
                _.forEach(this.spawns, (spawn, spawnCoord) => {
                    const ty   = parseInt(spawnCoord / areaWidth, 10),
                        tx     = spawnCoord % areaWidth,
                        pageY  = parseInt(ty / Env.pageHeight, 10),
                        pageX  = parseInt(tx / Env.pageWidth, 10),
                        pageI  = this.pagesPerRow * pageY + pageX,
                        localY = ty % (Env.pageHeight),
                        localX = tx % (Env.pageWidth),
                        tile   = new Tile(localX, localY);

                    tile.page = pages[pageI];

                    if (!tile.page) {
                        throw Err(`Could not find page for tile: (${tx}, ${ty}) == page(${pageX}, ${pageY}) == page index: ${pageI}`);
                    }

                    tile.page.spawns[localY * Env.pageWidth + localX] = spawn;
                    if (!pagesWithSpawns[tile.page.index]) {
                        pagesWithSpawns[tile.page.index] = tile.page;
                    }
                });

                // Add Interactables
                _.forEach(interactables, (interactable, interactableID) => {

                    this.interactables[interactableID] = {
                        positions: [],
                        script: interactable.type
                    };
                    const positions = this.interactables[interactableID].positions;

                    interactable.tiles.forEach((areaTile) => {
                        const localY = areaTile.y % Env.pageHeight,
                            localX   = areaTile.x % Env.pageWidth,
                            pageY    = parseInt(areaTile.y / Env.pageHeight, 10),
                            pageX    = parseInt(areaTile.x / Env.pageWidth, 10),
                            pageI    = this.pagesPerRow * pageY + pageX,
                            tile     = new Tile(localX, localY);

                        tile.page = pages[pageI];
                        positions.push(tile);

                        // Add to page
                        tile.page.interactables[localY * Env.pageWidth + localX] = interactableID;
                    });
                });


                // page octree
                const pagesY = Math.ceil(areaHeight / pageHeight),
                    pagesX   = Math.ceil(areaWidth / pageWidth);
                _.forEach(pages, (page, i) => {

                    const pageY = Math.floor(i / pagesX),
                        pageX   = i % pagesX,
                        top     = pagesY - 1,
                        right   = pagesX - 1;

                    // South
                    if (pageY < top) {
                        page.neighbours.south = pages[(pageY + 1) * pagesX + pageX];
                        page.neighbours.south.neighbours.north = page;
                    }

                    // North
                    if (pageY > 0) {
                        page.neighbours.north = pages[(pageY - 1) * pagesX + pageX];
                        page.neighbours.north.neighbours.south = page;
                    }

                    // West
                    if (pageX > 0) {
                        page.neighbours.west = pages[pageY * pagesX + (pageX - 1)];
                        page.neighbours.west.neighbours.east = page;
                    }

                    // East
                    if (pageX < right) {
                        page.neighbours.east = pages[pageY * pagesX + (pageX + 1)];
                        page.neighbours.east.neighbours.west = page;
                    }

                    // Southwest
                    if (pageY < top && pageX > 0) {
                        page.neighbours.southwest = pages[(pageY + 1) * pagesX + (pageX - 1)];
                        page.neighbours.southwest.neighbours.northeast = page;
                    }

                    // Southeast
                    if (pageY < top && pageX < right) {
                        page.neighbours.southeast = pages[(pageY + 1) * pagesX + (pageX + 1)];
                        page.neighbours.southeast.neighbours.northwest = page;
                    }

                    // Northeast
                    if (pageY > 0 && pageX < right) {
                        page.neighbours.northeast = pages[(pageY - 1) * pagesX + (pageX + 1)];
                        page.neighbours.northeast.neighbours.southwest = page;
                    }

                    // Northwest
                    if (pageY > 0 && pageX > 0) {
                        page.neighbours.northwest = pages[(pageY - 1) * pagesX + (pageX - 1)];
                        page.neighbours.northwest.neighbours.southeast = page;
                    }


                    page.initialize();

                    page.hook('addcharacterlessentity', this).before((entity) => {
                        this.doHook('addcharacterlessentity').pre(entity);
                    });
                });

                if (Env.game.usePathPlanner) {
                    this.pathfinding.setupGrid();
                }
            },

            initialSpawn() {
                _.forEach(this.pages, (page) => {
                    page.initialSpawn();
                });
            },

            zoneIn(entity, zone) {

                assert(entity instanceof Movable, "Entity not a movable type");

                const tileLocalZone = this.zones.in.find((localZone) =>
                    localZone.spot === zone.spawn
                );

                const tile = this.localFromGlobalCoordinates(tileLocalZone.x, tileLocalZone.y);

                if (entity.path && _.isFunction(entity.path.onFailed)) {
                    entity.path.onFailed();
                }

                entity.path = null;
                entity.position = {
                    global: {
                        x: (tile.x + tile.page.x) * Env.tileSize,
                        y: (tile.y + tile.page.y) * Env.tileSize
                    },
                    tile: {
                        x: tile.x + tile.page.x,
                        y: tile.y + tile.page.y
                    }
                };

                tile.page.addEntity(entity);
                if (!this.movables[entity.id]) {
                    this.watchEntity(entity);
                }
                entity.zoning = false;
                return tile.page;
            },

            step(time) {

                // process events queue
                this.handlePendingEvents();

                const eventsBuffer = {};

                // !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
                // TODO: Temporary perf fix for converting pages to an array
                if (!this.pagesList) {
                    this.pagesList = [];
                    for (let i in this.pages) {
                        this.pagesList.push(this.pages[i]);
                    }
                }
                // !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!

                let i = this.pagesList.length - 1;
                do {
                    const page = this.pagesList[i];

                    page.step(time);

                    const pageEvents = page.fetchEventsBuffer();

                    if (pageEvents) {
                        eventsBuffer[page.index] = pageEvents;
                    }
                } while (--i >= 0);

                this.handlePendingEvents(); // events from pages

                const dynamicHandler = this.handler('step');
                if (dynamicHandler) {
                    dynamicHandler.call(time - this.lastUpdated);
                }
                this.lastUpdated = time;

                return eventsBuffer;
            },

            hasTile() {
                return true;
            }
        };

        return Area;
    });
