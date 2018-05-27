//
// TODO
//  - Resource Manager
//      - Read resources and find all resources
//      - Write changes
//      - Interact w/ bash scripts & external tools
//      - Watch for changes in file
//  - Interaction module
//      - Hovering over region in preview window; project to world coordinates (zoomed in, scrolled)
//  - Preview/Renderer
//      - Render images (zoomed in, scrolling)
//      - Highlighting, grid
//  - Window manager
//      - Create different windows
//      - Automatically allow resizing/moving/etc. for certain windows
//
//  - Modules
//      - Spritesheet Editor
//      - Tilesheet Editor
//          - Show settings/data
//              - Name, image
//              - Tilesize? w/h  (how does this work in game?)
//              - List: Objects, Extractions
//              - Buttons: Collision, shoot through, floating, extract, object
//                  - Object: on click tile add a new object, on hover tile highlight object
//                  - Extract: on click button add new or select first extraction group
//              - Meta data: comments/etc.
//              - Change settings colours when there's unsaved changes (diff changes from last saved changes, so if we
//              undo our last change it doesn't show as needing to save)
//
//          - Add/Remove collision/shoot-through/floating/extract
//          - Save changes
//          - Extract sprites
//              - Autogenerated type is listed in sheets.json; has a list of dependencies, no source image, and an
//              output image
//              - Resourcebuilder:
//                  1) If an item changes which has extractions, add extraction to to-generate list (w/ the dependency included)
//                  2) After building; go through to-generate list and build those next
//                  3) If to-generate item doesn't exist, create it
//                  4) Build image from generate list
//                  5) Compare autogenerated item (before/after) and store a translation from old sprite -> new sprite
//                  6) Go through map sources and translate necessary sprites
//              
//          - Add new tilesheet:  Add New,  show blank canvas, drag/drop to add tilesheet
//      - Data editor (buffs, npcs, etc.)
//      - Map editor
//      - Resource viewer
//          - Searching, filtering
//          - Save changes to opened resource

const Modules = {};

let currentModule = null;

$(document).ready(() => {

    ResourceMgr.initialize().then(() => {
        ResourceMgr.buildElements();
    });

    let workingWindowEl = $('#workingWindow');
    Modules.tilesheet = new ModTilesheet( $('#ModTilesheet') );

    ResourceMgr.onSelectResource = (resDetails) => {

        const resType = resDetails.resType,
            res = resDetails.data;

        let module = null;
        if (resType === 'tilesheet') {
            module = Modules[resType];
        }

        // Need to unload the currently loading module?
        if (currentModule) {
            currentModule.unload();
        }

        if (currentModule !== module) {
            if (currentModule) {
                currentModule.uninitialize();
            }

            module.initialize();
        }

        currentModule = module;
        module.load(res);

        module.onSave = () => {
            ResourceMgr.saveResource(resDetails.resParent);
        };
    };

    let step = (delta) => {

        if (currentModule) {
            if (currentModule.step) currentModule.step(delta);
        }

        window.requestAnimationFrame(step);
    };

    step(1);
});
