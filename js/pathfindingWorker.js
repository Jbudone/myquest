define(['pathfinding.base'], (PathfindingBase) => {

// TODO
//  - Run as a system w/ priority list?? May not be necessary depending on how many paths are coming in at once, we'll
//  need to check (automated testing sending tons of paths, simulating spam clicking and chasing from lots of AI)
// - Structure with path refinement options

    const Env = {
        pageHeight: 14,
        pageWidth: 30,
        tileSize: 16
    };

    global.Env = Env;


    let area = {};
    let keysCreated = false;
    const setupKeys = (keys) => {

        Object.keys(keys).forEach((key) => {
            global[key] = keys[key];
        });
        keysCreated = true;
    };

    const handleMessage = (data) => {


        let messageType = data.type;
        if (!messageType) {
            worker.postMessage({
                result: RESULT_ERROR,
                error: "Unknown messageType"
            });

            return;
        }


        if (messageType === SETUP_AREA) {

            area.areaWidth = data.area.width;
            area.areaHeight = data.area.height;
            area.pagesPerRow = data.area.pagesPerRow;
            area.pages = {};
        } else if (messageType === ADD_PAGE) {

            const pageI = data.page.i;
            area.pages[pageI] = data.page;
        } else if (messageType === REMOVE_PAGE) {

            const pageI = data.pageI;
            delete area.pages[pageI];
        } else if (messageType === HANDLE_PATH) {

            const path = data.path;

            const success = handlePath(path);
            if (success) {

                let retPath;
                if (path.ALREADY_THERE) {
                    retPath = {
                        start: path.startPt,
                        end: path.startPt,
                        debugCheckedNodes: [],
                        ALREADY_THERE: true
                    };
                } else {
                    retPath = {

                        walks: path.ptPath.walks,
                        start: path.startPt,
                        end: path.ptPath.walks[path.ptPath.walks.length - 1].destination,
                        debugCheckedNodes: path.debugCheckedNodes
                    };
                }

                worker.postMessage({
                    result: RESULT_PATH,
                    success: true,

                    pathID: path.pathID,
                    movableID: path.movableID,
                    path: retPath,
                    time: path.time,

                    __cbId: data.__cbId
                });
            } else {
                worker.postMessage({
                    result: RESULT_PATH,
                    success: false,
                    movableID: path.movableID,
                    pathID: path.pathID,
                    __cbId: data.__cbId
                });
            }
        }
    };

    const handlePath = (path) => {

        // FIXME: Check path state, use the corresponding operations/options to refine as desired
        // states:
        //  - from/to (tiles)   need to fill path (tiled)
        //  - from/to (points)  need to fill path (points)
        //  - from/to (points) and tiled path as hint,  need to refine path to points

        let time = -Date.now();
        const foundPath = PathfindingBase.findPath(area, path.startPt, path.endPt);
        time += Date.now();

        if (foundPath) {
            path.time = time;
            path.debugCheckedNodes = foundPath.debugCheckedNodes;
            if (!foundPath.path) {
                path.ALREADY_THERE = true;
            } else {
                path.ALREADY_THERE = false;
                path.ptPath = {
                    start: foundPath.path.start,
                    walks: foundPath.path.walks
                };
            }
        } else {
            return false;
        }

        return true;
    };



    const PathfindingWorker = function(webworker) {

        webworker.onMessage = function(e) {

            let data = e.data;
            if (!keysCreated) {
                setupKeys(data.keys);
            } else {
                handleMessage(data);
            }
        };
    };

    return PathfindingWorker;
});
