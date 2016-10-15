
// Renderer
define(['loggable'], (Loggable) => {


    const Renderer = function() {

        extendClass(this).with(Loggable);
        this.setLogGroup('Renderer');
        this.setLogPrefix('Renderer');

        this.canvasEntities   = null;
        this.canvasBackground = null;
        this.ctxEntities      = null;
        this.ctxBackground    = null;

        this.camera           = null;
        this.ui               = null;
        this.area             = null;
        this.tilesheet        = null;
        this.tilesheets       = null;

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
            }
        };

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
        };

        this.initialize = (options) => {

            this.settings = _.defaults(this.settings, options || {});

            this.ctxEntities   = this.canvasEntities.getContext('2d');
            this.ctxBackground = this.canvasBackground.getContext('2d');

            const canvasWidth = (Env.pageWidth + 2 * Env.pageBorder) * Env.tileSize * Env.tileScale,
                canvasHeight  = (Env.pageHeight + 2 * Env.pageBorder) * Env.tileSize * Env.tileScale;

            this.canvasEntities.width    = canvasWidth;
            this.canvasEntities.height   = canvasHeight;
            this.canvasBackground.width  = canvasWidth;
            this.canvasBackground.height = canvasHeight;

            this.ctxEntities.mozImageSmoothingEnabled      = this.settings.smoothing;
            this.ctxEntities.webkitImageSmoothingEnabled   = this.settings.smoothing;
            this.ctxEntities.ImageSmoothingEnabled         = this.settings.smoothing;
            this.ctxEntities.strokeStyle                   = this.settings.strokeStyle;
            this.ctxEntities.lineWidth                     = this.settings.lineWidth;
            this.ctxBackground.mozImageSmoothingEnabled    = this.settings.smoothing;
            this.ctxBackground.webkitImageSmoothingEnabled = this.settings.smoothing;
            this.ctxBackground.ImageSmoothingEnabled       = this.settings.smoothing;
            this.ctxBackground.strokeStyle                 = this.settings.strokeStyle;
            this.ctxBackground.lineWidth                   = this.settings.lineWidth;
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

        this.render = () => {

            // Redraw the entities every frame
            this.ctxEntities.clearRect(0, 0, this.canvasEntities.width, this.canvasEntities.height);

            let sheetData = this.tilesheets[0]; // TODO: fix this: necessary in some places

            // Only redraw the background if the camera has moved
            if (this.camera.updated) {
                this.ctxBackground.clearRect(0, 0, this.canvasBackground.width, this.canvasBackground.height);

                // Draw Current Page
                //  startY:
                //      require  pt + size < page
                //      starts @ max(floor(ipt) - 1, 0)
                this.renderPageStatic(this.area.curPage, 0, 0, Env.pageWidth, Env.pageHeight, 0, 0);


                // Draw border
                //  Camera width/height and offset (offset by -border)
                //  Draw ALL neighbours using this algorithm
                //  If no neighbour to left/top then leave offset as 0?
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

                    const offX = neighbourInfo.offsetX,
                        offY   = neighbourInfo.offsetY;

                    this.renderPageStatic(neighbour, 0, 0, Env.pageWidth, Env.pageHeight, offX, offY);
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
                            _y   = Math.floor(tileID / The.area.areaWidth);
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
                    drawLists = [page.sprites, page.items];

                drawLists.forEach((drawList) => {

                    // Draw entity in this list
                    for (const coord in drawList) {
                        const entityObj = drawList[coord],
                            entity      = (entityObj ? entityObj.sprite - 1 : -1),
                            sheetData   = entityObj.sheet || this.sheetFromGID(entity),
                            tilesPerRow = sheetData.tilesPerRow,
                            floating    = sheetData.data.floating,
                            iy          = Math.floor(coord / Env.pageWidth),
                            ix          = coord % Env.pageWidth,
                            sy          = Math.max(-1, Math.floor((entity - sheetData.gid.first) / tilesPerRow)),
                            sx          = Math.max(-1, (entity - sheetData.gid.first) % tilesPerRow),
                            tileSize    = sheetData.tileSize.width,
                            py          = (iy * Env.tileSize + this.camera.offsetY + offY) * Env.tileScale,
                            px          = (ix * Env.tileSize - this.camera.offsetX + offX) * Env.tileScale;

                        if (!entityObj.sheet) entityObj.sheet = sheetData;
                        if (sy !== -1 && sx !== -1 && entity && !entityObj.hasOwnProperty('static')) {
                            if (floating !== undefined &&
                                floating.indexOf(entity) >= 0) {

                                floatingSprites.push({
                                    entity,
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

                for (const id in page.movables) {
                    const movable    = page.movables[id],
                        movableSheet = movable.sprite.sheet.image,
                        scale        = Env.tileScale,
                        offsetY      = The.camera.globalOffsetY,
                        offsetX      = The.camera.globalOffsetX,
                        movableOffX  = movable.sprite.tileSize / 4, // TODO: fix sprite centering with sheet offset
                        movableOffY  = movable.sprite.tileSize / 2;

                    // Specific state/animation may require a separate sheet
                    if (movable.sprite.state.sheet) {
                        movableSheet = movable.sprite.state.sheet.image;
                    }

                    const globalX = movable.position.global.x,
                        globalY   = movable.position.global.y;

                    this.ctxEntities.drawImage(
                        movableSheet,
                        movable.sprite.state.x, movable.sprite.state.y,
                        movable.sprite.tileSize, movable.sprite.tileSize,
                        scale * (globalX - offsetX - movableOffX), scale * (globalY + offsetY - movableOffY),
                        scale * movable.sprite.tileSize, scale * movable.sprite.tileSize
                    );

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
                }
            });


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
        this.renderPageStatic = function(page, startX, startY, endX, endY, offX, offY){

            // TODO: for the most bizarre reason, settings variables within these functions SetVarsA, SetVarsB
            // and DrawingImage, somehow speeds up the rendering process significantly. Figure out why
            var renderer = this;
            var scale       = null,
                tileSize    = null,
                sheet       = null,
                pageWidth   = null,
                pageHeight  = null,
                tilesPerRow = null,
                sheet       = null,
                offsetY     = null,
                offsetX     = null;
            (function SetVarsA(){
                scale       = Env.tileScale,
                tileSize    = Env.tileSize,
                pageWidth   = Env.pageWidth,
                pageHeight  = Env.pageHeight,
                //tilesPerRow = renderer.tilesheet.tilesPerRow,
                //sheet       = renderer.tilesheet.image,
                offsetY     = The.camera.offsetY+offY,
                offsetX     = The.camera.offsetX-offX;
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
                            py        = (iy*Env.tileSize+offsetY)*scale;
                            px        = (ix*Env.tileSize-offsetX)*scale;
                            // for (var i=0; i<renderer.tilesheets.length; ++i) {
                            //  var tilesheet = renderer.tilesheets[i];
                            //  if (tile >= tilesheet.gid.first && tile < tilesheet.gid.last) {
                            //      sheetData = tilesheet;
                            //      sheet = sheetData.image;

                            //      tile -= tilesheet.gid.first;
                            //      tilesPerRow = tilesheet.tilesPerRow;
                            //      ty = parseInt(tile/tilesPerRow);
                            //      tx = tile%tilesPerRow;

                            renderer.ctxBackground.drawImage(sheet, tileSize*tx, tileSize*ty, tileSize, tileSize, px, py, scale*Env.tileSize, scale*Env.tileSize);
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


            for (var coord in page.sprites) {
                var spriteObj=page.sprites[coord],
                    sprite=(spriteObj?spriteObj.sprite-1:-1),
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
                    py=(iy*Env.tileSize+this.camera.offsetY+offY)*scale,
                    px=(ix*Env.tileSize-this.camera.offsetX+offX)*scale;

                if(!spriteObj.sheet) spriteObj.sheet = sheetData;
                if (sy!=-1 && sx!=-1 && sprite && spriteObj.hasOwnProperty('static')) {
                    this.ctxBackground.drawImage(sheet, tileSize*sx, tileSize*sy, tileSize, tileSize, px, py, scale*Env.tileSize, scale*Env.tileSize);
                }
            }
        };
    };


    return Renderer;

});
