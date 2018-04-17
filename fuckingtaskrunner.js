const chokidar = require('chokidar'),
    fs         = require('fs'),
    glob       = require('glob'),
    fsPath     = require('path'),
    exec       = require('child_process').exec;

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
// - Store cache of watched files/directories, then on startup look for any differences and pass through watch tasks
// (as if it had never turned off)
// - --rebuild  option (in case we deleted dist and need to force rebuild, or fuckingtaskrunner had changed)
//
//
// - Copy: watch('js/*', copyTask);    copyTask(file) => copyFile
// - Compile (babel):   watch -> compile -> copy/write
// - Scripts: watch -> compile -> (filter scripts -> copy/write)
// - Resources: watch -> determine package -> task:package
//      - Maps: run map-exporter   ???
//      - Package: run resourceBuilder



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
            result = currentProcess.exec(file);
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

    this.exec = (file) => {
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

    this.exec = (file) => {
        const taskState = new TaskState(this, file);
        taskState.process();
    };

    this.processList = [];
};

const watch = (path, initialRun) => {

    const taskProcess = new TaskProcess();

    const stareAwkwardlyAt = (path) => {
        const watcher = chokidar.watch(path, { persistent: true });
        watcher.on('change', (path, stats) => {
            console.log("Zomg shit has changed: " + path);

            const file = new File(path);
            taskProcess.exec(file);
        });
    };

    // FIXME: chokidar should accept an array of paths, but for some reason it only worked initially for what ever the
    // first file to change was. Any other subsequent changes from other files weren't spotted
    if (path instanceof Array) {
        for (let i=0; i<path.length; ++i) {
            stareAwkwardlyAt(path[i]);
        }
    } else {
        stareAwkwardlyAt(path);
    }

    // We may want to run tasks on files before we've even witnessed any changes (eg. on startup, in case files have
    // changed before already)
    if (initialRun) {
        glob(path, {}, function (er, files) {
            if (files) {
                for (let i = 0; i < files.length; ++i) {
                    const file = new File(files[i]);
                    taskProcess.exec(file);
                }
            }
        })
    }

    return taskProcess;
};

const runTask = (task, file) => {
    return task.exec(file);
};

//watch('js/**/*.js', true)
//    .then(echoTask)
//    .then(copyTask);

watch('js/**/*.js', true)
    .then(copyTask)
    .then((file) => {

        if (file.in('dist/js/scripts')) {
            return runTask(buildScriptTask, file);
        }

        return true;
    });


// Read resources so that we can watch packages for changes
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
        console.log("Watching Resource Package: " + file);
        allResources.push(file);
    }

    watch(allResources, false)
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

});
