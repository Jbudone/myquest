
// TODO
//  - Test in game
//      - Map is 16x16 tilesize, but movement is 4x4?
//          - Position should be 4x4 for everything (what if we have dynamic tiles, placeables, digging, etc.)
//          - Rendering: FOR NOW we can render 4x4  (3D in near future)
//              - Map load (in game) turn tilesheets into 4x4, and split each sprite from 1x1 into 4x4
//  - Save ==> Export?
//  - Cleanup
//
//  - Indicator: saving, saved, loaded map, new map, editing a map that isn't new'd
//  - Layers (base/sprites/etc.)
//  - Can't place sprites beyond map boundaries
//  - Dynamically resize map boundaries
//  - Updating sheets -> auto updates map
//  - Auto reload map on changes (sheet, etc.)
//  - Shared libs between all tools: resourcemgr (toolbet/mapper, game?)
//  - Optimize drawing: draw to a background full-view map, then draw a region of that image to the actual user view (zoomed in, camera translation, cursor tiles, highlights, etc.)
//  - Layered sprite: lowest --> base sprite, 

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
