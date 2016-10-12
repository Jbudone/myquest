define(() => {
    const Game = {
        _init() { },

        randomAreaPoint(attemptCount) {
            if (attemptCount > 100) return null;
            const randY  = Math.floor(Math.random() * 13 + 1),
                randX    = Math.floor(Math.random() * 29 + 1),
                randIndex = randY * 30 + randX;
            if (The.area.curPage.collidables[randY] & (1 << randIndex) !== 0) {
                return randomAreaPoint(attemptCount + 1);
            }
            this.Log(`Random Area Point: {y: ${randY}, x: ${randX}}   (${attemptCount} attempts)`);
            return { y: randY, x: randX, index: randIndex };
        },

        clickPoint(point) {

            const evt   = document.createEvent('MouseEvents'),
                bounds  = document.getElementById('entities').getBoundingClientRect(),
                clientY = (point.y + 1) * Env.tileSize * Env.tileScale + bounds.top,
                clientX = (point.x) * Env.tileSize * Env.tileScale + bounds.left;

            evt.initMouseEvent('mousedown', true, true, window, 0, 0, 0, clientX, clientY);
            document.getElementById('entities').dispatchEvent(evt);
        },

        oink() {
            this.Log("Oink!");
        }

    };

    return Game;
});

