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
            const localY = The.player.position.global.y % Env.pageRealHeight,
                localX   = The.player.position.global.x % Env.pageRealWidth;
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
