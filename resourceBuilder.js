// TODO:
//  - Avoid reading raw asset twice (once for hash, once for cache)


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
    exec            = require('child_process').exec;

const Settings = {
    forceRebuild: false
}

// Process Server arguments
process.argv.forEach((val) => {

    if (val === "--force-rebuild") {
        console.log("Recaching all resources");
        Settings.forceRebuild = true;
    }
});

// Prepare openpgp stuff
openpgp.initWorker({ path: 'node_modules/openpgp/dist/openpgp.worker.js' }) // set the relative web worker path
openpgp.config.aead_protect = true // activate fast AES-GCM mode (not yet OpenPGP standard)

fs.readFile('resources/data/cache.json', (err, bufferData) => {

    if (err) {
        console.error(`Error reading cache.json: ${err}`);
        return;
    }

    const data    = JSON.parse(bufferData),
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
                            console.error(`Error copying file asset ${cacheNode.name}`);
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
