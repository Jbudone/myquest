// TODO:
//  - Would be cool to adopt a transaction type system, where we only save all files at the very end (so that we don't save an asset when something ends up crashing the builder later)
//  - Avoid reading raw asset twice (once for hash, once for cache)
//  - Remove stale resource files (those which are no longer referenced)


const requirejs = require('requirejs');
requirejs.config({
    nodeRequire: require,
    baseUrl: __dirname,
    paths: {
        lodash: "https://cdn.jsdelivr.net/lodash/4.14.1/lodash.min.js"
    }
});

const util          = require('util'),
    _               = require('lodash'),
    fs              = require('fs'),        // TODO: Promisify this
    path            = require('path'),
    Promise         = require('bluebird'),
    chalk           = require('chalk'),
    prettyjson      = require('prettyjson'),
    assert          = require('assert'),    // TODO: Disable in production
    filepath        = require('path'),
    crypto          = require('crypto'),
    openpgp         = require('openpgp'),
    exec            = require('child_process').exec,
    execSync        = require('child_process').execSync;

const Settings = {
    forceRebuild: false,
    checkNeedsRebuild: false
}

// Process Server arguments
for (let i=0; i<process.argv.length; ++i) {

    const arg = process.argv[i];

    if (arg === "--force-rebuild") {
        console.log("Recaching all resources");
        Settings.forceRebuild = true;
    }

    if (arg === "--needs-rebuild") {
        console.log("Checking if resources need rebuilding");
        Settings.checkNeedsRebuild = true;
    }

    if (arg === "--package") {
        const filterPackage = process.argv[++i];
        console.log("Filtering package: " + filterPackage);
        Settings.filterPackage = filterPackage;
    }
}

// Prepare openpgp stuff
openpgp.initWorker({ path: 'node_modules/openpgp/dist/openpgp.worker.js' }) // set the relative web worker path
openpgp.config.aead_protect = true // activate fast AES-GCM mode (not yet OpenPGP standard)

// TODO: Need a way to read from all resources, and handle similarly
//
//  - resources, sheets, icons, sounds, maps
//  - need a list of raw resources and their hashes
//  - go through each resource to see if hash different
//  - if hash is different then mark asset in some way
//  - go through marked asssets, process accordingly (need a way to classify assets so we know how to process them -- sheets w/ options (encrypt?), data (validate?), maps, sounds, images)
//  - update asset hashes along the way
//  - for all marked assets, update their parent package (sounds.json, resources.json, world.json, etc.)
//  - NOTE: Need ordering to be available (resources.json last!)
//  - Need an easy way to skip processing and only find changed assets (for --check-needs-rebuild)
//  - Need an easy way to limit search to specific package (resources.json, sounds.json, etc.) in case this comes from Gruntfile/watch
//  - Need an easy way to limit to specific asset in case this comes from Gruntfile/watch again
//
//
//   - Single package: read through resources and only add the specified package asset; add that package
//   - Single resource: go through all packages to find asset, and only add the package/asset that matches the specified resource file
//   - Resources should be the top most package, other packages are under that
//      Resources:
//          - sheets, avatars, npcs, world, items, buffs, interactables, quests, interactions, scripts, ...
//
//      Resources: {
//        file: resources.json
//        type: data
//        rawHash: asdf
//        processedhash: kljf
//        options: { validate: true },
//        data: ....
//
//        assets: [{
//          file: sheets.json
//          type: data
//          rawHash: 123abc
//          processedHash: abc123
//          options: { validate: true },
//          data: ....   (specific to data only -- store JSON)
//
//          assets: [
//            {
//              file: sprite.png
//              type, rawhash, processedHash, options: { encrypt: true }
//            }
//          ]
//        }, ....]
//      }
//
//
// -- get rid of areahashes and just use world.json for hash (would need 2 types of hashes stored here)
// 8) Filter asset if necessary (specified package or resource) --- if we update an asset does that mean we'll always update the package? If so then we should only filter packages in Grunt. Can Grunt listen for changes and wait X seconds before recompiling? (exceptions: npcs.json or other pure data files?), could store a list of files that have changed and pass them all into here
//      - what if we have nested packages, and change one of those packages -- might need a delay?
//      - delay: what if we change a package (automated) and continue processing w/ intention of changing another package or the same one again -- delay is dependent on that process finishing
//      - we could ONLY watch certain packages, and expect other packages (eg. sheets) to rebuild via exporter -- but what if we touch it manually?
//      - some files we want to reload immediately (eg. npcs, buffs, testing)
//
//      -- Watch/Rebuild immediately: list of packages (npcs, buffs, etc.)
//      -- Watch/Rebuild after delay (careful w/ delay time): list of packages (sheets, media, avatars, world)
// 10) Integrate w/ Grunt & Server
//      - Grunt: Watch Resource packages; list of those w/ rebuild delay/immediate
//      - Grunt: Rebuild when necessary -- read exit code for indicator of failure
//      - Server: --needs-rebuild  ; read exit code to determine, then exit if needed
// -- move this to tools/
// -- nicer output (colours n shiz)
// -- clean this file up
// -- get rid of references to old caching system in js
// -- hash -> processedHash; rawHash -> hash
// -- get rid of cache.json

