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
//              - List: Objects, Extractions
//              - Change settings colours when there's unsaved changes (diff changes from last saved changes, so if we
//                  undo our last change it doesn't show as needing to save)
//
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
//      - Data editor (buffs, npcs, etc.)
//      - Map editor
//      - Resource viewer
//          - Searching, filtering

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
        currentModule.onSave = (id) => {
            ResourceMgr.saveResource(resDetails.resParent, id).then(() => {

                // Rebuild resource after savign
                // NOTE: The reason we want to reload after save as opposed to before next save is because we may update
                // the map, and we need to set oldSprites as sprites (as opposed to old-old sprites)
                ResourceMgr.rebuildResource(resDetails.resParentKey, id).then((data) => {

                    console.log("Rebuild resource");
                    console.log(data);

                    ResourceMgr.reload().then(() => {
                        ResourceMgr.buildElements();

                        let newRes = ResourceMgr.allResources.find((_resDetails) => {
                            if (_resDetails.resType === resType && _resDetails.resParentKey === resDetails.resParentKey) {
                                if (_resDetails.data.id === res.id) {
                                    return true;
                                }
                            }

                            return false;
                        });

                        ResourceMgr.onSelectResource(newRes);
                    });
                }).catch(() => {
                    console.error("Could not rebuild resource");
                });
            }).catch(() => {
                console.error("Could not save resource");
            });
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
            },
            gid: {
                first: 0,
                last: 0
            }
        };

        ResourceMgr.data['sheets'].data.tilesheets.list.push(res);

        currentModule.createNew(res);

        currentModule.onSave = (id) => {
            return ResourceMgr.saveResource(ResourceMgr.data['sheets'], id);
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
