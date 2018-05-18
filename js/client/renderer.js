
// Renderer
define(['loggable'], (Loggable) => {


    const Renderer = function() {

        extendClass(this).with(Loggable);
        this.setLogGroup('Renderer');
        this.setLogPrefix('Renderer');

        this.initialized          = false;
        this.lastUpdateTime       = now();

        this.canvasEntities       = null;
        this.canvasBackground     = null;
        this.ctxEntities          = null;
        this.ctxBackground        = null;
        this.backgroundsContainer = null;

        // Each loaded page has their own dedicated canvas/ctx in this pool. They are rendered once to their canvas, and
        // then whenever our pages change we render (copy) each canvas to the master background canvas. Whenever we move
        // around, we only need to move the background via. CSS
        this.canvasBackgroundPool = [];
        this.pagesHaveChanged     = false;

        this.camera               = null;
        this.ui                   = null;
        this.area                 = null;
        this.tilesheet            = null;
        this.tilesheets           = null;

        this.projectiles          = [];
        this.ragdolls             = [];

        this.settings  = {
            lineWidth: 3,
            smoothing: false,
            strokeStyle: '#CCCCCC',

            pathHighlight: {
                speed: 10,
                colorBright: '#88FF88',
                colorDim: '#22DD22',
                bgAlpha: 0.4,
                bgStroke: '#669966',
                lineDash: 4,
                alpha: 0.8
            },

            movableHighlight: {
                borderThickness: 1,
                borderColor: 'yellow',
                filter: 'saturate(160%) contrast(140%)'
            },

            ragdoll: {
                life: 2000,
                filter: (t) => `opacity(${100 * t / 2000}%)`
            }
        };

        this.paused = false;
        this.pause = () => { this.paused = true; };
        this.resume = () => { this.paused = false; };

        this.setArea = (area) => {

            this.area       = area;

            const sheetsToUse = {};
            _.each(Resources.sheets, (sheet) => {
                sheetsToUse[sheet.gid.first] = sheet;
            });

            this.tilesheets = [];
            _.each(sheetsToUse, (sheet) => {
                this.tilesheets.push(sheet);
            });

            if (this.initialized) {
                this.updatePages();
            }
        };

        this.initialize = (options) => {

            this.settings = _.defaults(this.settings, options || {});

            this.ctxEntities   = this.canvasEntities.getContext('2d');
            this.ctxBackground = this.canvasBackground.getContext('2d');

            const canvasWidth = (Env.pageWidth + 2 * Env.pageBorder) * Env.tileSize * Env.tileScale,
                canvasHeight  = (Env.pageHeight + 2 * Env.pageBorder) * Env.tileSize * Env.tileScale;

            this.canvasEntities.width    = canvasWidth;
            this.canvasEntities.height   = canvasHeight;
            this.canvasBackground.width  = canvasWidth * 3; // Needs to fit curPage and both adjacent pages
            this.canvasBackground.height = canvasHeight * 3;

            this.ctxEntities.mozImageSmoothingEnabled      = this.settings.smoothing;
            this.ctxEntities.webkitImageSmoothingEnabled   = this.settings.smoothing;
            this.ctxEntities.imageSmoothingEnabled         = this.settings.smoothing;
            this.ctxEntities.strokeStyle                   = this.settings.strokeStyle;
            this.ctxEntities.lineWidth                     = this.settings.lineWidth;
            this.ctxBackground.mozImageSmoothingEnabled    = this.settings.smoothing;
            this.ctxBackground.webkitImageSmoothingEnabled = this.settings.smoothing;
            this.ctxBackground.imageSmoothingEnabled       = this.settings.smoothing;
            this.ctxBackground.strokeStyle                 = this.settings.strokeStyle;
            this.ctxBackground.lineWidth                   = this.settings.lineWidth;


            // Setup each background canvas
            // We use one per page
            for (let i = 0; i < 9; ++i) {
                let pageBg = {};
                this.canvasBackgroundPool.push(pageBg);

                pageBg.canvasEl = document.getElementById(`background-${i}`);
                pageBg.canvasCtx = pageBg.canvasEl.getContext('2d');

                const canvasCtx = pageBg.canvasCtx;
                canvasCtx.mozImageSmoothingEnabled    = this.settings.smoothing;
                canvasCtx.webkitImageSmoothingEnabled = this.settings.smoothing;
                canvasCtx.imageSmoothingEnabled       = this.settings.smoothing;
                canvasCtx.strokeStyle                 = this.settings.strokeStyle;
                canvasCtx.lineWidth                   = this.settings.lineWidth;

                pageBg.page = null; // Free to use, no page associated with it yet
                pageBg.needsUpdate = false;
            }

            this.updatePages();
            this.initialized = true;
        };

        this.step = (time) => {
            const delta = time - this.lastUpdateTime;
            this.lastUpdateTime = time;

            for (let i = this.projectiles.length - 1; i >= 0; --i) {
                const projectile = this.projectiles[i];
                projectile.timeToDie -= delta;

                if (projectile.timeToDie <= 0) {
                    this.projectiles.splice(i, 1);
                }
            }

            for (let i = this.ragdolls.length - 1; i >= 0; --i) {
                const ragdoll = this.ragdolls[i];
                ragdoll.timeToDie -= delta;

                if (ragdoll.timeToDie <= 0) {
                    this.ragdolls.splice(i, 1);
                }

                ragdoll.entity.step(time);
            }
        };

        this.sheetFromGID = (gid) => {
            let tilesheet = this.tilesheets.find((t) => inRange(gid, t.gid.first, t.gid.last));

            if (tilesheet) return tilesheet;

            // Tileset wasn't included in area, so look through resources and cache for next time
            tilesheet = _.find(Resources.sheets, (t) => inRange(gid, t.gid.first, t.gid.last));

            if (tilesheet) {
                this.tilesheets.unshift(tilesheet);
                return tilesheet;
            }

            throw Err(`Could not find tilesheet corresponding to gid ${gid}`);
        };

        // Update pages currently loaded (curPage/neighbours)
        // NOTE: This function can hit twice when zoning: once when we locally
        // recognize ourselves as zoning, and again when the server tells us
        // that we've zoned
        this.updatePages = () => {

            let allPages = [];
            allPages.push(this.area.curPage);
            allPages.push(this.area.curPage.neighbours.northwest);
            allPages.push(this.area.curPage.neighbours.north);
            allPages.push(this.area.curPage.neighbours.northeast);
            allPages.push(this.area.curPage.neighbours.west);
            allPages.push(this.area.curPage.neighbours.east);
            allPages.push(this.area.curPage.neighbours.southwest);
            allPages.push(this.area.curPage.neighbours.south);
            allPages.push(this.area.curPage.neighbours.southeast);

            // Find all pages loaded which aren't in our canvas pool
            let missingPages = [];
            for (let i = 0; i < allPages.length; ++i) {
                let page = allPages[i];

                if (!page) continue; // Empty neighbour

                // Is this page currently loaded into the canvas pool?
                let foundPage = false;
                for (let j = 0; j < this.canvasBackgroundPool.length; ++j) {
                    const pageBg = this.canvasBackgroundPool[j];

                    if (pageBg.page === page) {
                        foundPage = true;
                        break;
                    }
                }

                if (!foundPage) {
                    missingPages.push(page);
                }
            }

            // Find items in the pool which are currently available (not in use)
            // Need to cleanup memory (avoid memory leak) of page, and clear
            // canvas in case we reach the edge of the map
            let expiredPoolPages = [];
            for (let i = 0; i < this.canvasBackgroundPool.length; ++i) {
                let pooledPage = this.canvasBackgroundPool[i];

                let foundPage = false;

                if (pooledPage.page) {
                    for (let j = 0; j < allPages.length; ++j) {
                        if (pooledPage.page === allPages[j]) {
                            foundPage = true;
                            break;
                        }
                    }
                }

                // I see you've expired, or are just empty
                if (!foundPage) {
                    expiredPoolPages.push(pooledPage);
                    pooledPage.page = null;
                    pooledPage.canvasCtx.clearRect(0, 0, pooledPage.canvasEl.width, pooledPage.canvasEl.height);
                }
            }


            // Add missing pages to pool
            if (missingPages.length > 0) {
                assert(missingPages.length <= expiredPoolPages.length);

                // Lets add the missing pages into these expired pages
                for (let i = 0; i < missingPages.length; ++i) {
                    expiredPoolPages[i].page = missingPages[i];
                    expiredPoolPages[i].needsUpdate = true;
                    expiredPoolPages[i].imageData = null;
                }
                
                // Render each new page to the canvas
                // TODO: Could probably async this
                for (let i = 0; i < expiredPoolPages.length; ++i) {

                    const pageBg = expiredPoolPages[i];
                    if (!expiredPoolPages[i].page) {
                        pageBg.canvasCtx.clearRect(0, 0, pageBg.canvasEl.width, pageBg.canvasEl.height);
                        continue;
                    }

                    this.renderPageStatic(pageBg, pageBg.page, 0, 0, Env.pageWidth, Env.pageHeight, 0, 0);
                }
            }

            // TODO: Our pages may have changed, but this doesn't necessarily mean that we need to perform a redraw on
            // our background. What if we've reached the edge of the map, so we haven't received any new pages but we
            // have changed our curPage (where the center of the background is)
            this.pagesHaveChanged = true;
        };

        this.render = () => {
            if (this.paused) return;

            // Redraw the entities every frame
            this.ctxEntities.clearRect(0, 0, this.canvasEntities.width, this.canvasEntities.height);

            let sheetData = this.tilesheets[0]; // TODO: fix this: necessary in some places


            // Update the background canvas with renders from each page canvas
            // FIXME: offload background rendering in async operation; could do this w/ a double buffer canavs
            if (this.camera.updated || this.pagesHaveChanged) {

                const shiftedOffX = Env.pageWidth * Env.tileSize,
                    shiftedOffY   = Env.pageHeight * Env.tileSize;

                if (this.pagesHaveChanged) {
                    this.pagesHaveChanged = false;
                    this.ctxBackground.clearRect(0, 0, this.canvasBackground.width, this.canvasBackground.height);



                    // Render current page to background
                    let curPageBg = null;
                    for (let i = 0; i < this.canvasBackgroundPool.length; ++i) {
                        if (this.canvasBackgroundPool[i].page === this.area.curPage) {
                            curPageBg = this.canvasBackgroundPool[i];
                            break;
                        }
                    }

                    if (Env.renderer.pooledPagesCopyImageData) {
                        if (!curPageBg.imageData) {
                            curPageBg.imageData = curPageBg.canvasCtx.getImageData(0, 0, Env.pageRealWidth * Env.tileScale, Env.pageRealHeight * Env.tileScale);
                        }

                        this.ctxBackground.putImageData(curPageBg.imageData, shiftedOffX * Env.tileScale, shiftedOffY * Env.tileScale, 0, 0, Env.pageRealWidth * Env.tileScale, Env.pageRealHeight * Env.tileScale);
                    } else {
                        curPageBg.canvasEl.style.display = '';
                    }


                    // Draw neighbour pages
                    const neighbours = [];
                    for (const neighbourKey in this.area.curPage.neighbours) {
                        const neighbour = this.area.curPage.neighbours[neighbourKey];
                        if (!neighbour) continue;

                        const neighbourInfo = {};
                        neighbourInfo.neighbour = neighbour;
                        neighbourInfo.name      = neighbourKey;

                        if (neighbourKey.indexOf('south') !== -1) {
                            neighbourInfo.offsetY = Env.pageHeight * Env.tileSize;
                        } else if (neighbourKey.indexOf('north') !== -1) {
                            neighbourInfo.offsetY = -Env.pageHeight * Env.tileSize;
                        } else {
                            neighbourInfo.offsetY = 0;
                        }

                        if (neighbourKey.indexOf('west') !== -1) {
                            neighbourInfo.offsetX = -Env.pageWidth * Env.tileSize;
                        } else if (neighbourKey.indexOf('east') !== -1) {
                            neighbourInfo.offsetX = Env.pageWidth * Env.tileSize;
                        } else {
                            neighbourInfo.offsetX = 0;
                        }

                        neighbours.push(neighbourInfo);

                        const offX = neighbourInfo.offsetX + shiftedOffX,
                            offY   = neighbourInfo.offsetY + shiftedOffY;

                        let neighbourBg = null;
                        for (let i = 0; i < this.canvasBackgroundPool.length; ++i) {
                            if (this.canvasBackgroundPool[i].page === neighbour) {
                                neighbourBg = this.canvasBackgroundPool[i];
                                break;
                            }
                        }

                        assert(neighbourBg !== null);

                        if (Env.renderer.pooledPagesCopyImageData) {
                            if (!neighbourBg.imageData) {
                                neighbourBg.imageData = neighbourBg.canvasCtx.getImageData(0, 0, Env.pageRealWidth * Env.tileScale, Env.pageRealHeight * Env.tileScale);

                                if (Env.assertion.checkGetImageDataZeroBug) {

                                    let allZeroes = true;
                                    for (let i = 0; i < neighbourBg.imageData.data.length; ++i) {
                                        if (neighbourBg.imageData.data[i] !== 0) {
                                            allZeroes = false;
                                            break;
                                        }
                                    }

                                    assert(!allZeroes, "GetImageData from canvas ctx for pooled page returning all zeroes. If you're on Chromium it could be an issue w/ #disable-accelerated-2d-canvas in chrome://flags");
                                }
                            }

                            this.ctxBackground.putImageData(neighbourBg.imageData, offX * Env.tileScale, offY * Env.tileScale, 0, 0, Env.pageRealWidth * Env.tileScale, Env.pageRealHeight * Env.tileScale);
                        }

                        assert(this.canvasBackgroundPool.find((el) => el.page && (el.page !== neighbour && el.page.index === neighbour.index)) === undefined, `Memory leak -- we're holding onto an old copy of a neighbour page in our background pool: ${neighbour.index}`);
                    }

                    if (!Env.renderer.pooledPagesCopyImageData) {

                        // Pooled bg canvases in grid
                        // NOTE: Some of these may be null (either we've zoned locally before zoning remotely, so we don't have those pages, OR we've reach the edge of the map)
                        const orderedPages = [
                            this.canvasBackgroundPool.find((el) => el.page && el.page === this.area.curPage.neighbours['northwest']),
                            this.canvasBackgroundPool.find((el) => el.page && el.page === this.area.curPage.neighbours['north']),
                            this.canvasBackgroundPool.find((el) => el.page && el.page === this.area.curPage.neighbours['northeast']),

                            this.canvasBackgroundPool.find((el) => el.page && el.page === this.area.curPage.neighbours['west']),
                            this.canvasBackgroundPool.find((el) => el.page && el.page === this.area.curPage),
                            this.canvasBackgroundPool.find((el) => el.page && el.page === this.area.curPage.neighbours['east']),

                            this.canvasBackgroundPool.find((el) => el.page && el.page === this.area.curPage.neighbours['southwest']),
                            this.canvasBackgroundPool.find((el) => el.page && el.page === this.area.curPage.neighbours['south']),
                            this.canvasBackgroundPool.find((el) => el.page && el.page === this.area.curPage.neighbours['southeast'])
                        ];


                        const unusedPages = [],
                            backgroundsChildren = $(this.backgroundsContainer).children();
                        this.canvasBackgroundPool.forEach((el) => { if (orderedPages.indexOf(el) === -1) unusedPages.push(el); });

                        let nullPageCount = 0,
                            matchingI     = true; // Are the grid pages already in order? (this could be because we've already hit updatePages for this zone)
                        for (let i = 0; i < orderedPages.length; ++i) {
                            if (!orderedPages[i]) orderedPages[i] = unusedPages[nullPageCount++];
                            if (orderedPages[i] !== backgroundsChildren[i]) matchingI = false;
                        }


                        // Are the grid pages already in order?
                        if (!matchingI) {
                            this.backgroundsContainer.style.display = 'none';
                            for (let i = orderedPages.length - 1; i >= 0; --i) {
                                this.backgroundsContainer.insertAdjacentElement('afterbegin', orderedPages[i].canvasEl);
                            }
                            this.backgroundsContainer.style.display = 'grid';
                        }
                    }
                }

                // Translate the background canvas so that the center of the background covers the center of the
                // entities canvas. Entities are being positioned via. CSS, so lets just steal its offset, and then
                // offset to the position within the background
                if (Env.renderer.pooledPagesCopyImageData) {
                    const entitiesOffset = $('#entities').offset();
                    $('#background').offset({ left: entitiesOffset.left + (-The.camera.offsetX - shiftedOffX) * Env.tileScale, top: entitiesOffset.top + (The.camera.offsetY - shiftedOffY) * Env.tileScale });
                } else {
                    let curPageBg = null;
                    for (let i = 0; i < this.canvasBackgroundPool.length; ++i) {
                        if (this.canvasBackgroundPool[i].page === this.area.curPage) {
                            curPageBg = this.canvasBackgroundPool[i];
                            break;
                        }
                    }

                    this.backgroundsContainer.style.left = -1 * (Env.pageRealWidth + The.camera.offsetX) * Env.tileScale;
                    this.backgroundsContainer.style.top = -1 * (Env.pageRealHeight - The.camera.offsetY) * Env.tileScale;
                }

                this.camera.updated = false;
            }


            // Draw tile highlights
            if (this.ui.tileHover) {

                const ts = Env.tileScale * Env.tileSize;
                this.ctxEntities.save();
                this.ctxEntities.globalAlpha = 0.4;
                this.ctxEntities.strokeRect(
                    ts * this.ui.tileHover.x,
                    ts * this.ui.tileHover.y,
                    ts - (this.settings.lineWidth / 2),
                    ts - (this.settings.lineWidth / 2)
                );

                if (this.showJumpPoint) {
                    const width   = 16.0,
                        height    = 6.0,
                        horzMid   = (ts * (this.ui.tileHover.x + 0.5) - 0.5 * width),
                        horzLeft  = (ts * this.ui.tileHover.x - 2.0 * width),
                        horzRight = (ts * (this.ui.tileHover.x + 1) + width),
                        vertTop   = (ts * this.ui.tileHover.y - height),
                        vertMid   = (ts * (this.ui.tileHover.y + 0.5) + height),
                        vertBot   = (ts * (this.ui.tileHover.y + 1.0) + 2.0 * height);

                    this.ctxEntities.globalAlpha = 1.0;
                    this.ctxEntities.font = "12px serif";
                    this.ctxEntities.fillText(this.showJumpPoint[0], horzMid, vertTop, width);
                    this.ctxEntities.fillText(this.showJumpPoint[1], horzLeft, vertMid, width);
                    this.ctxEntities.fillText(this.showJumpPoint[2], horzMid, vertBot, width);
                    this.ctxEntities.fillText(this.showJumpPoint[3], horzRight, vertMid, width);

                    for (const tileID in The.area.curPage.forcedNeighbours) {
                        let _x = tileID % The.area.areaWidth,
                            _y = Math.floor(tileID / The.area.areaWidth);
                        _y = (_y - this.area.curPage.y) + this.camera.offsetY / Env.tileSize;
                        _x = (_x - this.area.curPage.x) - this.camera.offsetX / Env.tileSize;

                        this.ctxEntities.strokeRect(ts*_x, ts*_y, ts-(this.settings.lineWidth/2), ts-(this.settings.lineWidth/2));
                    }
                }

                this.ctxEntities.restore();
            }

            if (this.ui.tilePathHighlight) {

                const ts   = Env.tileScale * Env.tileSize,
                    x      = (this.ui.tilePathHighlight.x - this.area.curPage.x) * ts - this.camera.offsetX * Env.tileScale,
                    y      = (this.ui.tilePathHighlight.y - this.area.curPage.y) * ts + this.camera.offsetY * Env.tileScale,
                    width  = ts - (this.settings.lineWidth / 2),
                    height = ts - (this.settings.lineWidth / 2),
                    pathHl = this.settings.pathHighlight,
                    step   = (++this.ui.tilePathHighlight.step % pathHl.speed),
                    color  = (step < (pathHl.speed / 2) ? pathHl.colorBright : pathHl.colorDim);


                this.ctxEntities.save();
                this.ctxEntities.strokeStyle = pathHl.bgStroke;
                this.ctxEntities.globalAlpha = pathHl.bgAlpha;
                this.ctxEntities.strokeRect(x, y, width, height);

                this.ctxEntities.globalAlpha = pathHl.alpha;
                this.ctxEntities.strokeStyle = color;
                this.ctxEntities.setLineDash([pathHl.lineDash * Env.tileScale]);
                this.ctxEntities.strokeRect(x, y, width, height);
                this.ctxEntities.restore();

            }

            // ------------------------------------------------------------------------------------------------------ //
            //                                       RENDER PAGE
            // ------------------------------------------------------------------------------------------------------ //

            const pages    = [],
                floatingSprites = [],
                RenderPage = function(page, offX, offY) {
                    this.page = page;
                    this.offX = offX;
                    this.offY = offY;
                };

            const curPage  = new RenderPage(this.area.curPage, 0, 0);
            pages.push(curPage);
            for (const neighbourKey in this.area.curPage.neighbours) {
                const neighbour = this.area.curPage.neighbours[neighbourKey];
                if (!neighbour) continue;

                let offX = 0,
                    offY = 0;

                if (neighbourKey.indexOf('south') !== -1) {
                    offY = Env.pageHeight * Env.tileSize;
                } else if (neighbourKey.indexOf('north') !== -1) {
                    offY = -Env.pageHeight * Env.tileSize;
                }

                if (neighbourKey.indexOf('west') !== -1) {
                    offX = -Env.pageWidth * Env.tileSize;
                } else if (neighbourKey.indexOf('east') !== -1) {
                    offX = Env.pageWidth * Env.tileSize;
                }

                const neighbourInfo = new RenderPage(neighbour, offX, offY);
                pages.push(neighbourInfo);
            }


            pages.forEach((renderPage) => {

                const page    = renderPage.page,
                    offX      = renderPage.offX,
                    offY      = renderPage.offY,
                    items     = [];

                // FIXME: This is disgusting! Copying items every frame, and pushing into an array unecessarily. Fix
                // this!
                for (let coord in page.items) {
                    items[parseInt(coord)] = page.items[coord];
                }

                const drawLists = [page.sprites, items];

                drawLists.forEach((drawList) => {

                    // Draw entity in this list
                    for(let coord = 0; coord < drawList.length; ++coord) {
                        const entityObj = drawList[coord];
                        if (!entityObj) continue;

                        const entity     = (entityObj ? entityObj.sprite - 1 : -1),
                            sheetData    = entityObj.sheet || this.sheetFromGID(entity),
                            entIdInSheet = entity - sheetData.gid.first,
                            tilesPerRow  = sheetData.tilesPerRow,
                            floating     = sheetData.data.floating,
                            iy           = Math.floor(coord / Env.pageWidth),
                            ix           = coord % Env.pageWidth,
                            sy           = Math.max(-1, Math.floor(entIdInSheet / tilesPerRow)),
                            sx           = Math.max(-1, entIdInSheet % tilesPerRow),
                            tileSize     = sheetData.tileSize.width,
                            py           = (iy * Env.tileSize + this.camera.offsetY + offY) * Env.tileScale,
                            px           = (ix * Env.tileSize - this.camera.offsetX + offX) * Env.tileScale;


                        if (!entityObj.sheet) entityObj.sheet = sheetData;
                        if (sy !== -1 && sx !== -1 && entity !== -1 && !entityObj.hasOwnProperty('static')) {
                            if (floating !== undefined &&
                                floating.indexOf(entIdInSheet) >= 0) {

                                floatingSprites.push({
                                    entIdInSheet,
                                    sheet: sheetData,

                                    sx, sy, px, py
                                });
                            } else {
                                this.ctxEntities.drawImage(
                                    sheetData.image,
                                    tileSize * sx, tileSize * sy,
                                    tileSize, tileSize,
                                    px, py,
                                    Env.tileScale * Env.tileSize, Env.tileScale * Env.tileSize
                                );
                            }
                        }
                    }
                });
            });


            // Draw Movables
            // NOTE: Have to do this after rendering sprites/items since movables are scaled to reach outside of their
            // tile
            pages.forEach((renderPage) => {

                const page = renderPage.page,
                    offX   = renderPage.offX,
                    offY   = renderPage.offY;

                // Sort movables based off position (top -> bottom; left -> right). We draw bottom-right most movables
                // last, so that they show up above anything else
                const sortedMovables = Object.values(page.movables)
                    .sort((mov1, mov2) => {
                        const pos1 = (mov1.position.tile.y % Env.pageHeight) * Env.pageWidth + (mov1.position.tile.x % Env.pageWidth),
                              pos2 = (mov2.position.tile.y % Env.pageHeight) * Env.pageWidth + (mov2.position.tile.x % Env.pageWidth);

                          return(pos1 - pos2);
                    });

                sortedMovables.forEach((movable) => {
                    const movableSheet = movable.sprite.sheet.image,
                        scale        = Env.tileScale,
                        offsetY      = The.camera.globalOffsetY,
                        offsetX      = The.camera.globalOffsetX,
                        movableOffX  = movable.sprite.sprite_w / 2,
                        movableOffY  = movable.sprite.sprite_h / 2;

                    // Specific state/animation may require a separate sheet
                    if (movable.sprite.state.sheet) {
                        movableSheet = movable.sprite.state.sheet.image;
                    }

                    const globalX = movable.position.global.x,
                        globalY   = movable.position.global.y;

                    const highlightMovable = this.ui.hoveringEntity === movable;
                    if (highlightMovable) {

						const scrapCanvas  = document.createElement('canvas'),
							scrapCtx       = scrapCanvas.getContext('2d');

						scrapCanvas.height = movable.sprite.sprite_w;
						scrapCanvas.width  = movable.sprite.sprite_h;

                        for (let dOffY = -1; dOffY <= 1; ++dOffY) {
                            for (let dOffX = -1; dOffX <= 1; ++dOffX) {
                                scrapCtx.drawImage(
                                    movableSheet,
                                    movable.sprite.state.x, movable.sprite.state.y,
                                    movable.sprite.sprite_w, movable.sprite.sprite_h,
                                    dOffX * this.settings.movableHighlight.borderThickness,
                                    dOffY * this.settings.movableHighlight.borderThickness,
                                    movable.sprite.sprite_w, movable.sprite.sprite_h
                                );
                            }
                        }

                        scrapCtx.globalCompositeOperation = "source-in";
                        scrapCtx.fillStyle = this.settings.movableHighlight.borderColor;
                        scrapCtx.fillRect(0, 0, scrapCanvas.width, scrapCanvas.height);

						const scrapImg  = new Image();
						scrapImg.src = scrapCanvas.toDataURL("image/png");

                        this.ctxEntities.drawImage(
                            scrapImg,
                            0, 0,
                            movable.sprite.sprite_w, movable.sprite.sprite_h,
                            scale * (globalX - offsetX + Env.tileSize / 2) - movableOffX, scale * (globalY + offsetY) - movableOffY,
                            movable.sprite.sprite_w, movable.sprite.sprite_h
                        );

                        this.ctxEntities.filter = this.settings.movableHighlight.filter;

                        this.ctxEntities.drawImage(
                            movableSheet,
                            movable.sprite.state.x, movable.sprite.state.y,
                            movable.sprite.sprite_w, movable.sprite.sprite_h,
                            scale * (globalX - offsetX + Env.tileSize / 2) - movableOffX, scale * (globalY + offsetY) - movableOffY,
                            movable.sprite.sprite_w, movable.sprite.sprite_h
                        );

                        this.ctxEntities.filter = 'none';
                    } else {

                        this.ctxEntities.drawImage(
                            movableSheet,
                            movable.sprite.state.x, movable.sprite.state.y,
                            movable.sprite.sprite_w, movable.sprite.sprite_h,
                            scale * (globalX - offsetX + Env.tileSize / 2) - movableOffX, scale * (globalY + offsetY) - movableOffY,
                            movable.sprite.sprite_w, movable.sprite.sprite_h
                        );
                    }

                    // Draw debug pathfinding/position highlights
                    if (Env.renderer.drawBorders) {
                        if (movable.debugging._serverPosition) {
                            const _x = movable.debugging._serverPosition.tile.x,
                                _y   = movable.debugging._serverPosition.tile.y,
                                _toX = movable.debugging._serverPosition.toTile.x,
                                _toY = movable.debugging._serverPosition.toTile.y;

                            this.ctxEntities.strokeStyle = "gray";
                            this.ctxEntities.strokeRect(
                                scale * (Env.tileSize * _x - offsetX), scale * (Env.tileSize * _y + offsetY),
                                Env.tileSize * scale, Env.tileSize * scale
                            );
                            this.ctxEntities.strokeStyle = "yellow";
                            this.ctxEntities.strokeRect(
                                scale * (Env.tileSize * _toX - offsetX), scale * (Env.tileSize * _toY + offsetY),
                                Env.tileSize * scale, Env.tileSize * scale
                            );
                        }
                    }
                });
            });

            // Draw Ragdolls
            {
                for (let i = 0; i < this.ragdolls.length; ++i) {
                    const ragdoll = this.ragdolls[i],
                        entity = ragdoll.entity,
                        movableSheet = entity.sprite.sheet.image,
                        scale        = Env.tileScale,
                        offsetY      = The.camera.globalOffsetY,
                        offsetX      = The.camera.globalOffsetX,
                        movableOffX  = entity.sprite.sprite_w / 2,
                        movableOffY  = entity.sprite.sprite_h / 2;

                    const globalX = entity.position.global.x,
                        globalY   = entity.position.global.y;

                    this.ctxEntities.filter = this.settings.ragdoll.filter(ragdoll.timeToDie);
                    this.ctxEntities.drawImage(
                        movableSheet,
                        entity.sprite.state.x, entity.sprite.state.y,
                        entity.sprite.sprite_w, entity.sprite.sprite_h,
                        scale * (globalX - offsetX + Env.tileSize / 2) - movableOffX, scale * (globalY + offsetY) - movableOffY,
                        entity.sprite.sprite_w, entity.sprite.sprite_h
                    );
                    this.ctxEntities.filter = 'none';
                }
            }

            // Draw Projectiles
            {
                for (let i = 0; i < this.projectiles.length; ++i) {
                    const projectile = this.projectiles[i],
                        fromPos = { x: projectile.from.x, y: projectile.from.y },
                        toPos = { x: projectile.to.x, y: projectile.to.y },
                        interp = 1.0 - projectile.timeToDie / 100,
                        pos = { x: fromPos.x + (toPos.x - fromPos.x) * interp, y: fromPos.y + (toPos.y - fromPos.y) * interp },
                        pageX = parseInt(pos.x / Env.tileSize, 10) % Env.pageWidth,
                        pageY = parseInt(pos.y / Env.tileSize, 10) % Env.pageHeight,
                        sheetData = projectile.sheet || this.sheetFromGID(projectile.spriteGID),
                        tilesPerRow = sheetData.tilesPerRow,
                        sy          = Math.max(-1, Math.floor((projectile.spriteGID - sheetData.gid.first) / tilesPerRow)),
                        sx          = Math.max(-1, (projectile.spriteGID - sheetData.gid.first) % tilesPerRow),
                        tileSize    = sheetData.tileSize.width,
                        py          = (pos.y + this.camera.globalOffsetY) * Env.tileScale,
                        px          = (pos.x - this.camera.globalOffsetX) * Env.tileScale;

                    if (!projectile.sheet) projectile.sheet = sheetData;
                    if (sy !== -1 && sx !== -1) {
                        this.ctxEntities.drawImage(
                            sheetData.image,
                            tileSize * sx, tileSize * sy,
                            tileSize, tileSize,
                            px, py,
                            Env.tileScale * Env.tileSize, Env.tileScale * Env.tileSize
                        );
                    }
                }
            }


            // Draw floating sprites
            for (let i = 0; i < floatingSprites.length; ++i) {

                const floatingSprite = floatingSprites[i],
                    sheetData        = floatingSprite.sheet,
                    sheet            = sheetData.image,
                    tileSize         = sheetData.tileSize.width,
                    scale            = Env.tileScale,
                    sx               = floatingSprite.sx,
                    sy               = floatingSprite.sy,
                    px               = floatingSprite.px,
                    py               = floatingSprite.py;

                this.ctxEntities.drawImage(
                    sheet,
                    tileSize * sx, tileSize * sy,
                    tileSize, tileSize,
                    px, py,
                    scale * Env.tileSize, scale * Env.tileSize
                );
            }

            if (Env.renderer.drawBorders) {

                pages.forEach((renderPage) => {

                    if (renderPage.page !== this.area.curPage) {
                        const offX = renderPage.offX,
                            offY   = renderPage.offY;

                        this.ctxEntities.strokeStyle = "gray";
                        this.ctxEntities.strokeRect(
                            Env.tileScale * (offX - The.camera.offsetX), Env.tileScale * (offY + The.camera.offsetY),
                            Env.tileSize * Env.tileScale * Env.pageWidth, Env.tileSize * Env.tileScale * Env.pageHeight
                        );
                    }
                });
            }
        };

        // Render Page Static
        // Used to render the background and static sprites of a page. We separate this since it only needs to be called
        // when the camera has moved
        this.renderPageStatic = function(pageBg, page, startX, startY, endX, endY, offX, offY){

            pageBg.canvasCtx.clearRect(0, 0, pageBg.canvasEl.width, pageBg.canvasEl.height);

            // TODO: for the most bizarre reason, settings variables within these functions SetVarsA, SetVarsB
            // and DrawingImage, somehow speeds up the rendering process significantly. Figure out why
            var renderer = this;
            var scale       = null,
                tileSize    = null,
                sheet       = null,
                pageWidth   = null,
                pageHeight  = null,
                tilesPerRow = null,
                sheet       = null;
            (function SetVarsA(){
                scale       = Env.tileScale,
                tileSize    = Env.tileSize,
                pageWidth   = Env.pageWidth,
                pageHeight  = Env.pageHeight;
                //tilesPerRow = renderer.tilesheet.tilesPerRow,
                //sheet       = renderer.tilesheet.image,
            }());
            for(var iy=startY; iy<endY; ++iy) {
                for(var ix=startX; ix<endX; ++ix) {
                    // TODO: abstract ty/tx and sy/sx fetch; use on all renders
                    var tile      = null,
                        spriteObj = null,
                        sprite    = null,
                        ty        = null,
                        tx        = null,
                        sy        = null,
                        sx        = null,
                        py        = null,
                        px        = null,
                        sheet     = null,
                        sheetData = null,
                        tilesPerRow = null;
                    (function SetVarsB(){
                        tile      = page.tiles[iy*pageWidth+ix]-1;

                        if (!isNaN(tile) && tile != -1) {
                            sheetData = renderer.sheetFromGID(tile);
                            sheet     = sheetData.image;
                            tilesPerRow=sheetData.tilesPerRow;
                            tileSize = sheetData.tileSize.width; // TODO: width/height
                            // ty        = null,//Math.max(-1,parseInt(tile/tilesPerRow)),
                            // tx        = null,//Math.max(-1,tile%tilesPerRow),
                            // sy        = null,//Math.max(-1,parseInt(sprite/tilesPerRow)),
                            // sx        = null,//Math.max(-1,sprite%tilesPerRow),
                            // ty = Math.floor(coord / Env.pageWidth),
                            // tx = coord % Env.pageWidth,
                            ty=Math.max(-1,parseInt((tile-sheetData.gid.first)/tilesPerRow));
                            tx=Math.max(-1,(tile-sheetData.gid.first)%tilesPerRow);
                            py        = (iy*Env.tileSize)*scale;
                            px        = (ix*Env.tileSize)*scale;
                            // for (var i=0; i<renderer.tilesheets.length; ++i) {
                            //  var tilesheet = renderer.tilesheets[i];
                            //  if (tile >= tilesheet.gid.first && tile < tilesheet.gid.last) {
                            //      sheetData = tilesheet;
                            //      sheet = sheetData.image;

                            //      tile -= tilesheet.gid.first;
                            //      tilesPerRow = tilesheet.tilesPerRow;
                            //      ty = parseInt(tile/tilesPerRow);
                            //      tx = tile%tilesPerRow;

                            //renderer.ctxBackground.drawImage(sheet, tileSize*tx, tileSize*ty, tileSize, tileSize, px, py, scale*Env.tileSize, scale*Env.tileSize);
                            pageBg.canvasCtx.drawImage(sheet, tileSize*tx, tileSize*ty, tileSize, tileSize, px, py, scale*Env.tileSize, scale*Env.tileSize);
                            // break;
                            //  }
                            // }
                        }

                    }());

                    // TODO: only render tile if it will display on screen (figure this out from page
                    // dimensions/coordinates; not here)
                    // if (py+tileSize<=0 || py>=pageHeight*tileSize) {
                    //  this.Log("Bad spot!");
                    // }

                    // (function Drawing(){
                    //  if (ty!=-1 && tx!=-1)
                    //      renderer.ctxBackground.drawImage(sheet, tileSize*tx, tileSize*ty, tileSize, tileSize, px, py, scale*tileSize, scale*tileSize);
                    //  // Draw sprite ONLY if its static
                    //  if (sy!=-1 && sx!=-1 && sprite && spriteObj.hasOwnProperty('static'))
                    //      renderer.ctxBackground.drawImage(sheet, tileSize*sx, tileSize*sy, tileSize, tileSize, px, py, scale*tileSize, scale*tileSize);
                    // }());
                }
            }


            for (let coord = 0; coord < page.sprites.length; ++coord) {
                let spriteObj=page.sprites[coord];
                if(!spriteObj) continue;

                let sprite=(spriteObj?spriteObj.sprite-1:-1),
                    sheetData = spriteObj.sheet || renderer.sheetFromGID(sprite),
                    sheet = sheetData.image,
                    floating    = sheetData.data.floating,
                    collisions  = sheetData.data.collisions,
                    tilesPerRow=sheetData.tilesPerRow,
                    scale=Env.tileScale,
                    iy = Math.floor(coord / Env.pageWidth),
                    ix = coord % Env.pageWidth,
                    sy=Math.max(-1,parseInt((sprite-sheetData.gid.first)/tilesPerRow)),
                    sx=Math.max(-1,(sprite-sheetData.gid.first)%tilesPerRow),
                    tileSize = sheetData.tileSize.width, // TODO: width/height
                    py=(iy*Env.tileSize)*scale,
                    px=(ix*Env.tileSize)*scale;

                if(!spriteObj.sheet) spriteObj.sheet = sheetData;
                if (sy!=-1 && sx!=-1 && sprite !== -1 && spriteObj.hasOwnProperty('static')) {
                    pageBg.canvasCtx.drawImage(sheet, tileSize*sx, tileSize*sy, tileSize, tileSize, px, py, scale*Env.tileSize, scale*Env.tileSize);
                }
            }
        };

        this.addProjectile = function(fromEntity, toEntity, spriteGID) {

            const offset = { x: 0, y: -8 }; // FIXME: Determine offset based off of the entity sprite (shooting bone)

            const fromPos = {
                x: fromEntity.position.global.x + offset.x,
                y: fromEntity.position.global.y + offset.y
            };

            const toPos = {
                x: toEntity.position.global.x + offset.x,
                y: toEntity.position.global.y + offset.y
            };

            this.projectiles.push({
                timeToDie: 80,
                from: fromPos,
                to: toPos,
                spriteGID: spriteGID
            });
        };

        this.addRagdoll = function(entity) {

            entity.sprite.dirAnimate('die');
            this.ragdolls.push({
                entity: entity,
                timeToDie: this.settings.ragdoll.life
            });
        };
    };


    return Renderer;

});
