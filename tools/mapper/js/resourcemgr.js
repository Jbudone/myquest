const ResourceMgr = (new function(){

    this.resourceMgrListEl = null;

    const resFuncs = {
        default: {
            findResources: (data) => [],
            resType: (res) => null
        },

        sheets: {
            findResources: (data) => {
                const list = data.tilesheets.list;
                list.forEach((sheet) => {
                    if (!sheet.data.collisions) sheet.data.collisions = [];
                    if (!sheet.data.floating)   sheet.data.floating = [];
                });
                return list;
            },

            resType: (res) => 'tilesheet'
        },

        avatars: {
            findResources: (data) => {
                return data;
            },

            resType: (res) => 'avatars'
        },

        world: {
            findResources: (data) => {
                const areas = [];
                Object.keys(data.areas).forEach((areaName) => {
                    areas.push(data.areas[areaName]);
                });

                return areas;
            },

            resType: (res) => 'map'
        }
    };

    let sheetCanvasEl, sheetCanvasCtx;
    let sheetsInteractionMgr;

    const MapProperties = {
        name: null,
        file: null,
        dirtyWorld: false
    };

    this.initialize = () => {

        // Add resource viewer element
        this.resourceMgrListEl = $('#resourceMgrList');
        this.mapListEl = $('#mapList');
        this.spawnsEl = $('#spawnsList');

        sheetCanvasEl  = $('#sheetCanvas')[0];
        sheetCanvasCtx = sheetCanvasEl.getContext('2d');

        sheetsInteractionMgr = new InteractionMgr();
        sheetsInteractionMgr.load(sheetCanvasEl);

        $('#mapperSave').click(() => {
            ConsoleMgr.log("Saving map");
            this.onSave().then(() => {
                ConsoleMgr.log("Successfully saved");
                $('#workingWindow').removeClass('pendingChanges');
            });
        });
        $('#mapperNew').click(() => {
            this.onNew().then(() => {
                $('#workingWindow').removeClass('pendingChanges');
            });
        });

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
        sheetsInteractionMgr.reset();
    };
    
    this.activateSheet = (sheet) => {

        if (!sheet.mapper.img) {
            console.error(`Cannot activate sheet, image ${sheet.mapper.imagePath} not ready yet`);
            return;
        }

        // Set canvas width/height. Don't do this during initialize since it may not be visible (container is hidden
        // because tab isn't active), so its width hasn't been set yet
        sheetCanvasEl.width = $(sheetCanvasEl).width();
        sheetCanvasEl.height = $(sheetCanvasEl).height();

        this.activeSheet = sheet;


        const img = sheet.mapper.img;

        let height = img.height,
            width = img.width,
            scaleX = 1.0,
            scaleY = 1.0;
        if (width > sheetCanvasEl.width) {
            width = sheetCanvasEl.width;
            height *= (sheetCanvasEl.width / img.width);
            scaleX = (sheetCanvasEl.width / img.width);
            scaleY = (sheetCanvasEl.height / img.height);
        }

        sheetCanvasEl.height = height;


        sheet.mapper.previewWidth = width;
        sheet.mapper.previewHeight = height;
        sheet.mapper.scaleX = scaleX;
        sheet.mapper.scaleY = scaleY;

        const tilesize = parseInt(sheet.data.tilesize, 10),
            rows = parseInt(sheet.data.rows, 10),
            columns = parseInt(sheet.data.columns, 10);

        sheetsInteractionMgr.setCanvasScale(1.0 / scaleX, 1.0 / scaleY);
        sheetsInteractionMgr.setBounds((columns - 1) * tilesize, (rows - 1) * tilesize);

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

                    sheetsInteractionMgr.addEntity(entity.x, entity.y, entity.w, entity.h)
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
                if (sheetsInteractionMgr.hasEntity(entity.x, entity.y)) continue;

                sheetsInteractionMgr.addEntity(entity.x, entity.y, entity.w, entity.h)
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

    this.selectAvatar = (avatar) => {
        MapEditor.setAvatar(avatar);
    };

    let highlights = [],
        highlightedIslands = [],
        borderedIsland = null;

    this.sheetCanvasEl = null;

    this.buildElements = () => {

        this.allResources = {};
        _.forEach(this.data, (resource, resourceKey) => {
            let childResources = resource.funcs.findResources(resource.data);

            /*
            if (!(childResources instanceof Array)) {
                // Object
                const arrChildResources = [];
                Object.keys(childResources).forEach((resId) => {
                    const res = childResources[resId];
                    arrChildResources.push(res);
                });

                childResources = arrChildResources;
            }
            */

           if (childResources instanceof Array) {
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
           } else {
               const resType = resource.funcs.resType();
               this.allResources[resType] = childResources;
           }
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

            resDetails.mapper = {
                imgPath
            };

            loadImage(imgPath).then((img) => {
                resDetails.mapper.img = img;
                MapEditor.addTileset(resDetails);
            });
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


        // Add avatars
        const avatarsRes = this.allResources['avatars'];
        loadImage(`../../resources${avatarsRes.image.file}`).then((img) => {

            const canvas = document.createElement('canvas'),
                ctx = canvas.getContext('2d'),
                width = img.width,
                height = img.height,
                size = avatarsRes.image.size;

            ctx.drawImage(img, 0, 0, width, height);

            const scrapCanvas = document.createElement('canvas'),
                scrapCtx = scrapCanvas.getContext('2d');

            scrapCanvas.width = size;
            scrapCanvas.height = size;
            scrapCtx.width = size;
            scrapCtx.height = size;

            avatarsRes.avatars.forEach((avatar, i) => {

                const row = Math.floor(i / avatarsRes.image.columns),
                    col   = i % avatarsRes.image.columns;

                const imgData = ctx.getImageData(col * size, row * size, size, size);
                scrapCtx.putImageData(imgData, 0, 0);

                const avatarImg = new Image();
                avatarImg.src = scrapCanvas.toDataURL('image/png');

                this.spawnsEl.append(
                    $('<div/>').addClass('spawnProfile')
                                .append(
                                    $('<a/>').addClass('spawnAvatar')
                                            .attr('href', '#')
                                            .append(avatarImg)
                                            .click(() => {

                                                this.selectAvatar({
                                                    id: avatar,
                                                    img: avatarImg,
                                                    tilesize: size
                                                });
                                                return false;
                                            })
                                )
                );

                // Push all avatars at the beginning for when we load a map
                MapEditor.addAvatar({ id: avatar, img: avatarImg });
            });
        });

        console.log(this.allResources);
    };



    this.clearCanvas = () => {
        sheetCanvasCtx.clearRect(0, 0, sheetCanvasEl.width, sheetCanvasEl.height);
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

            sheetCanvasCtx.drawImage(img, 0, 0, width, height);

            // Draw highlighted sprites
            for (let i = 0; i < highlights.length; ++i) {
                const highlight = highlights[i];
                sheetCanvasCtx.save();
                sheetCanvasCtx.fillStyle = '#F00';
                sheetCanvasCtx.globalAlpha = 0.2;
                sheetCanvasCtx.fillRect(highlight.x * scaleX, highlight.y * scaleY, highlight.w * scaleX, highlight.h * scaleY);
                sheetCanvasCtx.restore();
            }

            // Draw highlighted islands
            for (let i = 0; i < highlightedIslands.length; ++i) {

                const island = highlightedIslands[i].sprites,
                    tilesize = 16;
                for (let j = 0; j < island.length; ++j) {
                    const highlight = island[j];
                    sheetCanvasCtx.save();
                    sheetCanvasCtx.fillStyle = '#00F';
                    sheetCanvasCtx.globalAlpha = 0.4;
                    sheetCanvasCtx.fillRect(highlight.x * scaleX, highlight.y * scaleY, highlight.w * scaleX, highlight.h * scaleY);
                    sheetCanvasCtx.restore();
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

    const loadImage = (imgPath) => {
        return new Promise((succeeded, failed) => {
            let failedCacheBust = false;
            const loadedImage = () => {

                if (img.width === 0) {

                    // Something went wrong, possibly an issue w/ our cache busting
                    // We may just need to wait a little longer
                    if (!failedCacheBust) {
                        console.log(`Waiting a little longer for ${imgPath}`);

                        failedCacheBust = true;
                        setTimeout(loadedImage, 100);
                        return;
                    } else {
                        // Already failed cache bust, likely cannot load this image
                        console.error(`Failed to load ${imgPath}`);
                        failed();
                    }
                }

                succeeded(img);
            };

            let img = new Image();
            img.src = imgPath;
            img.onload = loadedImage;

        });
    };

}());