let Resources = null;

const packageRoutines = {
    "resources": {
        "read": (data) => {
            const assets = [];
            let packageData = data;
            if (Settings.filterPackage) {
                packageData = {};
                const package = data[Settings.filterPackage];
                if (!package) {
                    console.error("Could not find package: " + Settings.filterPackage + "!");
                    process.exit(1);
                }

                packageData[Settings.filterPackage] = package;
            }

            _.forEach(packageData, (packageDetails, packageName) => {
                assets.push({
                    name: packageName,
                    file: 'resources/data/' + packageDetails.file,
                    output: 'dist/resources/data/' + packageDetails.file,
                    type: "data",
                    rawHash: packageDetails.rawHash,
                    processedHash: packageDetails.hash,
                    options: packageDetails.options
                });
            });

            return assets;
        },
        "validate": (data) => {
            // FIXME: Validate the data
            return true;
        },
        "updateAsset": (data, assetName, asset) => {
            data[assetName].hash = asset.processedHash;
            data[assetName].rawHash = asset.hash;
        }
    },


    "media": {
        "read": (data) => {
            const assets = [];
            data.list.forEach((assetDetails) => {
                assets.push({
                    name: assetDetails.name,
                    file: 'resources/' + assetDetails.file,
                    output: 'dist/resources/' + assetDetails.output,
                    type: assetDetails.type,
                    rawHash: assetDetails.rawHash,
                    processedHash: assetDetails.hash,
                    options: assetDetails.options
                });
            });

            return assets;
        },
        "validate": (data) => {
            return true;
        },
        "updateAsset": (data, assetName, asset) => {
            console.log(`Updating an asset in media: ${assetName}`);

            let media = data.list.find((media) => media.name === assetName);
            media.hash = asset.processedHash;
            media.rawHash = asset.hash;
        }
    },
	"sheets": {
        "read": (data) => {
            const assets = [];
            data.tilesheets.list.forEach((sheet) => {
                assets.push({
                    name: sheet.id,
                    type: "image",
                    file: 'resources/' + sheet.image,
                    rawHash: sheet.rawHash,
                    processedHash: sheet.hash,
                    options: sheet.options,
                    output: 'dist/resources/' + sheet.output,
                    sheetType: 'tilesheet'
                });
            });

            data.spritesheets.list.forEach((sheet) => {
                assets.push({
                    name: sheet.id,
                    type: "image",
                    file: 'resources/' + sheet.image,
                    rawHash: sheet.rawHash,
                    processedHash: sheet.hash,
                    options: sheet.options,
                    output: 'dist/resources/' + sheet.output,
                    sheetType: 'spritesheet'
                });
            });

            return assets;
        },
        "validate": (data) => {
            return true;
        },
        "updateAsset": (data, assetName, asset) => {
            console.log(`Updating an asset in sheets: ${assetName}`);
            
            let list = null;
            if (asset.sheetType === 'tilesheet') {
                list = data.tilesheets.list;
            } else if (asset.sheetType === 'spritesheet') {
                list = data.spritesheets.list;
            } else {
                console.error("Unexpected sheetType! " + asset.sheetType);
            }

            let sheet = list.find((sheet) => sheet.id === assetName);
            sheet.hash = asset.processedHash;
            sheet.rawHash = asset.hash;

            console.log(sheet);
        }
    },
	"avatars": {
        "read": (data) => {
            return {};
        },
        "validate": (data) => {
            return true;
        },
        "updateAsset": (data, assetName, asset) => {

        }
    },
	"npcs": {
        "read": (data) => {
            return {};
        },
        "validate": (data) => {
            return true;
        },
        "updateAsset": (data, assetName, asset) => {

        }
    },
	"world": {
        "read": (data) => {
            const assets = [];
            _.forEach(data.areas, (assetDetails, assetID) => {
                assets.push({
                    name: assetID,
                    file: 'resources/' + assetDetails.file,
                    output: 'dist/resources/' + assetDetails.file,
                    type: "map",
                    rawHash: assetDetails.rawHash,
                    processedHash: assetDetails.hash
                });
            });

            return assets;
        },
        "validate": (data) => {
            return true;
        },
        "updateAsset": (data, assetName, asset) => {
            console.log(`Updating an asset in world: ${assetName}`);

            let area = data.areas[assetName];
            area.hash = asset.processedHash;
            area.rawHash = asset.hash;
        }
    },
	"items": {
        "read": (data) => {
            return {};
        },
        "validate": (data) => {
            return true;
        },
        "updateAsset": (data, assetName, asset) => {

        }
    },
	"buffs": {
        "read": (data) => {
            return {};
        },
        "validate": (data) => {
            return true;
        },
        "updateAsset": (data, assetName, asset) => {

        }
    },
	"interactables": {
        "read": (data) => {
            return {};
        },
        "validate": (data) => {
            return true;
        },
        "updateAsset": (data, assetName, asset) => {

        }
    },
    "quests": {
        "read": (data) => {
            return {};
        },
        "validate": (data) => {
            return true;
        },
        "updateAsset": (data, assetName, asset) => {

        }
    },
    "interactions": {
        "read": (data) => {
            return {};
        },
        "validate": (data) => {
            return true;
        },
        "updateAsset": (data, assetName, asset) => {

        }
    },
	"scripts": {
        "read": (data) => {
            return {};
        },
        "validate": (data) => {
            return true;
        },
        "updateAsset": (data, assetName, asset) => {

        }
    },
    "components": {
        "read": (data) => {
            return {};
        },
        "validate": (data) => {
            return true;
        },
        "updateAsset": (data, assetName, asset) => {

        }
    },
    "rules": {
        "read": (data) => {
            return {};
        },
        "validate": (data) => {
            return true;
        },
        "updateAsset": (data, assetName, asset) => {

        }
    },
    "fx": {
        "read": (data) => {
            return {};
        },
        "validate": (data) => {
            return true;
        },
        "updateAsset": (data, assetName, asset) => {

        }
    },
    "testing": {
        "read": (data) => {
            return {};
        },
        "validate": (data) => {
            return true;
        },
        "updateAsset": (data, assetName, asset) => {

        }
    }
};

