const chokidar = require('chokidar'),
    fs         = require('fs'),
    glob       = require('glob'),
    fsPath     = require('path'),
    exec       = require('child_process').exec,
    execSync   = require('child_process').execSync,
    chalk      = require('chalk');

const Settings = {
    cacheFile: 'fuckingtaskrunner.json'
};

//
// -- What if processing takes a while, and we have changes while we're still processing?
//  - Can we queue changes? Will we even receive watch updates if we're in the middle of processing?
//  - NOTE: Be careful if we go async, to NOT allow processing a file which is already in the process of being, uh,
//          processed
//
//  - Each task is static in its logic (no params); maybe make tasks an object that we can create a new instance of w/
//  some args (eg. CopyTask('dist/'))
//
//
// - Uglify, Babel
// - --rebuild  option (in case we deleted dist and need to force rebuild, or fuckingtaskrunner had changed)
// - Cleanup output (from this and resourceBuilder.js)
//      - Report "Watching for files" after initial run
//      - Report "Initial run" if we actually have to process some stuff
//      - Report "Checking files" on startup
// - Clean this shit up
// - Fix chokidir watch reporting changes on files twice
// - Map exporter; watch raw map files and replace areahashes.json w/ world.json
// - Busy Saving Cache: what if we're in the process of writing to cache when all of a sudden we try to save again
//
//



// watch('js/**/*.js').then(lint).then(compile).then((file) => {
//      # file is an object w/ methods, contains data (current mutated state -- compiled),  originalData
//
//      if(file.in('js/scripts')) {
//          let result = task('build-script', file)
//          if (!result) return Error(...);
//      }
//
//      return file;
// }).then(copyToDist);
//
// Task returns false:  don't continue to next task
// Task returns Error: don't continue, report error
// Task returns file:  continue w/ file
//
//
// watch('resources/**').then((file) => {
//     let package = findPackageFromFile(file);
//
//     # Determine from package/asset if we should run resourceBuilder
//     task('build-resource ' + package);
// });

const File = function(path) {
    this.path = path;
    this.contents = null;

    this.in = (path) => {
        // FIXME: I don't believe this is correct
        return(fsPath.relative(path, fsPath.dirname(this.path)).indexOf('..') === -1);
    };
};

const TaskState = function(taskProcess, file) {

    this.process = () => {

        ++this.state;
        if (this.state >= taskProcess.processList.length) {
            return; // Finished
        }

        const currentProcess = taskProcess.processList[this.state];

        let result;
        if (currentProcess instanceof Task) {
            result = currentProcess.exec({
                file: file
            });
        } else {
            result = currentProcess(file);
        }

        if (result instanceof Promise) {
            result.then(() => {
                this.process();
            }, (err) => {
                console.error(`Error: ${err}`);
            });
        } else if (!result) {

        } else {
            this.process();
        }
    };

    this.state = -1;
};

const Task = function(cb) {

    this.exec = (args) => {
        const { file, opt } = args;
        let result = cb(file);
        return result;
    };
};

const echoTask = new Task((file) => {
    if (file.in('js/scripts')) {
        console.log("Watching script file: " + file.path);
    } else {
        console.log("Watching non script: " + file.path);
    }
    return true;
});

const copyTask = new Task((file) => {
    return new Promise((resolve, reject) => {
        let pathFromJS = 'dist/js/' + fsPath.relative('js', file.path);
        fs.copyFile(file.path, pathFromJS, (err) => {
            if (err) {
                reject(err);
                return;
            }

            console.log(`Copied ${file.path} to ${pathFromJS}`);
            file.path = pathFromJS;
            resolve();
        });
    });
});


// Read file
// NOTE: This is incase the file is a binary, or something that we don't need to read anyways
const readFileTask = new Task((file) => {
    return new Promise(function(loaded, failed){
        fs.readFile(file.path, function(err, data){
            if (err) {
                failed(err);
                return;
            }

            file.contents = data;
            loaded();
        });
    });
});

