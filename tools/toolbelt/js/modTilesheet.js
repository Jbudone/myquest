
const ModTilesheet = (function(containerEl){

    let resImg       = null,
        canvasEl     = $('#tilesheetCanvas')[0],
        canvasCtx    = canvasEl.getContext('2d'),
        resource     = null;

    let imgReady = false,
        pendingChanges = false;

    let highlights = [];

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
            sheetId: null,
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

        InteractionMgr.load(canvasEl);

        // Draw image
        resImg = new Image();
        resImg.onload = () => {
            imgReady = true;

            canvasEl.width = resImg.width;
            canvasEl.height = resImg.height;

            $(canvasEl).width(resImg.width);
            $(canvasEl).height(resImg.height);

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

            // FIXME: Add extract groups (groups w/ sheet id)

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
        canvasCtx.drawImage(resImg, 0, 0, resImg.width, resImg.height, 0, 0, canvasEl.width, canvasEl.height);

        // Draw highlighted sprites
        for (let i = 0; i < highlights.length; ++i) {
            const highlight = highlights[i];
            canvasCtx.save();
            canvasCtx.fillStyle = '#F00';
            canvasCtx.globalAlpha = 0.4;
            canvasCtx.fillRect(highlight.x, highlight.y, highlight.w, highlight.h);
            canvasCtx.restore();
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