let fileHash = (file) => {
    let hash = execSync('md5sum ' + file + ' | awk \'{printf \"%s\", $1}\' ');
    return hash.toString('utf8');
};

let readPackage = (package, file) => {
    return new Promise((success, fail) => {
        fs.readFile(file, (err, bufferData) => {

            if (err) {
                console.error(`Error reading package: ${err}`);
                fail(err);
                return;
            }

            const data         = JSON.parse(bufferData),
                packageRoutine = packageRoutines[package],
                assets         = packageRoutine.read(data);

            success({data, assets});
        });
    });
};

// Load all resources and their list of assets
readPackage('resources', 'resources/data/resources.json').then((details) => {
    
    const { data, assets, hash } = details;

    const packages   = [],
        readPackages = [];

    assets.forEach((packageDetails) => {

        let readPackagePromise = new Promise((success, fail) => {
            readPackage(packageDetails.name, packageDetails.file).then((details) => {
                
                const { data, assets } = details;
                const package = {
                    name: packageDetails.name,
                    file: packageDetails.file,
                    output: packageDetails.output,
                    type: "data",
                    rawHash: packageDetails.rawHash,
                    processedHash: packageDetails.processedHash,
                    options: packageDetails.options,
                    data: data,
                    assets: assets
                }; 

                packages.push(package);
                success();
            }).catch((e) => {
                console.error("There was an error reading a package from Resources");
                fail(e);
            });
        });

        readPackages.push(readPackagePromise);
    });

    Promise.all(readPackages).then(() => {
        Resources = {
            name: "resources",
            file: 'resources/data/resources.json',
            type: "data",
            processedHash: null,
            options: {},
            rawHash: hash,
            data: data,
            assets: packages
        };

        processResources(Resources).then(() => {
            console.log("Successfully saved packages");

            const output = 'dist/' + Resources.file;
            fs.copyFile(Resources.file, output, (err) => {

                if (err) {
                    console.error(err);
                    return;
                }

                console.log("Saved resources to " + output);
            });
        });
    }, () => {
        console.error("There was an error reading from Resources");
    });
});


