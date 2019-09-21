
// TODO
//  - Camera zooming
//      - Fix aspect ratio (seems smooshed right now, want to retain 16x16)
//      - Zooming: center on cursor (zoom AND translate)
//
//      - Need to affect draw position and size
//      - Translate map position -> camera position (top left -> bottom right)
//
//      - camera.x == -8, camera.w == 16 --> display half of tile 1
//      - camera.x == 0,  camera.w == 16 --> only tile 1 visible
//      - camera.x == 16, camera.w == 16 --> only tile 2 visible
//      - camera.x == 64, camera.w == 64 --> only tiles 4..8 visible
//
//      - cameraPos = (mapPos - cameraOffset) * (canvasSize / camera.w)
//
//
//      camera.w == 64; (canvasWidth / 4) * x == 16; x is scale ==> x = camera.w / canvasWidth
//  - Cleanup
//
//  - Indicator: saving, saved, loaded map, new map, editing a map that isn't new'd, map updated/needs saving
//  - Layers (base/sprites/etc.)
//  - Dynamically resize map boundaries (including shrinking)
//  - Updating sheets -> auto updates map
//  - Auto reload map on changes (sheet, etc.)
//  - Shared libs between all tools: resourcemgr, interactionmgr, consolemgr (toolbet/mapper, game?)
//  - Optimize drawing: draw to a background full-view map, then draw a region of that image to the actual user view (zoomed in, camera translation, cursor tiles, highlights, etc.)
//  - Layered sprite: lowest --> base sprite, 
//
//  - Tilesets: list of tilesets, hover over the list to expand it vertically; hovers *over* canvas like a popup
//  - Control panel: tabs on top - files, tilesets, map properties, minimap
//  - Minimap: rendering is optimized by rendering to pages, then just render pages to minimap
//  - Map editor: 100% window size, on resize of window -> resize editor

$(document).ready(() => {

    ConsoleMgr.initialize();

    ResourceMgr.initialize().then(() => {
        ResourceMgr.buildElements();
    });

    MapEditor.initialize();

    const step = (timestamp) => {
        const delta = timestamp - lastStep;
        lastStep = timestamp;

        ConsoleMgr.step(delta);
        ResourceMgr.step(delta);
        MapEditor.step(delta);

        window.requestAnimationFrame(step);
    };

    lastStep = Date.now();
    window.requestAnimationFrame(step);


    $('.controlsTab').click((el) => {

        let elTab = $(el.currentTarget);
        let curActive = $('.controlsTab.active');
        if (curActive === elTab) return;

        curActive.removeClass('active');
        $(`#${curActive.attr('data')}`).removeClass('active');

        elTab.addClass('active');
        $(`#${elTab.attr('data')}`).addClass('active');
    });
});
