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
    crypto          = require('crypto');

const sharp = require('sharp');

// TODO:
//  - Avoid reading raw asset twice (once for hash, once for cache)


fs.readFile('data/cache.json', function(err, bufferData){

    if (err) {
        return;
    }

    const data   = JSON.parse(bufferData);

    let updatedCache = false;

    const waitingOn = [];

    _.each(data.cacheList, (cacheNode) => {


        let imgPromise = new Promise((success, fail) => {

            // Load raw asset
            // We want to check its hash in case it hasn't changed since the last time
            const file     = `sprites/${cacheNode.asset}`,
                hash       = crypto.createHash('md5'),
                rawAssetFd = fs.createReadStream(file);

            rawAssetFd.on('end', () => {

                // Finished piping raw asset into the hasher
                hash.end();
                const rawAssetHash = hash.read().toString('hex'),
                    cacheFile      = 'cache/' + cacheNode.cache;

                // Has the raw asset changed?
                if (rawAssetHash === cacheNode.assetHash) {
                    // Asset hashes match (raw asset hasn't changed)
                    // Does the cache file still exist? It may have been intentinoally deleted for recache
                    if (fs.existsSync(cacheFile)) {
                        //console.log(`Asset ${cacheNode.asset} hasn't changed since the last cache. Skipping`);
                        success();
                        return;
                    }
                }

                console.log(`Updating cache: ${cacheNode.name}`);
                rawAssetFd.destroy();
                hash.destroy();
                        
                // If its an image then we need to load it through an image, rather than the actual image data
                // TODO: It sucks that we need to read this asset twice; can we avoid that?
                sharp(file).raw().toBuffer((err, imgData, info) => {

                    //console.log(imgData.toString('hex'));
                    fs.open(cacheFile, 'w', (err, fd) => {
                        // => [Error: EISDIR: illegal operation on a directory, open <directory>]
                        if (err) {
                            console.error("Could not open cache file");
                            return;
                        }

                        let wBytes = 0,
                            hBytes = 0,
                            wBuff = info.width,
                            hBuff = info.height,
                            arr = [];

                        arr.push(0);
                        arr.push(0);
                        while (wBuff > 0) {
                            ++wBytes;
                            arr.push(wBuff % (1 << 8));
                            wBuff = wBuff >> 8;
                        }
                        arr[0] = wBytes;

                        while (hBuff > 0) {
                            ++hBytes;
                            arr.push(hBuff % (1 << 8));
                            hBuff = hBuff >> 8;
                        }
                        arr[1] = hBytes;

                        const arrBuff = new Uint8ClampedArray(arr.length);
                        for (let i = 0; i < arr.length; ++i) {
                            arrBuff[i] = arr[i];
                        }

                        let buf = Buffer.from(arrBuff);
                        let cursor = fs.write(fd, buf, () => {
                            let imgBuf = new Buffer(imgData.length);
                            let notAZero = 0;
                            const key = "fuckingassetlicenses".split('').map((c) => c.charCodeAt(0));
                            for (let i = 0; i < imgBuf.length; ++i) {
                                imgBuf[i] = imgData[i] ^ key[i % key.length];
                                if (imgBuf[i] != 0) ++notAZero;
                            }
                            fs.write(fd, imgBuf, 0, 'binary', () => {
                                fs.close(fd, () => {
                                    console.log(`Wrote ${cacheFile}: ${info.width}x${info.height} (${wBytes}x${hBytes});  ${imgData.length} -- ${notAZero}`);
                                    cacheNode.assetHash = rawAssetHash;

                                    updatedCache = true;
                                    success();
                                });
                            });
                        });
                    });
                });


            });

            rawAssetFd.pipe(hash);


        });

        waitingOn.push(imgPromise);
    });


    Promise.all(waitingOn).then(() => {

        if (!updatedCache) {
            console.log("Nothing to update");
            return;
        }

        const prettyCache = JSON.stringify(data);
        console.log(prettyCache);

        // This was the last cache, write and close the cache file
        fs.writeFile('data/cache.json', prettyCache, function(err, bufferData){

            if (err) {
                console.error(err);
                return;
            }

            console.log("Successfully updated cache file");
        });

    });
});
