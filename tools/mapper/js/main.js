
// TODO
//  - Cleanup
//
//  - Indicator: saving, saved, loaded map, new map, editing a map that isn't new'd, map updated/needs saving
//  - Special layers: zoning, interactable? evt (town area, event, etc.)
//      - Spawns: separate tilesheet w/ all avatars  (NOTE: these may be augmented later to include camps / prefabs, but also allow particular spawns for areas that need to be hand built)
//          - Tooltip avatar name in controls panel
//      - Zoning, Interactions
//          - Modify properties directly on map (right click)
//           Drag to resize
//           Move interaction object on the map
//           Right click
//           Hover over for details
//           display short title over box (similar to avatar name on map)
//           Better icon (scalable) for interaction/zone
//      - Prefabs, area events, town area / region
// - Cursor tool: select/move/delete spawns/spriteGroups; show properties for modifying
//      - Click: unselect previous, select new
//      - Move: unselect afterwards
//      - Click spritegroup
//      - Mouse drag: rect select
//      - Right click: popup of properties
//      - Selection:
//          - Move (shift)
//          - Delete
//          - Show selection in properties
//              - Checkbox of layers selected (so you can deselect certain layers for move/erase)
//          - Cursor tool: blur everything outside of the selection area
//              - Spawns: everything is blurred but the spawns
//              - Rect: 
//
//
//
//
//  - Selection region of tileset
//  - Dynamically resize map boundaries (including shrinking)
//  - Updating sheets -> auto updates map (tile gid, sprite layer, etc.)
//  - Auto reload map on changes (sheet, etc.)
//  - Shared libs between all tools: resourcemgr, interactionmgr, consolemgr (toolbet/mapper, game?)
//  - Optimize drawing: draw to a background full-view map, then draw a region of that image to the actual user view (zoomed in, camera translation, cursor tiles, highlights, etc.)
//  - Optimize memory: can we do better than storing sporadic array of chunky sprites for each layer?
//      - Base shouldn't be sporadic since it'll be filled
//      - We can map sprite id's -> tileset id's, since we'll only need to modify those id's when the tileset is modified
//
//  - Tilesets: list of tilesets, hover over the list to expand it vertically; hovers *over* canvas like a popup
//  - Optimize checking through tileset tiles for transparency (ground) tiles -- cache for mapper and tileset hash?  webworkers checking in the background?
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