// Process the given resources/assets
// Any differing hashes will be processed to dist
let processResources = (package) => {
    return new Promise((success, fail) => {

        // Need to process assets in here?
        // This package may or may not contain assets (NOTE: It could be an asset itself without any assets yet).
        // FIXME: Confirm assets is an array (assert)
        let processingAssetsPromises = [];
        let updatedPackage = false;
        if (package.assets && package.assets.length) {
            package.assets.forEach((asset) => {

                let processAsset = () => {
                    return new Promise((success, fail) => {

                        // Process asset if the hash has changed
                        // NOTE: We need to get the hash here, in case we've changed the asset somewhere along the way to here
                        let hash     = fileHash(asset.file),
                            distHash = fs.existsSync(asset.output) ? fileHash(asset.output) : "";
                        if (asset.processedHash !== distHash || asset.rawHash !== hash || Settings.forceRebuild) { // FIXME: Force rebuild
                            console.log(`Asset to process (hash has changed)! ${package.name}: ${asset.name}`);
                            console.log("Output: " + asset.processedHash + " !== " + distHash + " ? ");
                            console.log("Raw Asset: " + asset.rawHash + " !== " + hash + " ? ");

                            if (Settings.checkNeedsRebuild) {
                                process.exit(2);
                            }

                            updatedPackage = true;
                            if (asset.type === "image") {

                                processImage(asset).then(() => {
                                    asset.hash = hash;
                                    let processedHash = fileHash(asset.output);
                                    asset.processedHash = processedHash;
                                    console.log("Asset hashes: " + hash + " " + processedHash);
                                    const packageRoutine = packageRoutines[package.name],
                                        assets           = packageRoutine.updateAsset(package.data, asset.name, asset);

                                    success();
                                }, (err) => {
                                    console.error("Error processing image: " + err);
                                    fail(err);
                                });
                            } else if (asset.type === "data") {

                                createDirectoriesFor(asset.output);
                                fs.copyFile(asset.file, asset.output, (err) => {

                                    if (err) {
                                        console.error(err);
                                        fail();
                                        return;
                                    }

                                    asset.hash = hash;
                                    let processedHash = fileHash(asset.output);
                                    asset.processedHash = processedHash;
                                    console.log("Processed output: " + asset.output + ": " + processedHash);
                                    const packageRoutine = packageRoutines[package.name],
                                        assets           = packageRoutine.updateAsset(package.data, asset.name, asset);

                                    console.log(package.data);
                                    success();
                                });
                            } else if (asset.type === "sound") {

                                createDirectoriesFor(asset.output);
                                fs.copyFile(asset.file, asset.output, (err) => {

                                    if (err) {
                                        console.error(err);
                                        fail();
                                        return;
                                    }

                                    asset.hash = hash;
                                    let processedHash = fileHash(asset.output);
                                    asset.processedHash = processedHash;
                                    const packageRoutine = packageRoutines[package.name],
                                        assets           = packageRoutine.updateAsset(package.data, asset.name, asset);

                                    success();
                                });
                            } else if (asset.type === "map") {

                                createDirectoriesFor(asset.output);
                                fs.copyFile(asset.file, asset.output, (err) => {

                                    if (err) {
                                        console.error(err);
                                        fail();
                                        return;
                                    }

                                    asset.hash = hash;
                                    let processedHash = fileHash(asset.output);
                                    asset.processedHash = processedHash;
                                    const packageRoutine = packageRoutines[package.name],
                                        assets           = packageRoutine.updateAsset(package.data, asset.name, asset);

                                    success();
                                });
                            } else {
                                success();
                            }
                        } else {
                            success();
                        }
                    });
                };


                // If this asset itself is a package, then we need to attempt to process it as a package before we
                // process it as an asset. eg. data files in resources (sheets.json is both an asset and a package)
                // FIXME: This promise shit is a mess, clean up this slop
                if (asset.assets) {
                    let bothPromises = new Promise((success, fail) => {
                        processResources(asset).then(processAsset).then(() => {
                            success();
                        });
                    });
                    processingAssetsPromises.push(bothPromises);
                } else {
                    processingAssetsPromises.push(processAsset());
                }
            });


            // Do we have any assets processing? Wait on these first
            if (processingAssetsPromises.length > 0) {
                Promise.all(processingAssetsPromises).then(() => {

                    // Could be that nothing has changed
                    if (!updatedPackage) {
                        success();
                        return;
                    }

                    console.log("Saving package changes: " + package.name + " ==> " + package.file);

                    // Save package JSON (save .data)
                    const prettyCache = JSON.stringify(package.data); // TODO Prettify cache json?
                    fs.writeFile(package.file, prettyCache, (err, bufferData) => {
                        if (err) {
                            console.error(err);
                            return;
                        }

                        console.log("Saved to " + package.file);
                        success();
                    });
                });
            } else {
                success();
            }
        } else {
            success();
        }
    });
};

