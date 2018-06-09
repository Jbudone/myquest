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
//                  undo our last change it doesn't show as needing to save)
//
//          - Add/Remove collision/shoot-through/floating/extract
//          - Save changes
//          - Extract sprites
//                  - If auto-generated asset now has an empty list, remove the output image, throw error if maps
//                      depend on image, and remove from sheets
//                  - How to handle updating postprocessing for dependency?  (eg. postprocessing to brighten image)
//                      Probably best to have post-processing per-extraction group for dependency. Just copies sheet's
//                      postprocessing initially, and can be edited
//
//                  - Trigger ResourceBuilder on save? Or fuckingtaskrunner to auto run it?
//                  - Update maps
//                  - Update other things???  (eg. icons, items, etc.) -- may be better to disallow this for now,
//                  - Update objects on translating sprite groups
//                  - Disable extraction from generated sheet
//                  - Check works in map editor + updates; check works in game
//              
//          - Move sprite group, doesn't show that save is needed
//          - Save changes: reload everything?
//          - Indicate save was successful
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

    const setActiveModule = (moduleType) => {

        let module = null;
        if (moduleType === 'tilesheet') {
            module = Modules[moduleType];
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
    };

    ResourceMgr.onSelectResource = (resDetails) => {

        const resType = resDetails.resType,
            res = resDetails.data;

        setActiveModule(resType);
        currentModule.load(res);
        currentModule.onSave = () => {
            ResourceMgr.saveResource(resDetails.resParent);
        };
    };

    $('#resourceMgrAddTilesheet').click(() => {

        setActiveModule('tilesheet');

        const res = {
            id: "newTilesheet",
            image: null,
            output: null,
            columns: 0,
            tilesize: 16,
            rows: 0,
            sheet_offset: { x: 0, y: 0 },
            data: {},
            options: {
                cached: false,
                encrypted: false,
                packed: false,
                preprocess: false
            }
        };

        ResourceMgr.data['sheets'].data.tilesheets.list.push(res);

        currentModule.createNew(res);

        currentModule.onSave = () => {
            ResourceMgr.saveResource(ResourceMgr.data['sheets']);
        };
        
        return false;
    });

    let step = (delta) => {

        if (currentModule) {
            if (currentModule.step) currentModule.step(delta);
        }

        window.requestAnimationFrame(step);
    };

    step(1);
});
