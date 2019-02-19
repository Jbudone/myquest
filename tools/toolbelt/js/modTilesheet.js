
const ModTilesheet = (function(containerEl){

    let resImg         = null,
        canvasEl       = $('#tilesheetCanvas')[0],
        canvasCtx      = canvasEl.getContext('2d'),
        resource       = null,
        loadedResource = null,
        sprites        = null,
        spriteGroups   = null,
        dependencies   = null;

    /*
        resource: {
            ...,
            dependencies: [
                {
                    // Image Based Dependency
                    imageSrc, previewSrc,
                    processing
                },
                {
                    // Extraction Based Dependency
                    assetId: "tiles",
                    sprites: [17, 18, ...]
                }
            ],

            // Sprite Groups:
            // Used for storing information about how we're using dependencies in the tilesheet
            // NOTE: We could have multiple spriteGroups per dependency (eg. multiple extractions, or the same image
            // processed to different appearances)
            spriteGroups: [
                {
                    // Image Based Sprite Group
                    imageSrc
                    dstX, dstY,          // real coordinates
                    width, height
                },
                {
                    // Extraction Sprite Group
                    assetId: "tiles",

                    // Island used to store a group of sprites that are connected together
                    spriteIsland: [
                        {
                            sprite: 17,
                            x, y,        // real coordinates
                            dstX, dstY
                        },
                        ...
                    ]
                }
            ],

            // Sprites:
            // Not stored in resource, this is an intermediate storage of sprites 
            sprites: [
                sprite: 17,  // -1 for image-based sprite
                x, y,        // relative coordinates
                dstX, dstY
            ]

        }
     */




    // Virtual Canvas
    // In some cases we may manipulate the canvas (move around groups of sprites in generated spritesheets); to do this
    // we need to draw changes to a virtual canvas, and use that for drawing to the actual canvas
    let virtualCanvasEl  = $('#tilesheetVirtualCanvas')[0],
        virtualCanvasCtx = virtualCanvasEl.getContext('2d'),
        virtualCanvasImg = null;

    let folderHierarchyEl = $('#tilesheetFolderHierarchy'),
        folderHierarchyImageCtrlEl = $('#tilesheetFolderHierarchyImageCtrl');

    let imgReady = false,
        pendingChanges = false;

    let highlights = [],
        highlightedIslands = [],
        borderedIsland = null;

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

    const Settings = {
        drawGrid: false
    };

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

    this.reloadProperties = () => {

        $('#tilesheetName').val(resource.id);
        $('#tilesheetDescription').val(resource.description || "");
        $('#tilesheetImage').text(resource.image);

        $('#tilesheetTilesize').val(parseInt(resource.tilesize, 10));
        $('#tilesheetTilesizeValue').val(resource.tilesize);

        $('#tilesheetColumns').val(parseInt(resource.columns, 10));
        $('#tilesheetColumnsValue').val(resource.columns);

        $('#tilesheetRows').val(parseInt(resource.rows, 10));
        $('#tilesheetRowsValue').val(resource.rows);

        if (resource.image) {
            $('#tilesheetControls').removeClass('generated');
        } else {
            $('#tilesheetControls').addClass('generated');
        }

        const generatedFromImagesChk = $('#tilesheetGenerateFromImages').prop('checked');

        if (resource.generated !== generatedFromImagesChk) {
            $('#tilesheetGenerateFromImages').prop('checked', resource.generated === true);
            //$('#tilesheetGenerateFromImages').trigger('change'); // NOTE: Do not trigger change, otherwise we can't
            //distinguish between a load and new tilesheet, where in the new case we would delete sprites and start
            //fresh

            // TODO: Surely there's some functionality we can share between onchange and here
            if (resource.generated) {
                $('#tilesheetFolderHierarchyContainer').removeClass('hidden');

            } else {
                $('#tilesheetFolderHierarchyContainer').addClass('hidden');
            }
        }

        if (resource.generated) {
            // Select files from folder hierarchy
            $('.folderHierarchyImage').each((idx, fileEl) => {
                const fileIsDep = (dependencies.find((dep) => dep.imageSrc === $(fileEl).data('file').pathTo)) !== undefined;
                $('.folderHierarchyIncludeImage', fileEl).prop('checked', fileIsDep);
            });
        }
    };

    const loadImageDependency = ((() => {

        const getImagePreviewDetails = (dependency) => {

            let imageNameIdx     = dependency.imageSrc.lastIndexOf('/'),
                imageName        = dependency.imageSrc.substr(imageNameIdx + 1),
                pathToImage      = dependency.imageSrc.substr(0, imageNameIdx + 1),
                imageBasenameIdx = imageName.lastIndexOf('.'),
                imageBasename    = imageName.substr(0, imageBasenameIdx);

            let previewPath, processHash, previewSrc;

            if (dependency.processing === "") {
                previewPath = pathToImage;
                processHash = null;
                previewSrc  = dependency.imageSrc;
            } else {
                processHash = dependency.processing.split('').reduce((accum, val)    => (((accum << 5) - accum) + val.charCodeAt(0)) | 0, 0);
                previewPath = `resources/sprites/temp`; // FIXME: Should store temp path in some settings
                previewSrc  = `${previewPath}/${imageBasename}--${processHash}.png`;
            }

            return { imageName, pathToImage, imageBasename, processHash, previewPath, previewSrc };
        };

        let processImageQueue = [];

        const processImage = (dep) => {
            return new Promise((succeeded, failed) => {
                const { previewPath, imageBasename, previewSrc} = getImagePreviewDetails(dep);

                $.post('fs.php', { request: "processImage", imageSrc: dep.imageSrc, process: dep.processing, outputPath: previewPath, basename: imageBasename, output: previewSrc }, (data) => {

                    console.log(data);
                    let json = JSON.parse(data);
                    //updateImagePreview(previewSrc);

                    // If we have any output its probably just from the error
                    if (!json.success) {
                        failed(json);
                        return;
                    }

                    dep.previewSrc = previewSrc;

                    const createBitmap = () => {
                        createImageBitmap(dep.previewImg).then((resp) => {
                            dep.previewImgBitmap = resp;
                            succeeded(json);
                        });
                    };

                    dep.previewImg = new Image();
                    dep.previewImg.onload = () => createBitmap();
                    dep.previewImg.onerror = () => failed(json);
                    dep.previewImg.src = `../../${previewSrc}`;
                });
            });
        };

        const dequeueProcessImage = () => {
            const q = processImageQueue[0];
            processImage(q.dep).then(q.s).catch(q.f).finally(() => {
                processImageQueue.shift();
                if (processImageQueue.length > 0) {
                    dequeueProcessImage();
                }
            });
        };

        const queueProcessImage = (dependency, succeeded, failed) => {

            const q = {
                dep: dependency,
                fn: processImage,
                s: succeeded,
                f: failed
            };

            processImageQueue.push(q);

            // Nothing else in the queue? Start this one immediately
            if (processImageQueue.length === 1) {
                dequeueProcessImage();
            }
        };


        // FIXME:
        //  - Load preview image from dep.previewImg rather than previewSrc (since we've already loaded it into memory)
        //  - Attempt to load preview src, on error then send process request

        return ((dep) => {
            return new Promise((succeeded, failed) => {

                if (!dep.processing) {
                    dep.previewSrc = dep.imageSrc;

                    const createBitmap = () => {
                        createImageBitmap(dep.previewImg).then((resp) => {
                            dep.previewImgBitmap = resp;
                            succeeded();
                        });
                    };


                    dep.previewImg = new Image();
                    dep.previewImg.onload = () => createBitmap();//succeeded();
                    dep.previewImg.onerror = () => failed();
                    dep.previewImg.src = `../../${dep.imageSrc}`;
                    return;
                }

                queueProcessImage(dep, succeeded, failed);
            });
        });
    })());

    this.loadFileInImageControls = ((() => {

        let dependency,
            imgSrcHEl = $('#tilesheetFolderHierarchyImageCtrlImgSrcH'),
            imgSrcWEl = $('#tilesheetFolderHierarchyImageCtrlImgSrcW'),
            imgDstHEl = $('#tilesheetFolderHierarchyImageCtrlImgDstH'),
            imgDstWEl = $('#tilesheetFolderHierarchyImageCtrlImgDstW'),
            imgSrcEl  = $('#tilesheetFolderHierarchyImageCtrlImgSrc'),
            imgPrevEl = $('#tilesheetFolderHierarchyImageCtrlImgPreview'),
            imgProcEl = $('#tilesheetFolderHierarchyImageCtrlImgProcess');

        imgDstHEl.on('input', () => {
            dependency.height = parseInt(imgDstHEl.val(), 10) || dependency.height;
            imgDstHEl.val(dependency.height);
        });

        imgDstWEl.on('input', () => {
            dependency.height = parseInt(imgDstHEl.val(), 10) || dependency.height;
            imgDstHEl.val(dependency.height);
        });

        let waitingToProcess = null,
            waitingOnServerProcess = null;
        imgProcEl.on('input', () => {

            // If we're already waiting to process from some previous input, then need to clear that timeout
            if (waitingToProcess) {
                clearTimeout(waitingToProcess);
            }

            // Give a moment before handing off this update to server for previewing; in case we're still typing or
            // something
            dependency.processing = imgProcEl.val();
            waitingToProcess = setTimeout(() => {

                loadImageDependency(dependency).then(() => {
                    updateImagePreview(dependency.previewSrc);
                    reloadDependencyInTilesheet(dependency);
                    imgProcEl.removeClass('error');
                }).catch((err) => {
                    ConsoleMgr.log(`Error converting image`, LOG_ERROR);
                    ConsoleMgr.log(err.results, LOG_ERROR);

                    imgProcEl.addClass('error');
                });

                /*
                const { previewPath, imageBasename, previewSrc} = getImagePreviewDetails(dependency);

                $.post('fs.php', { request: "processImage", imageSrc: dependency.imageSrc, process: dependency.processing, outputPath: previewPath, basename: imageBasename, output: previewSrc }, (data) => {

                    console.log(data);
                    //json = JSON.parse(data);
                    updateImagePreview(previewSrc);
                });

                // FIXME: When we uninclude an image we should fire a request to cancelProcessImage in case we were
                // still in the process of processing it; or otherwise check if we're waiting for waitingToProcess and
                // cancel that timer
                // If we've already sent off a process/preview to the server then we need to cancel that process first
                // before we spawn another one
                //if (waitingOnServerProcess) {
                //    $.post('fs.php', { request: "cancelProcessImage" }, (data) => {
                //        console.log(data);
                //    });
                //} else {

                //}
                */

                waitingOnServerProcess = true;
            }, 1000);
        });

        const updateImagePreview = (src) => {
            imgPrevEl.attr('src', `../../${src}?t=${new Date().getTime()}`);
        };

        return (file, _dependency) => {

            dependency = _dependency;

            imgSrcHEl.val('');
            imgSrcWEl.val('');
            imgDstHEl.val('');
            imgDstWEl.val('');
            imgProcEl.val(dependency.processing);

            imgSrcEl.attr('src', `../../${file.pathTo}`);
            imgSrcEl.one("load", function() {})
            .each(function() {
                if(this.complete) $(this).load();
            });


            // If the current preview doesn't exist, then trigger input to create a new one (as if we had just updated
            // the processing details)
            imgPrevEl.one('error', () => {
                imgProcEl.trigger('input');
            });

            loadImageDependency(dependency).then(() => {
                updateImagePreview(dependency.previewSrc);
                reloadDependencyInTilesheet(dependency);
                imgProcEl.removeClass('error');
            }).catch((err) => {
                // NOTE: Our previously saved process isn't working
                ConsoleMgr.log(`Error converting image`, LOG_ERROR);
                ConsoleMgr.log(err.results, LOG_ERROR);

                imgProcEl.addClass('error');
            });
            //const { previewSrc } = getImagePreviewDetails(dependency);
            //updateImagePreview(previewSrc);
        };
    })());

    this.reloadFolderHierarchy = () => {
        ResourceMgr.fetchRawImages().then((images) => {
            console.log(images);

            // Rebuild the folder hierarchy
            folderHierarchyEl.empty();

            let selectedImageEl = null;

            const buildElementForFile = (file, fileName, isFolder, level) => {

                const openFile = () => {

                    let isOpen = $(fileEl).hasClass('open');
                    if (isOpen) return;

                    // If we aren't including the image then we shouldn't allow the file to be expanded
                    if (!isFolder) {
                        let includeImage = $('.folderHierarchyIncludeImage', fileEl)[0].checked;
                        if (!includeImage) {
                            return false;
                        }

                        // Its possible we're still loading the image and adding it as a dependency
                        dependency = dependencies.find((d) => d.imageSrc === file.pathTo);
                        if (!dependency) {
                            return false;
                        }
                    }

                    fileEl.addClass('open');

                    if (!isFolder) {
                        // We're opening an image

                        // We already have another image open; close that first
                        if (selectedImageEl && selectedImageEl !== fileEl) {
                            selectedImageEl.removeClass('open');
                        }

                        selectedImageEl = fileEl;
                        folderHierarchyImageCtrlEl.detach().appendTo(fileEl).removeClass('hidden');

                        this.loadFileInImageControls(file, dependency);
                    } else if (selectedImageEl) {
                        selectedImageEl = null;
                    }
                };

                const closeFile = () => {
                    let isOpen = $(fileEl).hasClass('open');
                    if (!isOpen) return;

                    fileEl.removeClass('open');

                    if (selectedImageEl) {
                        selectedImageEl = null;
                    }
                };

                const triggerExpandFile = () => {

                    let isOpen = $(fileEl).hasClass('open');
                    isOpen = !isOpen;
                    if (isOpen) {
                        openFile();
                    } else {
                        closeFile();
                    }

                    return false;
                };

                const triggerIncludeImage = () => {

                    let includeImage = $('.folderHierarchyIncludeImage', fileEl)[0].checked;

                    if (!includeImage) {

                        let isOpen = $(fileEl).hasClass('open');
                        triggerExpandFile();

                        const indexOf = dependencies.findIndex((d) => d.imageSrc === file.pathTo);
                        if (indexOf >= 0) {
                            const dep = dependencies[indexOf];
                            dependencies.splice(indexOf, 1);
                            unloadDependencyInTilesheet(dep);
                        }
                    } else {

                        resImg = new Image();
                        resImg.onload = () => {
                            const dep = {
                                imageSrc: file.pathTo,
                                processing: ''
                            };

                            dependencies.push(dep);

                            loadImageDependency(dep).then(() => {
                                reloadDependencyInTilesheet(dep);
                            });
                        };
                        resImg.src = `../../${file.pathTo}`;
                    }
                };

                let fileEl = $('<div/>')
                    .addClass('folderHierarchyFile')
                    .addClass(`level${level}`);

                if (isFolder) {
                    fileEl.addClass('folderHierarchyFolder')
                    .data('controls', {
                        openFile: () => { openFile(); },
                        closeFile: () => { closeFile(); },
                    })
                    .append(
                        $('<a/>')
                            .attr('href', '#')
                            .addClass('folderHierarchyExpandFolder')
                            .text(">")
                            .click(triggerExpandFile)
                    )
                    .append(
                        $('<a/>')
                            .attr('href', '#')
                            .addClass('folderHierarchyFolderName')
                            .text(fileName)
                            .click(triggerExpandFile)
                    )
                    .append(
                        $('<div/>')
                            .addClass('folderList')
                    )
                    .append(
                        $('<div/>')
                            .addClass('fileList')
                    );

                } else {
                    fileEl.addClass('folderHierarchyImage')
                    .data('file', file)
                    .data('controls', {
                        openFile: () => { openFile(); },
                        closeFile: () => { closeFile(); },
                    })
                    .append(
                        $('<input/>')
                            .attr('type', 'checkbox')
                            .addClass('folderHierarchyIncludeImage')
                            .change(triggerIncludeImage)
                    )
                    .append(
                        $('<a/>')
                            .attr('href', '#')
                            .addClass('folderHierarchyImageName')
                            .text(fileName)
                            .click(triggerExpandFile)
                    );
                }

                return fileEl;
            };

            // parentFileContents is either a folder containing files, or a file containing the information regarding
            // the file
            const addFiles = (parentFolderEl, files, level) => {

                _.forEach(files, (file, fileName) => {
                    let fileEl = buildElementForFile(file, fileName, !file.image, level);
                    if (!file.image) {
                        fileEl.appendTo( $('> .folderList', parentFolderEl) );
                        addFiles(fileEl, file, level + 1);
                    } else {
                        fileEl.appendTo( $('> .fileList', parentFolderEl) );
                    }
                });
            };

            // Parent folder
            let folderEl = buildElementForFile(images['resources'], 'resources', true, 0);
            folderEl.appendTo(folderHierarchyEl);
            addFiles(folderEl, images['resources'], 1);
        });
    };

    const reloadDependencyInTilesheet = (dependency) => {
        //  Determine image dimensions, find best position for image  (prefer current position if possible; default currentPosition (0,0))
        //  If necessary: increase tilesheet size
        //  Redraw tilesheet from dependencies

        const tilesW = Math.ceil(dependency.previewImg.width / resource.tilesize),
              tilesH = Math.ceil(dependency.previewImg.height / resource.tilesize);
        let tilesheetW = Math.max(resource.columns, tilesW),
            tilesheetH = Math.max(resource.rows, tilesH);


        // Go through every tile (starting about currentPosition) to attempt to find a good position for this dep
        // -- Find dependency in dep list so that we don't accidentally collide w/ itself
        //      - We could add a uid to dependencies, and ref that in spriteGroups 
        //      - Instead of storing sprite in spriteIsland, store image?
        //          - resource.sprites[0].source image, .sprite -1
        //          - resource.spriteGroups[0].spriteIsland[0].sprite -1, .image src??
        //          - resource.spriteGroups[0].imageSrc ?
        let spriteGroup = spriteGroups.find((spriteGroup) => spriteGroup.imageSrc === dependency.imageSrc);
        if (!spriteGroup) {
            // FIXME: Add spriteGroup? Maybe not we could just check if spriteGroup null during collision checks
            // NOTE: This will hit if the dep has just been added (eg. added image dep)
        }
        // 1) Go through every translation in order starting about currentPos
        const potentialTranslations = [];

        // Find our current starting position for the sprite island
        let desiredPosition;
        if (spriteGroup) {
            desiredPosition = { x: spriteGroup.newDstX, y: spriteGroup.newDstY };
            sprites.forEach((sprite) => {
                if (sprite.spriteGroup !== spriteGroup) return;
                if (sprite.newDstY <= desiredPosition.y && sprite.newDstX <= desiredPosition.x) {
                    desiredPosition.x = sprite.newDstX;
                    desiredPosition.y = sprite.newDstY;
                }
            });

            desiredPosition.x /= resource.tilesize;
            desiredPosition.y /= resource.tilesize;
        } else {
            desiredPosition = { x: 0, y: 0 };
        }

        for (let y = desiredPosition.y; y < (tilesheetH + tilesH); ++y) {

            const yOff = y - desiredPosition.y;
            for (let x = desiredPosition.x; x <= (tilesheetW - tilesW); ++x) {
                const xOff = x - desiredPosition.x;

                potentialTranslations.push({ x: xOff, y: yOff });

                const xNeg = desiredPosition.x - xOff,
                    yNeg   = desiredPosition.y - yOff;

                if (xNeg > 0) potentialTranslations.push({ x: -xOff, y: yOff });
                if (yNeg > 0) potentialTranslations.push({ x: xOff,  y: -yOff });
                if (xNeg > 0 && yNeg > 0) potentialTranslations.push({ x: -xOff,  y: -yOff });
            }
        }


        // 2) Check acceptable translation
        const isAcceptableTranslation = (sprite, translation) => {
            const x = (sprite.dstX / resource.tilesize) + translation.x,
                y = (sprite.dstY / resource.tilesize) + translation.y;

            if (x < 0 || y < 0) {
                return false;
            }

            for (let i = 0; i < sprites.length; ++i) {
                const existingSprite = sprites[i];
                if (existingSprite.spriteGroup === spriteGroup) continue;

                if (existingSprite.newDstX === (x * resource.tilesize) && existingSprite.newDstY === (y * resource.tilesize)) {
                    return false;
                }
            }
            return true;
        };

        let augmentedSpriteGroup = {
                imageSrc: dependency.imageSrc,
                width: dependency.previewImg.width,
                height: dependency.previewImg.height
            }, newSprites = [];
        for (let y = 0; y < tilesH; ++y) {
            for (let x = 0; x < tilesW; ++x) {
                newSprites.push({
                    dstX: (desiredPosition.x + x) * resource.tilesize,
                    dstY: (desiredPosition.y + y) * resource.tilesize,
                    newDstX: (desiredPosition.x + x) * resource.tilesize,
                    newDstY: (desiredPosition.y + y) * resource.tilesize,
                    srcX: x * resource.tilesize,
                    srcY: y * resource.tilesize,
                    interactable: null,
                    source: dependency.imageSrc,
                    sprite: -1,
                    spriteGroup: augmentedSpriteGroup
                });
            }
        }


        // Go through each sprite and see if the translation is okay for it (won't collide w/ anything)
        let wasAcceptable = false;
        for (let i = 0; i < potentialTranslations.length; ++i) {
            let isAcceptable = true;
            for (let j = 0; j < newSprites.length; ++j) {
                if (!isAcceptableTranslation(newSprites[j], potentialTranslations[i])) {
                    isAcceptable = false;
                    break;
                }
            }

            // Acceptable translation?
            if (isAcceptable) {

                wasAcceptable = true;

                // Translate sprite to new position
                const spritesToUpdate = [];
                for (let j = 0; j < newSprites.length; ++j) {
                    const sprite = newSprites[j];
                        //prevPos  = {
                        //    x: sprite.newDstX,
                        //    y: sprite.newDstY
                        //};
                    sprite.newDstX = sprite.dstX + potentialTranslations[i].x * resource.tilesize;
                    sprite.newDstY = sprite.dstY + potentialTranslations[i].y * resource.tilesize;
                    sprite.dstX = sprite.newDstX;
                    sprite.dstY = sprite.newDstY;

                        //spritesToUpdate.push({
                        //    sprite, prevPos
                        //});
                }

                desiredPosition.x += potentialTranslations[i].x;
                desiredPosition.y += potentialTranslations[i].y;

                tilesheetW = Math.max(tilesheetW, desiredPosition.x + tilesW);
                tilesheetH = Math.max(tilesheetH, desiredPosition.y + tilesH);

                // FIXME: Is there a reasonable way to translate collisions/floating/etc. when we modify the dep? What if its been resized -- can we do a nearest neighbour or something?
                //this.updateSpritePositions(spritesToUpdate);

                //this.redrawVirtualCanvas();
                break;
            }
        }
        if(!wasAcceptable) {
            // TEmporary: this is probably a bug, later on go to step 4 to extend tilesheet
            debugger;
        }

        // 3) Abstract collision checks (also done elsewhere)
        // 4) None? Extend tilesheet width to max desired width, and no bounds for height, then go from top to bottom to test
        // 5) Add/modify dep in tilesheet
        let minX = newSprites[0].dstX,
            minY = newSprites[0].dstY;

        newSprites.forEach((sprite) => {
            minX = Math.min(sprite.dstX, minX);
            minY = Math.min(sprite.dstY, minY);
        });

        augmentedSpriteGroup.dstX = minX;
        augmentedSpriteGroup.dstY = minY;
        augmentedSpriteGroup.newDstX = minX;
        augmentedSpriteGroup.newDstY = minY;


        let existingDep = dependencies.find((dep) => dep.imageSrc === dependency.imageSrc);
        if (!existingDep) {
            dependencies.push({
                imageSrc: dependency.imageSrc
                // FIXME: More shit here
            });
            debugger; // Why did we hit here while reloading a dep??
        }

        // 6) Add sprites, delete old sprites (in case size has changed this is much easier); modify spriteGroup to reference new sprites
        if (spriteGroup) {
            // We previously had a sprite group, find each sprite and remove it from sprites
            sprites.forEach((sprite) => {
                if (sprite.spriteGroup === spriteGroup) {
                    sprite.interactable.remove();
                    sprite.interactable = null;
                }
            });

            sprites = sprites.filter((sprite) => sprite.spriteGroup !== spriteGroup);
            spriteGroups.splice(spriteGroups.indexOf(spriteGroup), 1);
        }

        spriteGroups.push(augmentedSpriteGroup);
        newSprites.forEach((sprite) => {
            sprites.push(sprite);
        });

        this.addInteractableSpriteGroup(augmentedSpriteGroup);
        

        // 7) Redraw/updateSpritePositions?
        resource.columns = tilesheetW;
        resource.rows = tilesheetH;

        // FIXME: Redraw resImg from scratch since one of our deps have changed so resImg is completely useless to us now
        //  1) Go through each dep, find top/left position
        const redrawDepsOnCanvas = () => {

            // FIXME: May need to resize virtual canvas if tilesheet size changes
            virtualCanvasCtx.clearRect(0, 0, virtualCanvasEl.width, virtualCanvasEl.height);

            dependencies.forEach((dep) => {

                const depGroup = spriteGroups.find((spriteGroup) => spriteGroup.imageSrc === dep.imageSrc);

                if (!depGroup) debugger; // FIXME: Could we still be in the process of loading dependencies? If so then change this to a return

                const position   = { x: depGroup.newDstX, y: depGroup.newDstY };

                // TODO: Error shows up when calling drawImage w/ previewImgBitmap and previewImg, but it still works
                // anyways. I can't tell what's wrong, but it works for now so low priority
                const dstX = position.x,
                    dstY   = position.y;
                virtualCanvasCtx.drawImage(dep.previewImgBitmap, 0, 0, dep.previewImg.naturalWidth, dep.previewImg.naturalHeight, dstX, dstY, dep.previewImg.naturalWidth, dep.previewImg.naturalHeight);
            });

            virtualCanvasImg  = new Image();
            virtualCanvasImg.src = virtualCanvasEl.toDataURL("image/png");

            imgReady = true;
        };

        const canvasWidth = tilesheetW * resource.tilesize,
            canvasHeight  = tilesheetH * resource.tilesize;

        canvasEl.width = canvasWidth;
        canvasEl.height = canvasHeight
        virtualCanvasEl.width = canvasWidth;
        virtualCanvasEl.height = canvasHeight;

        $(canvasEl).width(canvasWidth);
        $(canvasEl).height(canvasHeight);
        $(virtualCanvasEl).width(canvasWidth);
        $(virtualCanvasEl).height(canvasHeight);


        redrawDepsOnCanvas();
        //  2) Draw into virtual canvas
        //  3) 
        //  4) Better to place this routine outside of this function?? (So initial load only does this once we've finished entire load queue)
        //  5) Better abstract this shit w/ redrawVirtualCanvas -- in some cases our dep comes from other sheets, in some cases our dep comes from an image
        //this.redrawVirtualCanvas();


        // 8) Add sprite as interactable; remove old sprite interactables


        console.log(resource);
        console.log(sprites);
        console.log(spriteGroups);
        console.log(`Reloading dependency: Dimensions (${dependency.previewImg.width}, ${dependency.previewImg.height})`);

        // 1) What is the current tilesheet size? What is the size of this dep? Increase size if necessary
        // 2) Go through tilesheet to find best position (just treat dep as a solid block, and find x/y tiles size from tilesheet.tilesize); no positions available? Increase y
        // 3) Add/modify dep in tilesheet for redrawing purposes
    };

    const unloadDependencyInTilesheet = (dependency) => {
        
        let spriteGroup = spriteGroups.find((spriteGroup) => spriteGroup.imageSrc === dependency.imageSrc);

        if (spriteGroup) {
            // We previously had a sprite group, find each sprite and remove it from sprites
            sprites.forEach((sprite) => {
                if (sprite.spriteGroup === spriteGroup) {
                    sprite.interactable.remove();
                    sprite.interactable = null;
                }
            });

            sprites = sprites.filter((sprite) => sprite.spriteGroup !== spriteGroup);
            spriteGroups.splice(spriteGroups.indexOf(spriteGroup), 1);
        }

        const redrawDepsOnCanvas = () => {

            // FIXME: May need to resize virtual canvas if tilesheet size changes
            virtualCanvasCtx.clearRect(0, 0, virtualCanvasEl.width, virtualCanvasEl.height);

            dependencies.forEach((dep) => {

                const depGroup = spriteGroups.find((spriteGroup) => spriteGroup.imageSrc === dep.imageSrc);

                if (!depGroup) debugger; // FIXME: Need to fix this for extractions
                //    position   = { x: depGroup[0].sprite.newDstX, y: depGroup[0].sprite.newDstY };
                //depGroup.forEach((sprite) => {
                //    if (sprite.sprite.newDstY <= position.y && sprite.sprite.newDstX <= position.x) {
                //        position.x = sprite.sprite.newDstX;
                //        position.y = sprite.sprite.newDstY;
                //    }
                //});

                //const dstX = position.x,
                //    dstY   = position.y;
                //virtualCanvasCtx.drawImage(dep.previewImgBitmap, 0, 0, dep.previewImg.naturalWidth, dep.previewImg.naturalHeight, dstX, dstY, dep.previewImg.naturalWidth, dep.previewImg.naturalHeight);


                virtualCanvasCtx.drawImage(dep.previewImgBitmap, 0, 0, dep.previewImg.naturalWidth, dep.previewImg.naturalHeight, depGroup.dstX, depGroup.dstY, dep.previewImg.naturalWidth, dep.previewImg.naturalHeight);
            });
            //sprites.forEach((sprite) => {
            //    const tilesize = parseInt(resource.tilesize, 10),
            //        srcX = sprite.dstX,
            //        srcY = sprite.dstY,
            //        dstX = sprite.newDstX,
            //        dstY = sprite.newDstY;
            //    virtualCanvasCtx.drawImage(resImg, srcX, srcY, tilesize, tilesize, dstX, dstY, tilesize, tilesize);
            //});

            virtualCanvasImg  = new Image();
            virtualCanvasImg.src = virtualCanvasEl.toDataURL("image/png");

            imgReady = true;
        };

        redrawDepsOnCanvas();
    };


    this.reloadImage = (_reloadOptions) => {

        const reloadOptions = _.defaults(_reloadOptions || {}, {
            setResSize: false,
            redrawVirtualCanvas: false
        });

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

            const tilesize = parseInt(resource.tilesize, 10);
            if (reloadOptions.setResSize) {
                resource.columns = resImg.width / tilesize;
                resource.rows = resImg.height / tilesize;

                this.reloadProperties();
            }

            // Add grid interaction
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
                spriteGroups.forEach((spriteGroup) => {

                    // Is the group based off an extraction or image dep?
                    if (spriteGroup.spriteIsland) {
                        // Extracted sprites from another tilesheet
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

                            this.addInteractableSpriteGroup(spriteGroup);
                        });
                        spriteGroups.push(augmentedSpriteGroup);
                        debugger; // On load we already added this spriteGroup, do we really need to go through this route?
                    } else {

                        this.addInteractableSpriteGroup(spriteGroup);
                    }
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

                    const sheetId = resource.data.extractGroups[o].sheetId;
                    if (!extractGroups[o]) {
                        addExtractGroup(o, sheetId);
                    }

                    addEntityExtraction(e, o);
                });
            }

            // Draw image to virtual canvas
            virtualCanvasCtx.clearRect(0, 0, virtualCanvasEl.width, virtualCanvasEl.height);
            virtualCanvasCtx.drawImage(resImg, 0, 0, resImg.width, resImg.height, 0, 0, virtualCanvasEl.width, virtualCanvasEl.height);

            virtualCanvasImg  = new Image();
            virtualCanvasImg.src = virtualCanvasEl.toDataURL("image/png");

            this.redraw();

            if (reloadOptions.redrawVirtualCanvas) {
                this.redrawVirtualCanvas();
            }
        };

        if (resource.image) {
            resImg.src = `/resources/${resource.image}`;
        } else if (resource.output) {
            resImg.src = `/dist/resources/${resource.output}`;
        } else {
            throw Error("No source found for resource!");
        }
    };

    this.load = (_resource) => {

        resource = _resource;
        loadedResource = _.cloneDeep(_resource);

        InteractionMgr.load(canvasEl);

        if (resource.generated) {
            spriteGroups = [];
            sprites = [];

            // Flatten spriteGroups -> sprites
            resource.spriteGroups.forEach((_spriteGroup) => {

                const spriteGroup = {};
                spriteGroups.push(spriteGroup);

                // Load sprites from spriteGroups based off spriteIsland (for extractions from another tilesheet) or
                // image (for image deps)
                if (_spriteGroup.spriteIsland) {

                    spriteGroup.spriteIsland = [];
                    _spriteGroup.spriteIsland.forEach((sprite) => {

                        // Copy sprite
                        sprites.push({
                            sprite: sprite.sprite,
                            x: sprite.x,
                            y: sprite.y,
                            dstX: sprite.dstX,
                            dstY: sprite.dstY,
                            newDstX: sprite.dstX,
                            newDstY: sprite.dstY,
                            spriteGroup: spriteGroup
                        });
                    });

                    spriteGroup.assetId = _spriteGroup.assetId;
                } else {

                    spriteGroup.imageSrc = _spriteGroup.imageSrc;
                    spriteGroup.dstX = _spriteGroup.dstX;
                    spriteGroup.dstY = _spriteGroup.dstY;
                    spriteGroup.newDstX = _spriteGroup.dstX;
                    spriteGroup.newDstY = _spriteGroup.dstY;
                    spriteGroup.width = _spriteGroup.width;
                    spriteGroup.height = _spriteGroup.height;

                    // Build sprites from image
                    const tilesH = Math.ceil(_spriteGroup.height / resource.tilesize),
                        tilesW = Math.ceil(_spriteGroup.width / resource.tilesize),
                        dstX = _spriteGroup.dstX,
                        dstY = _spriteGroup.dstY;

                    for (let y = 0; y < tilesH; ++y) {
                        for (let x = 0; x < tilesW; ++x) {
                            sprites.push({
                                sprite: -1,
                                x: x * resource.tilesize,
                                y: y * resource.tilesize,
                                dstX: dstX + x * resource.tilesize,
                                dstY: dstY + y * resource.tilesize,
                                newDstX: dstX + x * resource.tilesize,
                                newDstY: dstY + y * resource.tilesize,
                                spriteGroup: spriteGroup
                            });
                        }
                    }
                }
            });

            // Load images from image based deps
            dependencies = [];
            resource.dependencies.forEach((_dep) => {

                const dep = {};
                if (_dep.imageSrc) {
                    dep.imageSrc   = _dep.imageSrc;
                    dep.previewSrc = _dep.previewSrc;
                    dep.processing = _dep.processing;
                } else {
                    dep.assetId    = _dep.assetId;
                    dep.sprites    = _.clone(_dep.sprites);
                }

                dependencies.push(dep);

                if (!dep.imageSrc) return;

                // Need to loadImageDependency in order to build previewImg (in case it doesn't exist), and draw virtual
                // canvas of img
                loadImageDependency(dep).then(() => { });
            });
        }

        if (resource.dirty && resource.generated) {
            // loadImageDependency for each dep, then redrawVirtualCanvas

            const loadingList = [];
            dependencies.forEach((dep) => {
                loadingList.push(loadImageDependency(dep));
            });

            Promise.all(loadingList).then(() => {
                // FIXME: What if we unload before this has loaded?
                this.reloadImage({
                    redrawVirtualCanvas: resource.dirty
                });
                this.reloadProperties();
            });
        } else {
            this.reloadImage();
            this.reloadProperties();
        }
    };

    this.addInteractableSpriteGroup = (spriteGroup) => {

        const tilesize = parseInt(resource.tilesize, 10),
            spritesInGroup = sprites.filter((sprite) => sprite.spriteGroup === spriteGroup);

        let topLeftSprite = null;
        spritesInGroup.forEach((sprite) => {

            // Find our top-left most sprite
            if (!topLeftSprite) {
                topLeftSprite = sprite;
            } else {
                if
                (
                    sprite.dstY <= topLeftSprite.dstY &&
                    sprite.dstX <= topLeftSprite.dstX
                )
                {
                    topLeftSprite = sprite;
                }
            }

            const entity = {
                x: sprite.dstX,
                y: sprite.dstY,
                w: tilesize,
                h: tilesize
            };
            const interactable = InteractionMgr.addEntity(entity.x, entity.y, entity.w, entity.h)
                .onHoverIn(() => {
                    highlightedIslands.push({
                        spriteGroup: spriteGroup,
                        sprites: spritesInGroup
                    });
                })
                .onHoverOut(() => {
                    for (let i = 0; i < highlightedIslands.length; ++i) {
                        if (highlightedIslands[i].spriteGroup === spriteGroup) {
                            highlightedIslands.splice(i, 1);
                            break;
                        }
                    }
                })
                .setCanDrag(true)
                .onBeginDrag(() => {
                    for (let j = 0; j < spritesInGroup.length; ++j) {
                        const sprite = spritesInGroup[j];
                        sprite.dragStartX = sprite.newDstX;
                        sprite.dragStartY = sprite.newDstY;
                    }

                    borderedIsland = spriteGroup;
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
                        for (let j = 0; j < spritesInGroup.length; ++j) {
                            if (!isAcceptableTranslation(spritesInGroup[j], potentialTranslations[i])) {
                                isAcceptable = false;
                                break;
                            }
                        }

                        // Acceptable translation?
                        if (isAcceptable) {

                            // Translate sprite to new position
                            const spritesToUpdate = [];
                            for (let j = 0; j < spritesInGroup.length; ++j) {
                                const sprite = spritesInGroup[j],
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

                            spriteGroup.newDstX = topLeftSprite.newDstX;
                            spriteGroup.newDstY = topLeftSprite.newDstY;

                            this.updateSpritePositions(spritesToUpdate);
                            this.redrawVirtualCanvas();
                            break;
                        }
                    }
                })
                .onEndDrag(() => {
                    borderedIsland = null;
                })
                .onDblClick(() => {

                    const dep = dependencies.find((dep) => dep.imageSrc === spriteGroup.imageSrc);

                    // Find this file dep in folder view and expand the image
                    $('.folderHierarchyImage').each((idx, fileEl) => {
                        if (dep.imageSrc === $(fileEl).data('file').pathTo)
                        {
                            $(fileEl).data('controls').openFile();

                            // Open folders that lead up to this dep
                            $(fileEl).parents('.folderHierarchyFolder').each((idx, folderEl) => {
                                $(folderEl).data('controls').openFile();
                            });

                            // Scroll in to focus for this image
                            const scrollTo = $(fileEl).position().top - 30;
                            $('#tilesheetFolderHierarchyContainer').scrollTop(scrollTo);
                        }
                    });
                });

            sprite.interactable = interactable;
        });
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
        //sprites.forEach((sprite) => {
        //    const tilesize = parseInt(resource.tilesize, 10),
        //        srcX = sprite.dstX,
        //        srcY = sprite.dstY,
        //        dstX = sprite.newDstX,
        //        dstY = sprite.newDstY;
        //    virtualCanvasCtx.drawImage(resImg, srcX, srcY, tilesize, tilesize, dstX, dstY, tilesize, tilesize);
        //});

        spriteGroups.forEach((spriteGroup) => {
            if (spriteGroup.spriteIsland) {
                debugger; // FIXME: need to copy the above for spriteIslands: draw each individual sprtie
            } else {

                const dep = dependencies.find((dep) => dep.imageSrc === spriteGroup.imageSrc);
                const resImg = dep.previewImgBitmap;

                const width = spriteGroup.width,
                    height = spriteGroup.height,
                    dstX = spriteGroup.newDstX,
                    dstY = spriteGroup.newDstY;
                virtualCanvasCtx.drawImage(resImg, 0, 0, width, height, dstX, dstY, width, height);
            }
        });

        virtualCanvasImg  = new Image();
        virtualCanvasImg.src = virtualCanvasEl.toDataURL("image/png");
    };

    this.unload = () => {
        imgReady = false;
        resource = null;
        loadedResource = null;

        _.forEach(entities.objects, (obj) => {
            $(obj.el).remove();
        });

        _.forEach(entities.extracts, (ext) => {
            $(ext.el).remove();
        });

        entities.collision = [];
        entities.floating  = [];
        entities.shootable = [];
        entities.objects   = {};
        entities.extracts  = {};

        InteractionMgr.unload();

        this.onSave = () => {};
    };

    this.clearCanvas = () => {
        canvasCtx.clearRect(0, 0, canvasEl.width, canvasEl.height);
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

            const island = highlightedIslands[i].sprites,
                tilesize = 16;
            for (let j = 0; j < island.length; ++j) {
                const highlight = island[j];
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
        if (Settings.drawGrid || borderedIsland) {
            canvasCtx.save();
            for (let y = 0; y < (resource.rows * tilesize); y += tilesize) {
                for (let x = 0; x < (resource.columns * tilesize); x += tilesize) {

                    const gridLineWidth = 1,
                        gridAlpha       = 0.1;
                    canvasCtx.globalAlpha = gridAlpha;
                    canvasCtx.strokeRect(x - (gridLineWidth/2), y - (gridLineWidth/2), tilesize + (gridLineWidth/2), tilesize + (gridLineWidth/2));
                }
            }
            canvasCtx.restore();
        }


        // Border islands
        if (borderedIsland) {
            spriteGroups.forEach((spriteGroup) => {
                if (spriteGroup === borderedIsland) return;

                // Draw border for spriteGroup
                canvasCtx.save();
                const gridLineWidth = 1,
                    gridAlpha       = 0.1,
                    x               = spriteGroup.newDstX,
                    y               = spriteGroup.newDstY,
                    width           = tilesize * Math.ceil(spriteGroup.width / tilesize),
                    height          = tilesize * Math.ceil(spriteGroup.height / tilesize);
                canvasCtx.globalAlpha = 1.0;
                canvasCtx.strokeStyle = '#FF0000';
                canvasCtx.strokeRect(x - (gridLineWidth/2), y - (gridLineWidth/2), width + (gridLineWidth/2), height + (gridLineWidth/2));
                canvasCtx.restore();
            });

            // Draw border for borderedIsland
            canvasCtx.save();
            const gridLineWidth = 2,
                gridAlpha       = 0.1,
                x               = borderedIsland.newDstX,
                y               = borderedIsland.newDstY,
                width           = tilesize * Math.ceil(borderedIsland.width / tilesize),
                height          = tilesize * Math.ceil(borderedIsland.height / tilesize);
            canvasCtx.globalAlpha = 1.0;
            canvasCtx.strokeStyle = '#FFFF00';
            canvasCtx.strokeRect(x - (gridLineWidth/2), y - (gridLineWidth/2), width + (gridLineWidth/2), height + (gridLineWidth/2));
            canvasCtx.restore();
        }
    };

    this.step = (time) => {
        if (imgReady) {
            this.redraw();
        }
    };

    this.createNew = (_resource) => {

        resource = _resource;
        loadedResource = _.cloneDeep(_resource);

        this.clearCanvas();
        this.reloadProperties();
        InteractionMgr.load(canvasEl);

        this.flagPendingChanges();
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
            // NOTE: Need to save oldSprites for resourceBuilder to translate external assets (eg. maps) from old sprite
            // positions to new positions
            resource.oldSprites = resource.sprites;
            resource.sprites = [];
            sprites.forEach((sprite) => {

                // We don't want to include sprites from imageSrc, only the image dep spriteGroup
                if (sprite.spriteGroup.imageSrc) return;

                const _sprite = {
                    source: sprite.source,
                    dstX: sprite.newDstX,
                    dstY: sprite.newDstY,
                    sprite: sprite.sprite
                };

                if (sprite.sprite === -1) {
                    _sprite.srcX = sprite.srcX;
                    _sprite.srcY = sprite.srcY;
                }

                resource.sprites.push(_sprite);
            });

            const oldSpriteGroups = loadedResource.spriteGroups;
            resource.spriteGroups = [];
            spriteGroups.forEach((spriteGroup) => {

                const newSpriteGroup = {};

                if (spriteGroup.imageSrc) {

                    newSpriteGroup.imageSrc = spriteGroup.imageSrc;
                    newSpriteGroup.dstX = spriteGroup.newDstX;
                    newSpriteGroup.dstY = spriteGroup.newDstY;
                    newSpriteGroup.width = spriteGroup.width;
                    newSpriteGroup.height = spriteGroup.height;

                    // Find old spriteGroup, compare against this one
                    const oldSpriteGroup = oldSpriteGroups.find((oldSpriteGroup) => oldSpriteGroup.imageSrc === spriteGroup.imageSrc);
                    if (oldSpriteGroup) {

                        if
                        (
                            oldSpriteGroup.dstX !== newSpriteGroup.dstX ||
                            oldSpriteGroup.dstY !== newSpriteGroup.dstY ||
                            oldSpriteGroup.width !== newSpriteGroup.width ||
                            oldSpriteGroup.height !== newSpriteGroup.height
                        )
                        {
                            newSpriteGroup.oldSpriteGroup = {
                                dstX: oldSpriteGroup.dstX,
                                dstY: oldSpriteGroup.dstY,
                                width: oldSpriteGroup.width,
                                height: oldSpriteGroup.height
                            };

                            resource.dirty = true;
                        }
                    } else {
                        resource.dirty = true;
                    }

                } else {

                    newSpriteGroup.assetId = spriteGroup.assetId;
                    newSpriteGroup.spriteIsland = [];
                    spriteGroup.forEach((sprite) => {

                        let _sprite = sprite.sprite.spriteGroup.spriteIsland.find((s) => s.sprite === sprite.sprite.sprite)
                        newSpriteGroup.spriteIsland.push({
                            sprite: _sprite.sprite,
                            x: _sprite.x,
                            y: _sprite.y,
                            dstX: sprite.sprite.newDstX / tilesize, // NOTE: Need updated pos
                            dstY: sprite.sprite.newDstY / tilesize
                        });
                    });
                }

                resource.spriteGroups.push(newSpriteGroup);
            });

            // Have any of the dependencies been modified?
            resource.dependencies = [];
            dependencies.forEach((dep) => {
                let oldDep = null;
                if (loadedResource.dependencies) {
                    oldDep = loadedResource.dependencies.find((oldDep) => oldDep.imageSrc === dep.imageSrc);
                }

                let saveDep = {};
                if (dep.imageSrc) {
                    saveDep.imageSrc   = dep.imageSrc;
                    saveDep.previewSrc = dep.previewSrc;
                    saveDep.processing = dep.processing;
                } else {
                    debugger; // FIXME: I bet we can't clone sprites like this
                    saveDep.assetId    = dep.assetId;
                    saveDep.sprites    = _.clone(dep.sprites);
                }

                resource.dependencies.push(saveDep);

                // Was this dependency here already?
                if (!oldDep) {
                    resource.dirty = true;
                    return;
                }

                // Image based dep?
                if (dep.imageSrc) {

                    // Has processing changed?
                    if (dep.processing !== oldDep.processing) {
                        resource.dirty = true;
                    }
                }
            });

            console.log(sprites);
            console.log(spriteGroups);
        }

        const sheetId = $('#tilesheetName').val();
        resource.id = sheetId;

        // Does this sheetId already exist?
        for (let i = 0; i < ResourceMgr.allResources.length; ++i) {
            const otherRes = ResourceMgr.allResources[i];

            // NOTE: If we ever can't trust the current resource against allResources[res] then we could just check if
            // there's two copies of the same id in allResources, if so then we know that the id isn't unique
            if (otherRes.data === resource) continue;
            if (otherRes.resType !== 'tilesheet') continue;

            if (otherRes.data.id === resource.id) {
                ConsoleMgr.log("We're already using this id elsewhere!", LOG_ERROR);
                return false;
            }
        }

        if (resource.generated) {
            resource.output = `sprites/${resource.id}`;
        }

        const description = $('#tilesheetDescription').val();
        delete resource.description;
        if (description) {
            resource.description = description;
        }

        // TODO: It would be better to wait for a reply on save to confirm the save was successful
        // Otherwise what happens if we continue to save this w/out having rebuilt it, or vice versa we keep rebuilding
        // each time we save. Need to reload on rebuild or somethnig
        //loadedResource = _.cloneDeep(resource);

        this.onSave(resource.id).then((data) => {
            ConsoleMgr.log(`Successfully saved ${resource.id}`);
            ConsoleMgr.log(data.results);
        }).catch((data) => {
            console.log(data);
            ConsoleMgr.log(`Error saving ${resource.id}`, LOG_ERROR);
            ConsoleMgr.log(data.results, LOG_ERROR);
        });
    };

    this.flagPendingChanges = () => {

        $('#tilesheetControls').addClass('pendingChanges');

        pendingChanges = true;
    };

    // First time initialization
    this.reloadFolderHierarchy();

    const clickedActionBtn = (evt) => {
        const el      = $(evt.currentTarget),
            action    = el.data('action'),
            oldAction = activeAction;
        activeAction = action;

        if (activeActionEl) {
            activeActionEl.removeClass('active');
            if (activeAction === oldAction) {
                activeActionEl = null;
                activeAction = null;
                return;
            }
        }
        activeActionEl = el;
        activeActionEl.addClass('active');
    };

    // First time initialization
    this.reloadFolderHierarchy();
    $('#tilesheetBtnCollision')
        .click(clickedActionBtn)
        .data('action', ACTION_COLLISION);

    $('#tilesheetBtnFloating')
        .click(clickedActionBtn)
        .data('action', ACTION_FLOATING);

    $('#tilesheetBtnShootable')
        .click(clickedActionBtn)
        .data('action', ACTION_SHOOTABLE);

    $('#tilesheetBtnObject')
        .click(clickedActionBtn)
        .data('action', ACTION_OBJECT);

    $('#tilesheetBtnExtract')
        .click(clickedActionBtn)
        .data('action', ACTION_EXTRACT);

    $('#tilesheetSave').click(() => {
        this.save();
        return false;
    });

	$('#tilesheetTilesize')[0].min = 8;
	$('#tilesheetTilesize')[0].max = 256;
	$('#tilesheetTilesize')[0].oninput = () => {
		const newTilesize = parseInt($('#tilesheetTilesize')[0].value);
        $('#tilesheetTilesizeValue').val(newTilesize);

        resource.tilesize = newTilesize;
	};
    $('#tilesheetTilesizeValue')[0].oninput = () => {
		const newTilesize = parseInt($('#tilesheetTilesizeValue')[0].value);

        if ($('#tilesheetTilesize').val() !== newTilesize) {
            $('#tilesheetTilesize').val(newTilesize);
            resource.tilesize = newTilesize;
        }
    };


	$('#tilesheetColumns')[0].min = 1;
	$('#tilesheetColumns')[0].max = 64;
	$('#tilesheetColumns')[0].oninput = () => {
		const newColumns = parseInt($('#tilesheetColumns')[0].value);
        $('#tilesheetColumnsValue').val(newColumns);

        resource.columns = newColumns;
	};
    $('#tilesheetColumnsValue')[0].oninput = () => {
		const newColumns = parseInt($('#tilesheetColumnsValue')[0].value);

        if ($('#tilesheetColumns').val() !== newColumns) {
            $('#tilesheetColumns').val(newColumns);
            resource.columns = newColumns;
        }
    };

	$('#tilesheetRows')[0].min = 1;
	$('#tilesheetRows')[0].max = 64;
	$('#tilesheetRows')[0].oninput = () => {
		const newRows = parseInt($('#tilesheetRows')[0].value);
        $('#tilesheetRowsValue').val(newRows);

        resource.rows = newRows;
	};
    $('#tilesheetRowsValue')[0].oninput = () => {
		const newRows = parseInt($('#tilesheetRowsValue')[0].value);

        if ($('#tilesheetRows').val() !== newRows) {
            $('#tilesheetRows').val(newRows);
            resource.rows = newRows;
        }
    };

    $('#tilesheetShowgrid')[0].onchange = () => {
		const showGrid = $('#tilesheetShowgrid')[0].checked;
        Settings.drawGrid = showGrid;
	};

    $('#tilesheetGenerateFromImages')[0].onchange = () => {
		const generateFromImages = $('#tilesheetGenerateFromImages')[0].checked;
        resource.generated = generateFromImages;

        if (generateFromImages) {
            $('#tilesheetFolderHierarchyContainer').removeClass('hidden');
            dependencies = [];
            spriteGroups = [];
            sprites = [];
        } else {
            $('#tilesheetFolderHierarchyContainer').addClass('hidden');
            dependencies = null;
            spriteGroups = null;
            sprites = null;
        }
	};

    canvasEl.ondragover = () => {
        $(canvasEl).addClass('hover');
        return false;
    };

    canvasEl.ondragleave  = () => {
        $(canvasEl).removeClass('hover');
        return false;
    };

	canvasEl.ondrop     = (e) => {
		e.preventDefault();

        $(canvasEl).removeClass('hover');

		const file = e.dataTransfer.files[0],
			isTilesheet = (file.type.indexOf('image') >= 0);

        if (!isTilesheet) {
            console.error("Not an image!");
            return false;
        }

        const predictedFilepath = 'sprites/' + file.name;
        resource.image = predictedFilepath;
        resource.output = predictedFilepath;
        this.reloadImage({
            setResSize: true
        });

        return false;
	};
});