let readResourcesPromise = new Promise((success, fail) => {

    fs.readFile('resources/data/resources.json', (err, bufferData) => {
        if (err) {
            failed(err);
            return;
        }

        const data = JSON.parse(bufferData);
        success(data);
    });
});

const createDirectoriesFor = (dest) => {

    // Is the destination directory available? If not we need to create those directories
    let destFolders = [path.dirname(dest)];
    while (!fs.existsSync(destFolders[destFolders.length-1])) {
        destFolders.push(path.dirname(destFolders[destFolders.length-1]));
    }

    // The last item is destFolders is a directory that exists
    for (let i=destFolders.length-2; i>=0; --i) {
        console.log(`Making directory: ${destFolders[i]}`);
        fs.mkdirSync(destFolders[i])
    }
};

const processImage = (package) => {

    return new Promise((success, fail) => {

        console.log("Processing image:");
        console.log(package);

        // Do we need to encrypt the image?
        if (package.options.encrypted) {

            const buffer = new Uint8Array();
            fs.readFile(package.file, (err, buffer) => {

                // Prepare our write buffer (eg. encrypted file if necessary)
                const readyToWritePromise = new Promise((bufferFetchSuccess, bufferFetchFail) => {

                    // Are we encrypting this file?
                    if (package.options.encrypted) {
                        const options = {
                            data: buffer,
                            passwords: ['secret stuff'],
                            armor: false
                        };

                        openpgp.encrypt(options).then((ciphertext) => {
                            const encrypted = ciphertext.message.packets.write(); // get raw encrypted packets as Uint8Array
                            bufferFetchSuccess(encrypted);
                        }, bufferFetchFail);
                    } else {
                        bufferFetchSuccess(buffer);
                    }
                });

                // Write our cached file
                readyToWritePromise.then((writeBuffer) => {

                    createDirectoriesFor(package.output);
                    fs.writeFile(package.output, writeBuffer, {
                        encoding: 'binary',
                        flag: 'w'
                    }, (err) => {
                        console.log(`Wrote/Encrypted ${package.output}`);
                        success();
                    });
                }, (err) => {
                    console.error(`Error preparing write buffer for ${package.file}`);
                    fail(err);
                });
            });

        } else {

            // Preprocessing raw asset -> asset, without any internal reformatting (eg. packing, encrypting)
            if (!package.options.preprocess) {
                console.log(`Copying raw asset ${package.file} -> ${package.output}`);
                createDirectoriesFor(package.output);
                fs.copyFile(package.file, package.output, (err) => {

                    if (err) {
                        console.error(err);
                        fail();
                        return;
                    }

                    success();
                });
            } else {

                // Preprocess raw asset
                if (package.options.preprocess === "convert") {

                    createDirectoriesFor(package.output);
                    exec(`convert ${package.file} ${package.output}`, (err, stdout, stderr) => {

                        if (err) {
                            // node couldn't execute the command
                            console.error(`Error converting asset ${package.file}`);
                            fail();
                            return;
                        }

                        success();
                    });
                } else {
                    console.error(`Unknown preprocess option (${package.options.preprocess}) for asset ${package.file}`);
                    fail();
                }
            }
        }

    });
};

