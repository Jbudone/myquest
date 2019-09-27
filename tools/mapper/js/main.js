
// TODO
//  - Cleanup
//
//  - Indicator: saving, saved, loaded map, new map, editing a map that isn't new'd, map updated/needs saving
//
//  - Layer as array of sprites, or array of tiles?
//      - Array of tiles less efficient for drawing which is fine when we incorporate pre-drawn pages, blitting, etc.
//  - Layers (base/sprites/etc.)
//      - Future: we may want to only include spriteGroups as opposed to sprites (for efficiency), although we could
//      specify sprites individually in special cases for layering/changes
//      - Multiple layers of sprites:
//          - We want base layer if there's no transparency for the sprite; otherwise sprite
//          - Sprite: flower -> leaf -> tree/shadow
//              - Flower/leaf swap each other unless you manually specify to not swap
//              - Tree/shadow are floating and automatically go above
//          - LAYERS:
//              - Base sprite (only one)
//              - Sprite ground (can stack as option in future? Otherwise keep as single for now)
//              - Sprite floating (same as ground)
//
//
//  - Dynamically resize map boundaries (including shrinking)
//  - Updating sheets -> auto updates map
//  - Auto reload map on changes (sheet, etc.)
//  - Shared libs between all tools: resourcemgr, interactionmgr, consolemgr (toolbet/mapper, game?)
//  - Optimize drawing: draw to a background full-view map, then draw a region of that image to the actual user view (zoomed in, camera translation, cursor tiles, highlights, etc.)
//  - Special layers: spawns, zoning, interactable? evt (town area, event, etc.)
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
