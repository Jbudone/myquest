const ResourceMgr = (new function(){

    this.resourceMgrListEl = null;

    const resFuncs = {
        default: {
            findResources: (data) => [],
            resType: (res) => null
        },

        sheets: {
            findResources: (data) => {
                return data.tilesheets.list;
            },

            resType: (res) => 'tilesheet'
        },

        world: {
            findResources: (data) => {
                return data.areas;
            },

            resType: (res) => 'map'
        }
    };

    let sheetCanvasEl, canvasCtx;
    let interactionMgr;

    const MapProperties = {
        name: null,
        file: null,
        dirtyWorld: false
    };

    this.initialize = () => {

        // Add resource viewer element
        this.resourceMgrListEl = $('#resourceMgrList');
        this.mapListEl = $('#mapList');

        canvasEl  = $('#sheetCanvas')[0];
        canvasCtx = canvasEl.getContext('2d');

        interactionMgr = new InteractionMgr();
        interactionMgr.load(canvasEl);

        $('#mapperSave').click(this.onSave);
        $('#mapperNew').click(this.onNew);

        return this.reload();
    };

    this.reload = () => {

        // Load all resources
        return new Promise((success, fail) => {
            $.getJSON('/resources/data/resources.json', (data) => {

                const waitingOn = [];
                this.data = data;
                _.forEach(data, (resource, resourceKey) => {

                    // Load resource file
                    const file = resource.file;
                    waitingOn.push(new Promise((successRes, failRes) => {
                        $.getJSON(`/resources/data/${file}`, (resData) => {
                            resource.data = resData;
                            successRes();
                        });
                    }));

                    resource.funcs = _.defaults(resFuncs[resourceKey] || {}, resFuncs['default']);
                });

                Promise.all(waitingOn).then(success);
            });
        });
    };


    this.activeSheet = null;

    this.deactivateSheet = () => {
        this.activeSheet = null;
        interactionMgr.reset();
    };
    
    this.activateSheet = (sheet) => {

        if (!sheet.mapper.img) {
            console.error(`Cannot activate sheet, image ${sheet.mapper.imagePath} not ready yet`);
            return;
        }

        // Set canvas width/height. Don't do this during initialize since it may not be visible (container is hidden
        // because tab isn't active), so its width hasn't been set yet
        canvasEl.width = $(canvasEl).width();
        canvasEl.height = $(canvasEl).height();

        this.activeSheet = sheet;


        const img = sheet.mapper.img;

        let height = img.height,
            width = img.width,
            scaleX = 1.0,
            scaleY = 1.0;
        if (width > canvasEl.width) {
            width = canvasEl.width;
            height *= (canvasEl.width / img.width);
            scaleX = (canvasEl.width / img.width);
            scaleY = (canvasEl.height / img.height);
        }

        canvasEl.height = height;


        sheet.mapper.previewWidth = width;
        sheet.mapper.previewHeight = height;
        sheet.mapper.scaleX = scaleX;
        sheet.mapper.scaleY = scaleY;

        const tilesize = parseInt(sheet.data.tilesize, 10),
            rows = parseInt(sheet.data.rows, 10),
            columns = parseInt(sheet.data.columns, 10);

        interactionMgr.setCanvasScale(1.0 / scaleX, 1.0 / scaleY);
        interactionMgr.setBounds((columns - 1) * tilesize, (rows - 1) * tilesize);

        if (sheet.data.spriteGroups) {

            sheet.data.spriteGroups.forEach((spriteGroup) => {

                const spritesInGroup = [];
                let leftEdge = 99999999999, topEdge = 99999999999;
                if (spriteGroup.spriteIsland) {

                    const spritesInGroup = [];
                    spriteGroup.spriteIsland.forEach((sprite) => {

                        const xPos = sprite.dstX * tilesize,
                            yPos = sprite.dstY * tilesize;
                        const entity = { x: xPos, y: yPos, w: tilesize, h: tilesize };
                        spritesInGroup.push(entity);

                        leftEdge = Math.min(leftEdge, xPos);
                        topEdge = Math.min(topEdge, yPos);
                    });

                } else if (spriteGroup.imageSrc) {


                    const dstX = spriteGroup.dstX,
                        dstY = spriteGroup.dstY,
                        width = spriteGroup.width,
                        height = spriteGroup.height;
                    for (let yPos = dstY; yPos < (dstY + height); yPos += tilesize) {
                        for (let xPos = dstX; xPos < (dstX + width); xPos += tilesize) {
                            const entity = { x: xPos, y: yPos, w: tilesize, h: tilesize };
                            spritesInGroup.push(entity);

                            leftEdge = Math.min(leftEdge, xPos);
                            topEdge = Math.min(topEdge, yPos);
                        }
                    }
                }

                spritesInGroup.forEach((entity) => {

                    interactionMgr.addEntity(entity.x, entity.y, entity.w, entity.h)
                        .onHoverIn(() => {
                            highlightedIslands.push({
                                spriteGroup: spriteGroup,
                                sprites: spritesInGroup
                            });

                            this.dirtyCanvas = true;
                        })
                        .onHoverOut(() => {
                            for (let i = 0; i < highlightedIslands.length; ++i) {
                                if (highlightedIslands[i].spriteGroup === spriteGroup) {
                                    highlightedIslands.splice(i, 1);
                                    break;
                                }
                            }

                            this.dirtyCanvas = true;
                        })
                        .onClick(() => {
                            this.selectSprite({ sprites: spritesInGroup, left: leftEdge, top: topEdge });
                        });

                });
            });
        }

        for (let y = 0; y < rows; ++y) {
            for (let x = 0; x < columns; ++x) {

                const xPos = x * tilesize,
                    yPos = y * tilesize;
                const entity = { x: xPos, y: yPos, w: tilesize, h: tilesize };

                // Has this entity already been claimed by a spriteGroup?
                if (interactionMgr.hasEntity(entity.x, entity.y)) continue;

                interactionMgr.addEntity(entity.x, entity.y, entity.w, entity.h)
                    .onHoverIn(() => {
                        highlights.push(entity);
                        this.dirtyCanvas = true;
                    })
                    .onHoverOut(() => {
                        const idx = highlights.findIndex((e) => {
                            return e.id === entity.id;
                        });

                        highlights.splice(idx, 1);
                        this.dirtyCanvas = true;
                    })
                    .onClick(() => {
                        this.selectSprite({ sprites: [entity], left: xPos, top: yPos });
                    });
            }
        }
    };

    this.selectSprite = (entity) => {

        MapEditor.setSprite(this.activeSheet, entity);
    };

    let highlights = [],
        highlightedIslands = [],
        borderedIsland = null;

    this.sheetCanvasEl = null;

    this.buildElements = () => {

        this.allResources = {};
        _.forEach(this.data, (resource, resourceKey) => {
            let childResources = resource.funcs.findResources(resource.data);

            if (!(childResources instanceof Array)) {
                // Object
                const arrChildResources = [];
                Object.keys(childResources).forEach((resId) => {
                    const res = childResources[resId];
                    arrChildResources.push(res);
                });

                childResources = arrChildResources;
            }

            childResources.forEach((res) => {
                const resDetails = {
                    resType: resource.funcs.resType(res),
                    data: res,
                    resParent: resource,
                    resParentKey: resourceKey
                };

                let resList = this.allResources[resDetails.resType];
                if (!resList) {
                    resList = [];
                    this.allResources[resDetails.resType] = resList;
                }

                resList.push(resDetails);
            });
        });

        this.resourceMgrListEl.empty();
        this.allResources['tilesheet'].forEach((resDetails) => {
            const resEl = $('<a/>')
                            .attr('href', '#')
                            .addClass('resource')
                            .text(resDetails.data.image || resDetails.data.output || resDetails.data.id)
                            .click(() => {
                                const resType = resDetails.resType;

                                const curActiveSheet = this.activeSheet;
                                this.deactivateSheet();
                                if (curActiveSheet !== resDetails) {
                                    this.activateSheet(resDetails);
                                }

                                this.dirtyCanvas = true;
                                return false;
                            });
            this.resourceMgrListEl.append(resEl);

            let imgPath;
            if (resDetails.data.generated) {
                imgPath = `../../dist/resources/${resDetails.data.output}`;
            } else {
                imgPath = `../../resources/${resDetails.data.image}`;
            }


            let failedCacheBust = false;
            const loadedImage = () => {

                if (img.width === 0 && !failedCacheBust) {
                    // Something went wrong, possibly an issue w/ our cache busting
                    // We may just need to wait a little longer
                    console.log("Waiting a little longer for " + resDetails.mapper.imgPath);

                    failedCacheBust = true;
                    setTimeout(loadedImage, 100);
                    return;
                }

                resDetails.mapper.img = img;
                MapEditor.addTileset(resDetails);
            };

            let img = new Image();
            img.src = imgPath;
            img.onload = loadedImage;

            resDetails.mapper = {
                imgPath
            };
        });

        this.allResources['map'].forEach((resDetails) => {
            const resEl = $('<a/>')
                            .attr('href', '#')
                            .addClass('resource')
                            .text(resDetails.data.file)
                            .click(() => {
                                this.onLoad(resDetails.data);
                                return false;
                            });
            this.mapListEl.append(resEl);
        });
        console.log(this.allResources);
    };


    this.clearCanvas = () => {
        canvasCtx.clearRect(0, 0, canvasEl.width, canvasEl.height);
    };

    this.redraw = () => {
        this.clearCanvas();

        if (this.activeSheet) {

            const img = this.activeSheet.mapper.img;

            if (!img) {
                console.error(`${this.activeSheet.mapper.imgPath} not ready yet`);
                return;
            }


            let width = this.activeSheet.mapper.previewWidth;
            let height = this.activeSheet.mapper.previewHeight;
            let scaleX = this.activeSheet.mapper.scaleX;
            let scaleY = this.activeSheet.mapper.scaleY;

            canvasCtx.drawImage(img, 0, 0, width, height);

            // Draw highlighted sprites
            for (let i = 0; i < highlights.length; ++i) {
                const highlight = highlights[i];
                canvasCtx.save();
                canvasCtx.fillStyle = '#F00';
                canvasCtx.globalAlpha = 0.2;
                canvasCtx.fillRect(highlight.x * scaleX, highlight.y * scaleY, highlight.w * scaleX, highlight.h * scaleY);
                canvasCtx.restore();
            }

            // Draw highlighted islands
            for (let i = 0; i < highlightedIslands.length; ++i) {

                const island = highlightedIslands[i].sprites,
                    tilesize = 16;
                for (let j = 0; j < island.length; ++j) {
                    const highlight = island[j];
                    canvasCtx.save();
                    canvasCtx.fillStyle = '#00F';
                    canvasCtx.globalAlpha = 0.4;
                    canvasCtx.fillRect(highlight.x * scaleX, highlight.y * scaleY, highlight.w * scaleX, highlight.h * scaleY);
                    canvasCtx.restore();
                }
            }

        }
    };

    this.onSave = () => {

        if (!MapProperties.name || !MapProperties.file) {
            // This can happen if we haven't started a new map yet
            return false;
        }

        return new Promise((succeeded, failed) => {

            const mapData = MapEditor.exportMap(),
                worldData = this.data['world'],
                data = JSON.stringify(mapData),
                file = `../../resources/${MapProperties.file}`;

            $.post('fs.php', { request: "save", data, file }, function(data){
                const json  = JSON.parse(data),
                    success = !!json.success;

                console.log('saved map: '+(success?'true':'false'));
                console.log(json);

                if (success) {
                    console.log("Finished saving");

                    if (MapProperties.dirtyWorld) {

                        const worldJson = JSON.stringify(worldData.data),
                            worldFile = `../../resources/data/${worldData.file}`;

                        $.post('fs.php', { request: "saveWorld", data: worldJson, file: worldFile }, function(data){
                            const json  = JSON.parse(data),
                                success = !!json.success;

                            console.log('saved map: '+(success?'true':'false'));
                            console.log(json);

                            if (success) {
                                console.log("Finished saving");
                                MapProperties.dirtyWorld = false;
                                succeeded(json);
                            } else {
                                failed(json);
                            }
                        });
                    } else {
                        succeeded(json);
                    }
                } else {
                    failed(json);
                }
            });
        });
    };
    
    this.onNew = () => {
        return new Promise((succeeded, failed) => {

            // FIXME: Add entry to world.json; mark world as dirty
            this.allResources['map'].push({
                resType: 'map',
                data: {
                    id: MapProperties.name,
                    file: MapProperties.file
                },
                resParent: this.data['world'],
                resParentKey: 'world'
            });


            MapProperties.name = 'mapperMap';
            MapProperties.file = 'maps/mapperMap.json';

            MapProperties.dirtyWorld = true;
            this.data['world'].data.areas[MapProperties.name] = {
                file: 'maps/mapperMap'
            };

            MapEditor.reset();
        });
    };

    this.onLoad = (res) => {

        return new Promise((succeeded, failed) => {

            let worldAreas = this.data['world'].data.areas;
            let mapId;
            for (let areaId in worldAreas) {
                if (worldAreas[areaId].file === res.file) {
                    mapId = areaId;
                    break;
                }
            }

            MapProperties.dirtyWorld = false;
            MapProperties.name = mapId;
            MapProperties.file = `${res.file}.json`;

            const file = `../../resources/${res.file}.json`;

            $.post('fs.php', { request: 'load', file }, function(data){

                const json = JSON.parse(data),
                    success = !!json.success;

                console.log('loaded map: '+(success?'true':'false'));
                console.log(json);

                if (success) {

                    const mapData = JSON.parse(json.mapData);
                    MapEditor.reset();
                    MapEditor.load(mapData);

                    console.log("Finished loading");
                    succeeded(json);
                } else {
                    failed(json);
                }
            });
        });
    };

    this.step = (delta) => {
        
        if (this.dirtyCanvas) {
            this.redraw();
            this.dirtyCanvas = false;
        }
    };

}());