/*
//readResourcesPromise.then(() => {

    fs.readFile('resources/data/cache.json', (err, bufferData) => {

        if (err) {
            console.error(`Error reading cache.json: ${err}`);
            return;
        }

        const data    = JSON.parse(bufferData),
            packedCacheNodes = {},
            waitingOn = [];

        let updatedCache = false;
        _.each(data.cacheList, (cacheNode) => {

            // All resources are built into /dist
            let dest = 'dist/resources/' + cacheNode.asset;

            // Is the destination directory available? If not we need to create those directories
            let destFolders = [path.dirname(dest)];
            while (!fs.existsSync(destFolders[destFolders.length-1])) {
                destFolders.push(path.dirname(destFolders[destFolders.length-1]));
            }

            // The last item is destFolders is a directory that exists
            for (let i=destFolders.length-2; i>=0; --i) {
                console.log(`Making directory: ${destFolders[i]}`);
                fs.mkdirSync(destFolders[i])
            }

            // Do we want to cache this asset into a binary format? (eg. packing, encrypting)
            if (cacheNode.options.cached) {

                if (cacheNode.options.packed) {
                    // Add to packed cache nodes list
                    if (!packedCacheNodes[cacheNode.asset]) packedCacheNodes[cacheNode.asset] = [];
                    packedCacheNodes[cacheNode.asset].push(cacheNode);
                    return;
                }

                let readRawAssetPromise = new Promise((success, fail) => {

                    // Load raw asset
                    // We want to check its hash in case it hasn't changed since the last time
                    const file     = cacheNode.rawAsset,
                        hash       = crypto.createHash('md5'),
                        rawAssetFd = fs.createReadStream(file);

                    rawAssetFd.on('end', () => {

                        // Finished piping raw asset into the hasher
                        hash.end();

                        const rawAssetHash = hash.read().toString('hex'),
                            cacheFile      = dest;

                        rawAssetFd.destroy();
                        hash.destroy();

                        // Has the raw asset changed?
                        if (!Settings.forceRebuild && rawAssetHash === cacheNode.rawAssetHash) {
                            // Asset hashes match (raw asset hasn't changed)
                            // Does the cache file still exist? It may have been intentinoally deleted for forceRebuild
                            if (fs.existsSync(cacheFile)) {
                                //console.log(`Asset ${cacheNode.rawAsset} hasn't changed since the last cache. Skipping`);
                                success();
                                return;
                            }
                        }

                        const buffer = new Uint8Array();
                        console.log(`Updating cache: ${cacheNode.name}`);
                        fs.readFile(file, (err, buffer) => {

                            // Prepare our write buffer (eg. encrypted file if necessary)
                            const readyToWritePromise = new Promise((bufferFetchSuccess, bufferFetchFail) => {

                                // Are we encrypting this file?
                                if (cacheNode.options.encrypted) {
                                    const options = {
                                        data: buffer,
                                        passwords: ['secret stuff'],
                                        armor: false
                                    };

                                    openpgp.encrypt(options).then((ciphertext) => {
                                        const encrypted = ciphertext.message.packets.write(); // get raw encrypted packets as Uint8Array
                                        bufferFetchSuccess(encrypted);
                                    }, bufferFetchFail);
                                } else {
                                    bufferFetchSuccess(buffer);
                                }
                            });

                            // Write our cached file
                            readyToWritePromise.then((writeBuffer) => {

                                fs.writeFile(cacheFile, writeBuffer, {
                                    encoding: 'binary',
                                    flag: 'w'
                                }, (err) => {
                                    console.log(`Wrote/Encrypted ${cacheFile}`);
                                    cacheNode.rawAssetHash = rawAssetHash;

                                    updatedCache = true;
                                    success();
                                });
                            }, (err) => {
                                console.error(`Error preparing write buffer for ${cacheFile}`);
                                fail(err);
                            });
                        });
                    });

                    rawAssetFd.pipe(hash);
                });

                waitingOn.push(readRawAssetPromise);

            } else {

                let processRawAssetPromise = new Promise((success, fail) => {

                    // Preprocessing raw asset -> asset, without any internal reformatting (eg. packing, encrypting)
                    if (!cacheNode.options.preprocess) {
                        console.log(`Copying raw asset ${cacheNode.rawAsset} -> ${dest}`);
                        fs.copyFile(cacheNode.rawAsset, dest, (err) => {

                            if (err) {
                                console.error(err);
                                fail();
                                return;
                            }

                            success();
                        });
                    } else {

                        // Preprocess raw asset
                        if (cacheNode.options.preprocess === "convert") {

                            exec(`convert ${cacheNode.rawAsset} ${dest}`, (err, stdout, stderr) => {

                                if (err) {
                                    // node couldn't execute the command
                                    console.error(`Error converting asset ${cacheNode.name}`);
                                    fail();
                                    return;
                                }

                                success();
                            });
                        } else {
                            console.error(`Unknown preprocess option (${cacheNode.options.preprocess}) for asset ${cacheNode.name}`);
                            fail();
                        }
                    }

                });

                waitingOn.push(processRawAssetPromise);
            }
        });

        //// Packed Cache Nodes: Each pack contains an array of cacheNodes
        //_.each(packedCacheNodes, (packList) => {
        //    // TODO: Convert full pack list into a single image
        //    // TODO: Check each raw asset hash against its asset's hash (in case it hasn't changed); if ANY of them in the
        //    // pack have changed, then we need to recache the entire pack
        //    // TODO: Encrypt shiz; Preprocess shiz (before/after packing)

        //});


        // Update our cache list file
        Promise.all(waitingOn).then(() => {

            if (!updatedCache) {
                console.log("Nothing to update");
                return;
            }

            // This was the last cache, write and close the cache file
            const prettyCache = JSON.stringify(data); // TODO Prettify cache json?
            fs.writeFile('resources/data/cache.json', prettyCache, function(err, bufferData){

                if (err) {
                    console.error(err);
                    return;
                }

                fs.copyFile('resources/data/cache.json', 'dist/resources/data/cache.json', (err) => {

                    if (err) {
                        console.error(`Error copying cache file`);
                        console.error(err);
                        return;
                    }

                    console.log("Successfully updated cache file");
                });
            });

        }, () => {
            console.error("There was an error building cache..");
        });
    });

//}).catch((err) => {
//    console.error(err);
//});
*/
