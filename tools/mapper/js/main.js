
// TODO
//  - Cleanup
//
//  - Indicator: saving, saved, loaded map, new map, editing a map that isn't new'd, map updated/needs saving
//  - Improved drawing
//      - Minimap
//      - WebGL texture mips & auto smoothing on canvas
//      - Avatar nameplate (affected by scroll/zoom)
//
//  - Special layers: zoning, interactable? evt (town area, event, etc.)
//      - Spawns: separate tilesheet w/ all avatars  (NOTE: these may be augmented later to include camps / prefabs, but also allow particular spawns for areas that need to be hand built)
//          - Tooltip avatar name in controls panel
//      - Zoning, Interactions
//          - Modify properties directly on map (right click)
//           Drag to resize
//           Right click
//           Hover over for details
//           display short title over box (similar to avatar name on map)
//           Better icon (scalable) for interaction/zone
//      - Prefabs, area events, town area / region
// - Cursor tool: select/move/delete spawns/spriteGroups; show properties for modifying
//      - Move spritegroup: 
//          - replace entities behind it (after we deselect)
//              - save destructed entities in old layer: obj { loc: [ {layer: 'ground', sprite}, {layer: 'sprites', sprite} ] }
//                  This way we can continuously move sprites around but retail the old sprites below. Will need a
//                  "clean/optimize" method later for this
//      - Shift/pull spritegroup/avatar: clone
//      - Right click: popup of properties
//      - Shift+mouse to select or move sprites
//      - Selection:
//          - Delete
//          - Shift+click now moves entire selection (including everything selected)
//          - Move but still retain selection
//          - Show selection in properties
//              - Checkbox of layers selected (so you can deselect certain layers for move/erase)
//          - Cursor tool: blur everything outside of the selection area
//              - Spawns: everything is blurred but the spawns
//              - Using cursor tool only applies to the selection area (change mouse cursor outside of selection?)
// - Keybinding rules: list of keybinding rules and results (eg. LEFT_MOUSE_DOWN + SHIFT_DOWN ==> SPRITEGROUP_SELECT)
//
//
//
//
//  - Selection region of tileset
//  - Dynamically resize map boundaries (including shrinking)
//  - Updating sheets -> auto updates map (tile gid, sprite layer, etc.)
//  - Auto reload map on changes (sheet, etc.)
//  - List of operations, allow ctrl+z to undo
//      - Ops: add spritegroup, avatar
//      - Remove sprites: include avatar
//  - Add entity/avatar: shift+drag from spritesheet to map, when you let go of shift then clear placement tool (same with shift/dragging existing entity to clone)
//  - Multiple levels per layer
//      eg. flower (ground) under the edge sprite of a rock (also ground)
//      eg. floating part of rock (floating) behind the floating part of tree (also floating)
//      -- Can add optimize/clean routine to remove any sprites that are hidden
//
//      layer: [
//          { coord 198, sprite, tiled: true }
//          { coord 198, sprite, tiled: true }
//      ]
//
//      Ctrl+Right-click tile to show popup of how ordering was determined. This will save floating level on sprite w/
//      global floating level. Moving up may break other orderings, so may need to show conflicts on change or when
//      loading a map)
//          Moss (floating):  level 0
//          Rock (floating):  level 1
//          Tree (floating):  level 2
//
//      NOTE: This doesn't support instance specific orderings, the orderings are global, so you cannot have one area
//      where tree A is covering tree B and another instance where tree B is covering tree A
//
//      Sometimes when we move a spritegroup we may want to preserve the current sprite (but cover) and sometimes we may
//      want to remove the previous spritegroup. Can hold down Shift to add without deleting the other spritegroup, so
//      when we're moving it keeps both but highlights the previous spritegroup to indicate it'll be deleted, and
//      holding down shift shows you'll add this one but need to change orderings
//
//
//     *1) Move/Add sprite: allow conflict, but show when an entity will be removed
//      2) Keep track of tiled/untiled
//      3) Shift+click to add without deleting previous entity
//      4) Right click tile, if tiled then bring popup of ordering (show all same order)
//      5) Drag/drop orders to re-order; preserve in spritesheet
//      5) Save spritesheet on save map
//          NOTE: This could cause a conflict if we save over a spritesheet that has changed externally, need to
//          auto-reload spritesheet on changed externally
//       6) IMPLEMENT IN GAME
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
    window.requestAnimationFrame((timestamp) => {
        lastStep = timestamp;
        step(timestamp);
    });


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