const buildScriptTask = new Task((file) => {
    return new Promise((resolve, reject) => {
        exec(`./build-scripts --file ${file.path}`, (err, stdout, stderr) => {
            if (err) {
                reject(err);
                return;
            }

            console.error(stderr);
            console.log(stdout);
            resolve();
        });
    });
});

const TaskProcess = function() {

    this.then = (process) => {
        this.processList.push(process);
        return this;
    };

    this.exec = (args) => {
        const { file, opt } = args;
        const taskState = new TaskState(this, file);
        taskState.process();
    };

    this.processList = [];
};

let fileHash = (file) => {
    let hash = execSync('md5sum ' + file + ' | awk \'{printf \"%s\", $1}\' ');
    return hash.toString('utf8');
};

const runTask = (task, file) => {
    return task.exec({
        file: file
    });
};

// Load our fucking file cache
fs.readFile(Settings.cacheFile, (err, bufferData) => {

    let cacheData;
    if (err) {
        console.error(`Error reading file cache: ${err}`);
        console.error("Starting cache from scratch..");
        cacheData = { "files": {} };
    } else {
        cacheData = JSON.parse(bufferData);
    }

    const Cache = {
        data: cacheData,

        Save: () => {
            fs.writeFile(Settings.cacheFile, JSON.stringify(Cache.data), (err) => {
                if (err) {
                    console.error(err);
                    return;
                }
            });
        },

        AddFile: (file) => {
            console.log(`Cache Added file: ${file.path}`);
            const basename = fsPath.basename(file.path);
            if (!Cache.data.files[basename]) {
                Cache.data.files[basename] = [];
            }

            Cache.data.files[basename].push({
                path: file.path,
                cachedHash: file.hash
            });
        },

        RemoveFile: (file) => {
            console.log(`Cache Removed file: ${file.path}`);
            const basename = fsPath.basename(file.path);

            const idx = Cache.data.files[basename].findIndex((f) => f.path === file.path);
            Cache.data.files[basename].splice(idx, 1);

            if (Cache.data.files[basename].length === 0) {
                delete Cache.data.files[basename];
            }
        },

        UpdateFile: (file) => {
            console.log(`Cache File has changed: ${file.path}   (${file.hash} !== ${file.cachedHash})`);

            const basename = fsPath.basename(file.path);

            const idx = Cache.data.files[basename].findIndex((f) => f.path === file.path);
            Cache.data.files[basename][idx].cachedHash = file.hash;
        }
    };

    const fileCacheList = Cache.data.files;
    let waitingOnFileListCount = 0;


    const watch = (paths, initialRun) => {

        // FIXME: chokidar should accept an array of paths, but for some reason it only worked initially for what ever the
        // first file to change was. Any other subsequent changes from other files weren't spotted
        // For consistency lets just force path to always be an array and handle below
        if (!(paths instanceof Array)) {
            paths = [paths];
        }

        const taskProcess = new TaskProcess();

        const stareAwkwardlyAt = (path) => {
            const watcher = chokidar.watch(path, { persistent: true });
            watcher.on('change', (path, stats) => {
                console.log(`${chalk.yellow('>> ')} "${path}" changed.`);

                const file = new File(path);
                taskProcess.exec({
                    file: file
                });

                const basename = fsPath.basename(path),
                    hash       = fileHash(path);

                let cacheItem     = null,
                    cacheItemName = Cache.data.files[basename];
                if (cacheItemName) {
                    cacheItem = cacheItemName.find((f) => f.path === path);
                }

                if (!cacheItem) {
                    // Adding new cache item
                    Cache.AddFile({
                        path: path,
                        cachedHash: hash
                    });
                } else {
                    // Update cache item
                    Cache.UpdateFile({
                        path: path,
                        hash: hash
                    });
                }

                Cache.Save();
                console.log("");
            });
        };

        for (let i=0; i<paths.length; ++i) {
            stareAwkwardlyAt(paths[i]);
        }

        // Find our entire list of files that are being watched
        if (initialRun) {
            for (let i=0; i<paths.length; ++i) {
                // NOTE: Incrementing waitingOnFileListCount both here AND outside of the function is a little hacky way
                // of saying that we've both finished setting up our watches, AND have finished checking each individual
                // path that we're watching (in case one watch contains an array of paths)
                ++waitingOnFileListCount;
                const path = paths[i];
                glob(path, {}, function (er, files) {
                    if (files) {
                        for (let i = 0; i < files.length; ++i) {
                            allWatchedFilesList.push({
                                path: files[i],
                                exists: true,
                                task: taskProcess,
                                hash: fileHash(files[i])
                            });
                        }
                    }

                    GotAnotherFileList();
                });
            }
        }

        return taskProcess;
    };




    let GotAnotherFileList = () => {
        if (--waitingOnFileListCount === 0) {

            // We've finished fetching all of the files that we're watching
            // Diff our list w/ our cache to determine what has changed since our last run

            // Look through our cache list and find any files that may have been cached but are not longer being watched
            for (const fileName in fileCacheList) {
                let cacheItem = fileCacheList[fileName];
                for (let j = 0; j < cacheItem.length; ++j) {
                    let file = cacheItem[j],
                        watchedFile = allWatchedFilesList.find((f) => f.path === file.path);
                    if (watchedFile === undefined) {
                        // We had previously processed this file, but now its no longer being watched. Probably removed?
                        allWatchedFilesList.push({
                            path: file.path,
                            cached: true,
                            cachedHash: file.cachedHash
                        });
                    } else {
                        watchedFile.cached = true;
                        watchedFile.cachedHash = file.cachedHash;
                    }
                }
            }


            // Go through all of our files (previously cached, and currently watched) and update if necessary
            let updatedCache = [];
            for (let i = 0; i < allWatchedFilesList.length; ++i) {
                let file = allWatchedFilesList[i];
                if (file.cached && !file.exists) {
                    // File has been removed (or no longer watched)
                    Cache.RemoveFile(file);
                    updatedCache.push(file);
                } else if (file.exists && !file.cached) {
                    // File being added
                    Cache.AddFile(file);
                    file.needsProcess = true;
                    updatedCache.push(file);
                } else if (file.hash !== file.cachedHash) {
                    // File has changed since we last processed
                    Cache.UpdateFile(file);
                    file.needsProcess = true;
                    updatedCache.push(file);
                } else {
                    // File has not changed
                }
            }

            if (updatedCache.length > 0) {
                console.log("Cache has changed..");

                for (let i = 0; i < updatedCache.length; ++i) {
                    let cacheItem = updatedCache[i];
                    if (cacheItem.needsProcess) {
                        let file = new File(cacheItem.path);
                        cacheItem.task.exec({
                            file
                        });
                    }
                }

                Cache.Save();
            }

            console.log(chalk.underline("Watching for changes"));
        }
    };

    // Read resources so that we can watch packages for changes
    ++waitingOnFileListCount;
    fs.readFile('resources/data/resources.json', (err, bufferData) => {

        if (err) {
            console.error(`Error reading resources: ${err}`);
            return;
        }

        // FIXME: Do we need to watch resources??
        const Resources  = JSON.parse(bufferData),
            packages     = [],//{ name: "resources", file: "resources.json" }],
            allResources = [];//'resources/data/resources.json'];

        for (const packageName in Resources) {
            const package = Resources[packageName],
                file      = 'resources/data/' + package.file;

            packages.push({ name: packageName, file: package.file });
            allResources.push(file);
        }

        watch(allResources, true)
            .then((file) => {
                const package = packages.find((p) => p.file === fsPath.basename(file.path));
                return new Promise((resolve, reject) => {
                    exec(`node resourceBuilder.js --package ${package.name}`, (err, stdout, stderr) => {
                        if (err) {
                            reject(err);
                            return;
                        }

                        console.log(stdout);
                        resolve();
                    });
                });
            });

        GotAnotherFileList();
    });


    //watch('js/**/*.js', true)
    //    .then(echoTask)
    //    .then(copyTask);

    ++waitingOnFileListCount;
    watch('js/**/*.js', true)
        .then(copyTask)
        .then((file) => {

            if (file.in('dist/js/scripts')) {
                return runTask(buildScriptTask, file);
            }

            return true;
        });
    GotAnotherFileList();


    const allWatchedFilesList = [];
});
