define(['eventful'], (Eventful) => {


    // Camera
    //
    // Camera is responsible for various rendering techniques; including transitioning (zoning) between pages,
    // rumbling/shake effects, viewing plateaus?
    const Camera = function() {

        extendClass(this).with(Eventful);

        this.lastTime = now();
        this.offsetX  = 0;
        this.offsetY  = 0;
        this.globalOffsetX = 0;
        this.globalOffsetY = 0;

        this.isZoning    = false;
        this.updated     = false;
        this.moveSpeed   = 75;
        this.lastUpdated = now();

        // FIXME: fix the camera so that it doesn't need this
        this.centerCamera = () => {
            let localY = The.player.position.global.y % Env.pageRealHeight,
                localX = The.player.position.global.x % Env.pageRealWidth;

            // NOTE: We may have remotely zoned into another page, but locally we're still catching up (eg. we've zoned
            // to another page from the server, but our local player is still walking to that page, so our curPage is
            // not what we think our curPage is). Determine our expected curPage from the player's position, and if its
            // different from the actual curPage then offset to our expected curPage
            const pageX = Math.floor(The.player.position.global.x / Env.pageRealWidth),
                pageY   = Math.floor(The.player.position.global.y / Env.pageRealHeight),
                pageId  = The.area.pageIndex(pageX, pageY);

            if (pageId !== The.area.curPage.index) {

                // NOTE: We may not have received the pages where we're zoning to yet. Be patient
                 if (!The.area.pages[pageId]) { return; }
 
                 localX += (The.area.pages[pageId].x - The.area.curPage.x) * Env.tileSize;
                 localY += (The.area.pages[pageId].y - The.area.curPage.y) * Env.tileSize;
            }

            this.offsetY = -localY + Env.pageHeight * Env.tileSize / 2;
            this.offsetX = localX - Env.pageWidth * Env.tileSize / 2;
            this.globalOffsetX = The.area.curPage.x * Env.tileSize + this.offsetX;
            this.globalOffsetY = -1 * The.area.curPage.y * Env.tileSize + this.offsetY;
        };

        this.initialize = () => {
            this.listenTo(The.area, EVT_ZONE, (area, direction) => {

                     if (direction === 'n') this.offsetY = -(Env.pageHeight - Env.pageBorder) * Env.tileSize;
                else if (direction === 'w') this.offsetX = (Env.pageWidth - Env.pageBorder)   * Env.tileSize;
                else if (direction === 'e') this.offsetX = -(Env.pageWidth - Env.pageBorder)  * Env.tileSize;
                else if (direction === 's') this.offsetY = (Env.pageHeight - Env.pageBorder)  * Env.tileSize;
            });
        };

        this.canSeeTile = (tile) => {

            const tileLeft = tile.x * Env.tileSize,
                tileRight  = tileLeft + Env.tileSize,
                tileTop    = tile.y * Env.tileSize,
                tileBottom = tileTop + Env.tileSize;

            const leftView = this.globalOffsetX,
                rightView  = leftView + (Env.pageWidth + 2 * Env.pageBorder) * Env.tileSize,
                topView    = -this.globalOffsetY,
                bottomView = topView + (Env.pageHeight + 2 * Env.pageBorder) * Env.tileSize;

            const xInRange = (tileLeft > leftView && tileLeft < rightView) ||
                             (tileRight > leftView && tileRight < rightView);
            const yInRange = (tileTop > topView && tileTop < bottomView) ||
                             (tileBottom > topView && tileBottom < bottomView);

            return xInRange && yInRange;
        };

        this.step = (time) => {
            this.handlePendingEvents();

            if (time - this.lastUpdated > 2500) {
                this.updated = true; // Use this as a just in case for background redraws
                this.lastUpdated = time;
            }

            const offsetY = this.offsetY,
                offsetX   = this.offsetX;
            this.centerCamera();
            if (this.offsetY !== offsetY || this.offsetX !== offsetX) {
                this.updated = true;
            }
        };
    };

    return Camera;
});
