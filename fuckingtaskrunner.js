const chokidar = require('chokidar'),
    fs         = require('fs'),
    glob       = require('glob'),
    fsPath     = require('path'),
    exec       = require('child_process').exec,
    execSync   = require('child_process').execSync,
    chalk      = require('chalk');

const Settings = {
    cacheFile: 'fuckingtaskrunner.json',
    lockFile: 'fuckingtaskrunner.lock',
    dontWatch: false
};

let CacheSettings;

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
// - Copy task: folders don't exist? create them
// - Running out of memory on initial install on AWS -- why are we using so much memory
// - Fix chokidir running slow, sometimes not reporting file changes
// - BUG: Things not getting cached? Running full initial run every startup
// - Acorn parser to build AST and better tweak accordingly (console.log, assert, etc.)
// - Production vs. Dev for faster builds vs. slow/optimized
//
//


// Process Server arguments
for (let i=0; i<process.argv.length; ++i) {

    const arg = process.argv[i];

    if (arg === "--dont-watch") {
        console.log("Only running once (no watching for changes)");
        Settings.dontWatch = true;
    }
}


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

let totalLocks = 0;

const LockFile = () => {

    if (totalLocks === 0) {
        console.log("Creating lockfile");
        fs.closeSync(fs.openSync(Settings.lockFile, 'w'));
    }
    ++totalLocks;
};

const UnlockFile = () => {

    --totalLocks;
    if (totalLocks === 0) {
        console.log("Removing lockfile");
        fs.unlinkSync(Settings.lockFile);
    }
};

