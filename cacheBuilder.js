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
    Promise         = require('bluebird'),
    chalk           = require('chalk'),
    prettyjson      = require('prettyjson'),
    assert          = require('assert'),    // TODO: Disable in production
    filepath        = require('path'),
    crypto          = require('crypto'),
    openpgp         = require('openpgp');

const Settings = {
    recache: false
}

// Process Server arguments
process.argv.forEach((val) => {

    if (val === "--recache") {
        console.log("Recaching all cache");
        Settings.recache = true;
    }
});

// Prepare openpgp stuff
openpgp.initWorker({ path: 'node_modules/openpgp/dist/openpgp.worker.js' }) // set the relative web worker path
openpgp.config.aead_protect = true // activate fast AES-GCM mode (not yet OpenPGP standard)

fs.readFile('data/cache.json', (err, bufferData) => {

    if (err) {
        console.error(`Error reading cache.json: ${err}`);
        return;
    }

    const data    = JSON.parse(bufferData),
        waitingOn = [];

    let updatedCache = false;
    _.each(data.cacheList, (cacheNode) => {

        // Do we want to process this resource in some way?
        if (!cacheNode.cached) {
            return;
        }

        let readRawAssetPromise = new Promise((success, fail) => {

            // Load raw asset
            // We want to check its hash in case it hasn't changed since the last time
            const file     = cacheNode.asset,
                hash       = crypto.createHash('md5'),
                rawAssetFd = fs.createReadStream(file);

            rawAssetFd.on('end', () => {

                // Finished piping raw asset into the hasher
                hash.end();

                const rawAssetHash = hash.read().toString('hex'),
                    cacheFile      = 'cache/' + cacheNode.cache;

                rawAssetFd.destroy();
                hash.destroy();

                // Has the raw asset changed?
                if (!Settings.recache && rawAssetHash === cacheNode.assetHash) {
                    // Asset hashes match (raw asset hasn't changed)
                    // Does the cache file still exist? It may have been intentinoally deleted for recache
                    if (fs.existsSync(cacheFile)) {
                        //console.log(`Asset ${cacheNode.asset} hasn't changed since the last cache. Skipping`);
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
                        if (cacheNode.encrypted) {
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
                            cacheNode.assetHash = rawAssetHash;

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
    });


    // Update our cache list file
    Promise.all(waitingOn).then(() => {

        if (!updatedCache) {
            console.log("Nothing to update");
            return;
        }

        // This was the last cache, write and close the cache file
        const prettyCache = JSON.stringify(data); // TODO Prettify cache json?
        fs.writeFile('data/cache.json', prettyCache, function(err, bufferData){

            if (err) {
                console.error(err);
                return;
            }

            console.log("Successfully updated cache file");
        });

    });
});
