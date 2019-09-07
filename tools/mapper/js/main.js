
// TODO
//  - Camera zooming
//  - Cleanup
//
//  - Indicator: saving, saved, loaded map, new map, editing a map that isn't new'd, map updated/needs saving
//  - Layers (base/sprites/etc.)
//  - Dynamically resize map boundaries
//  - Updating sheets -> auto updates map
//  - Auto reload map on changes (sheet, etc.)
//  - Shared libs between all tools: resourcemgr (toolbet/mapper, game?)
//  - Optimize drawing: draw to a background full-view map, then draw a region of that image to the actual user view (zoomed in, camera translation, cursor tiles, highlights, etc.)
//  - Layered sprite: lowest --> base sprite, 
//
//  - Tilesets: list of tilesets, hover over the list to expand it vertically
//  - Control panel: tabs on top - files, tilesets, map properties, minimap
//  - Map editor: 100% window size, on resize of window -> resize editor
//  - Mouse move outside of map boundaries, snap to nearest tile

$(document).ready(() => {

    ResourceMgr.initialize().then(() => {
        ResourceMgr.buildElements();
    });

    MapEditor.initialize();

    const step = (timestamp) => {
        const delta = timestamp - lastStep;
        lastStep = timestamp;

        ResourceMgr.step(delta);
        MapEditor.step(delta);

        window.requestAnimationFrame(step);
    };

    lastStep = Date.now();
    window.requestAnimationFrame(step);
});