const TaskState = function(taskProcess, file) {

    this.process = () => {

        ++this.state;
        if (this.state >= taskProcess.processList.length) {
            taskProcess.finished();
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
            console.log("Calling promise");
            //result.then(() => {
            result.finally(() => {
                console.log("Finished promise chain");
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
        return cb(file);
    };
};

const echoTask = new Task((file) => {
    return new Promise((resolve, reject) => {
        if (file.in('js/scripts')) {
            console.log("Watching script file: " + file.path);
        } else {
            console.log("Watching non script: " + file.path);
        }

        resolve();
    });

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
    return new Promise((loaded, failed) => {
        fs.readFile(file.path, 'utf8', function(err, data){
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

const preprocessJSTask = new Task((file) => {

    // Is file blacklisted?
    console.log(`About to check: ${file.path}`);
    const srcFile = file.path.substr("dist/".length);
    if (CacheSettings.preprocess.blacklist.indexOf(srcFile) >= 0) {
        console.log(`Skipping blacklisted file ${srcFile}`);
        return true;
    }

    return new Promise((resolve, reject) => {

        // Babel
        console.log(`Preprocessing ${file.path}`);
        exec(`node preprocessAST.js --file ${file.path} --output ${file.path}`, (err, stdout, stderr) => {

            if (err) {
                reject(err);
                return;
            }

            console.log(stderr);
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
        return this;
    };

    this.finally = (cb) => {
        this.finished = cb;
    };

    this.finished = () => {};
    this.processList = [];
};

let fileHash = (file) => {
    let hash = execSync('cksum "' + file + '" | awk \'{printf \"%s\", $1}\' ');
    return hash.toString('utf8');
};

const runTask = (task, file) => {
    //return new Promise((resolve, reject) => {
    //    resolve();
    //    //task.exec({ file }).then(resolve);
    //});
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
        cacheData = { "files": {}, "settings": {
            preprocess: {
                blacklist: []
            }
        } };
    } else {
        cacheData = JSON.parse(bufferData);

        // FIXME: Assert that expected settings are there
        if(!cacheData.settings.preprocess.blacklist) {
            console.error("ERROR: Missing expected preprocess blacklist");
            process.exit();
        }

        CacheSettings = cacheData.settings;
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

            const basename = fsPath.basename(file.path);

            const idx     = Cache.data.files[basename].findIndex((f) => f.path === file.path),
                cacheFile = Cache.data.files[basename][idx];
            console.log(`Cache File has changed: ${file.path}   (${file.hash} !== ${cacheFile.cachedHash})`);
            cacheFile.cachedHash = file.hash;
        }
    };

    const fileCacheList = Cache.data.files;
    let waitingOnFileListCount = 0;


    const watch = (paths, initialRun, runInOrderPackage) => {

        // FIXME: chokidar should accept an array of paths, but for some reason it only worked initially for what ever the
        // first file to change was. Any other subsequent changes from other files weren't spotted
        // For consistency lets just force path to always be an array and handle below
        if (!(paths instanceof Array)) {
            paths = [paths];
        }

        const taskProcess = new TaskProcess();

        // Queue of tasks waiting to be processed
        const processingQueue = [];
        const processQueueItem = (p) => {
            const path = p.path,
                file   = new File(path);
            taskProcess.exec({
                file: file
            }).finally(() => {

                // Remove from process queue
                let idx = processingQueue.findIndex((q) => q === p);
                processingQueue.splice(idx, 1);

                // Update Cache
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

                // Process next item after this one
                if (p.runNext) {
                    processQueueItem(p.runNext);
                } else if (processingQueue.length === 0) {
                    Cache.Save();

                    console.log("");
                    console.log("");
                    console.log(chalk.underline("Watching for changes"));

                    UnlockFile();
                }
                console.log("");
            });
        };

        const stareAwkwardlyAt = (path) => {

            let cb = (eventType, path) => {

                LockFile();

                const queued = {
                        path: path,
                        processing: false
                    };

                processingQueue.push(queued);

                if (runInOrderPackage && processingQueue.length > 1) {
                    if (processingQueue[processingQueue.length - 1].runNext) throw Error("We're about to override run next on processing item. This makes no sense!");
                    processingQueue[processingQueue.length - 1].runNext = queued;
                    return;
                } else {
                    // Are we already busy processing this file? Then wait until its finished
                    // NOTE: Ignore the last item (that's us!)
                    for (let i = processingQueue.length - 2; i >= 0; --i) {
                        if (processingQueue[i].file === path) {
                            if (processingQueue[i].runNext) throw Error("We're about to override run next on processing item. This makes no sense!");
                            processingQueue[i].runNext = queued;
                            return;
                        }
                    }
                }

                processQueueItem(queued);
            };

            glob(path, {}, function (er, files) {
                if (files) {
                    files.forEach((file) => {
                        console.log(`Watching: ${chalk.blue(file)}`);
                        const beginWatch = (path) => {
                            try {
                                let watcher = fs.watch(path, {
                                    persistent: true
                                }, (eventType, filename) => {
                                    //console.log(eventType);
                                    if (eventType === "rename") {
                                        return;
                                    }
                                    console.log(`${chalk.yellow('>> ')} ${chalk.blue(path)} changed: ${eventType}`);
                                    watcher.close();
                                    cb(eventType, path);
                                    console.log(`Rewatching: ${chalk.blue(path)}`);
                                    beginWatch(path);
                                });
                            } catch(e) {
                                console.error(e);

                                // Wait until file is back
                                setTimeout(() => {
                                    beginWatch(path);
                                }, 100);
                            }
                        };

                        beginWatch(file);
                    });
                }
            });
        };

        if (!Settings.dontWatch) {
            for (let i=0; i<paths.length; ++i) {
                stareAwkwardlyAt(paths[i]);
            }
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

                            const watchItem = {
                                path: files[i],
                                exists: true,
                                task: taskProcess,
                                hash: fileHash(files[i])
                            };

                            if (runInOrderPackage) {
                                watchItem.runInOrderPackage = runInOrderPackage;
                                watchItem.followup = [];
                            }


                            allWatchedFilesList.push(watchItem);
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
                } else if (file.hash !== file.cachedHash) {
                    // File has changed since we last processed
                    Cache.UpdateFile(file);
                    file.needsProcess = true;
                } else {
                    // File has not changed
                }

                if (file.needsProcess) {
                    if (file.runInOrderPackage) {
                        // Do we have any other cacheItems tasked already that we can add this to as a follow-up
                        // process?
                        let firstItem = updatedCache.find((c) => c.runInOrderPackage === file.runInOrderPackage);
                        if (firstItem) {
                            // Add as a follow-up process
                            firstItem.followup.push(file);
                        } else {
                            // First item of its kind; simply add to update cache list
                            updatedCache.push(file);
                        }
                    } else {
                        updatedCache.push(file);
                    }
                }
            }


            let waitingOnTasks = 0;
            if (updatedCache.length > 0) {
                console.log("Some files have changed since last run..");

                const finishedProcessingTasks = () => {
                    console.log("Finished processing items");
                    Cache.Save();

                    console.log("");
                    console.log("");
                    console.log(chalk.underline("Watching for changes"));
                };

                const processCacheItem = (cacheItem) => {
                    let file = new File(cacheItem.path);

                    if (cacheItem.runInOrderPackage && cacheItem.followup.length > 0) {
                        cacheItem.task.exec({
                            file
                        }).finally(() => {
                            if (cacheItem.followup.length === 0) {
                                if (--waitingOnTasks === 0) finishedProcessingTasks();
                                //cb(); console.log("Resolved count: " + (++totalCount) + "/" + allTaskPromises.length);
                                return;
                            }

                            let nextCacheItem = cacheItem.followup.shift();
                            nextCacheItem.followup = cacheItem.followup;
                            //processCacheItem(nextCacheItem, cb);
                            processCacheItem(nextCacheItem);
                        });
                    } else {
                        cacheItem.task.exec({
                            file
                        }).finally(() => {
                            if (--waitingOnTasks === 0) finishedProcessingTasks();
                            //cb(); console.log("Resolved count: " + (++totalCount) + "/" + allTaskPromises.length);
                        });
                    }
                };

                let allTaskPromises = [];

                for (let i = 0; i < updatedCache.length; ++i) {
                    let cacheItem = updatedCache[i];
                    if (cacheItem.needsProcess) {
                        processCacheItem(cacheItem);
                        ++waitingOnTasks;
                        //allTaskPromises.push(new Promise((resolve, reject) => {
                        //    processCacheItem(cacheItem, resolve);
                        //}));
                    }
                }

                // TODO: Having problems w/ these promises finishing .all
                //Promise.all(allTaskPromises).then(() => {
                //    finishedProcessingTasks();
                //});
            } else {
                console.log(chalk.underline("Watching for changes"));
            }
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

        watch(allResources, true, 'resources')
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


    ++waitingOnFileListCount;
    watch('js/**/*.js', true)
        .then(copyTask)
        //.then((new Task((file) => {
        .then((file) => {

            // TODO: Uglify, Babel, Preprocessor (clear logs)

            if (file.in('dist/js/scripts')) {
                return runTask(preprocessJSTask, file)
                        .then(() => runTask(buildScriptTask, file));
            }

            return runTask(preprocessJSTask, file);



            //return new Promise((success, fail) => {
            //    //runTask(echoTask, file)
            //    echoTask.exec({ file })
            //        .then(readFileTask)
            //        .then(echoTask)
            //        .then(preprocessJSTask)
            //        .then(success);
            //});

            // runTask(task)  returns task.exec ==> cb(file)
            // Task(cb).exec  returns cb(file) ... promise?
            //
            // runTask(taskA).then(taskB)  ==> Promise.then(taskB)
            //
            // watch(..) ==> returns taskProcess
            // taskProcess.then(task) ==> pushes task to processList
            //      process: if processList[i] is a Task then exec, otherwise call it
            //      if result is a Promise then promisify, otherwise continue on pass
            //
            // watch().then(taskA).then(taskB)  ==> processList: [taskA, taskB] ==> 
            //return runTask(readFileTask, file)
            //    .then(preprocessJSTask);

            //return true;
        });
        //})));
    GotAnotherFileList();


//    ++waitingOnFileListCount;
//    watch([
//        'dist/resources/maps/**/*',
//        'dist/reources/sprites/**/*',
//        'dist/resources/data/**/*.json',
//
//        'resources/maps/**/*',
//        'resources/data/**/*.json',
//    ], true)
//        .then((file) => {
//
//            return new Promise((resolve, reject) => {
//                fs.stat(file.path, (err, stats) => {
//
//                    if (err) {
//                        reject(err);
//                        return;
//                    }
//
//                    const mode = stats.mode;
//                    const MODE_EXEC      = 1,
//                          MODE_WRITE     = 2,
//                          MODE_READ      = 4,
//                          MODE_FOR_ALL   = 1,
//                          MODE_FOR_GROUP = 10,
//                          MODE_FOR_OWNER = 100;
//
//                    const MODE_READWRITE_ALL = (MODE_WRITE | MODE_READ) * MODE_FOR_ALL;
//
//                    // If we don't have read/write for all, then chmod that
//                    if ((mode & MODE_READWRITE_ALL) !== MODE_READWRITE_ALL) {
//
//                        //console.log(`stat ${file.path}: ${stats}`);
//                        //console.log(stats);
//                        console.log(`chmod ${file.path}`);
//                        fs.chmodSync(file.path, 0o777);
//                    }
//
//                    resolve();
//                });
//            });
//
//            // Want to update perms
//            //const perms = fs.statSync(file.path);
//            //console.log(`stat ${file.path}: ${perms}`);
//
//            //let result = fs.chmodSync(file.path, 0o777);
//
//            return true;
//        });
//    GotAnotherFileList();



    const allWatchedFilesList = [];
});
