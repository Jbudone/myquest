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

const sharp = require('sharp');//,
    //Crypto  = require('crypto-js');

// TODO:
//  - Crypto cache
//  - Update cache.json after all cache has finished writing (currently happens multiple times)


fs.readFile('data/cache.json', function(err, bufferData){

    if (err) {
        return;
    }

    const data   = JSON.parse(bufferData);

    let updatedCache = false,
        waitingCount = 0;

    _.each(data.cacheList, (cacheNode) => {

        // Load raw asset
        const file = `sprites/${cacheNode.asset}`;

        const cacheFile = 'cache/' + cacheNode.cache;
        const rawAssetHash = null;

        //console.log("Going to read cache file: " + file);
        //let hash = crypto.createHash('md5');
        //let fd1 = fs.createReadStream(file);

        //fd1.on('end', () => {
        //    hash.end();
        //    const rawAssetHash = hash.read().toString('hex'),
        //        cacheFile      = 'cache/' + cacheNode.cache;

        //    //if (rawAssetHash === cacheNode.assetHash) {
        //    //    // Asset hashes match (raw asset hasn't changed)
        //    //    // Does the cache file still exist? It may have been intentinoally deleted for recache
        //    //    if (fs.existsSync(cacheFile)) {
        //    //        console.log(`Asset ${cacheNode.asset} hasn't changed since the last cache. Skipping`);
        //    //        return;
        //    //    }
        //    //}


        //    console.log(`Updating cache: ${cacheNode.name}`);
        //    fd1.destroy();
        //    hash.destroy();


            // If its an image then we need to load it through an image, rather than the actual image data
            const img = sharp(file);
                
            ++waitingCount; // FIXME: This does *not* work
            img.raw().toBuffer((err, imgData, info) => {

                //console.log(imgData.toString('hex'));
                fs.open(cacheFile, 'w', (err, fd) => {
                    // => [Error: EISDIR: illegal operation on a directory, open <directory>]
                    --waitingCount;
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
                    let cursor = fs.writeSync(fd, buf);
                    //fs.writeSync(fd, wBytes);
                    //fs.writeSync(fd, hBytes);
                    //fs.writeSync(fd, metadata.width);
                    //fs.writeSync(fd, metadata.height);

                    let imgBuf = new Buffer(imgData.length);
                    let notAZero = 0;
                    const key = "fuckingassetlicenses".split('').map((c) => c.charCodeAt(0));
                    for (let i = 0; i < imgBuf.length; ++i) {
                        imgBuf[i] = imgData[i] ^ key[i % key.length];
                        if (imgBuf[i] != 0) ++notAZero;
                    }
                    fs.writeSync(fd, imgBuf, 0, 'binary');
                    fs.closeSync(fd);

                    console.log(`Wrote ${cacheFile}: ${info.width} / ${info.height} (${wBytes} / ${hBytes});  ${imgData.length} -- ${notAZero}`);
                    cacheNode.assetHash = rawAssetHash;

                    // Are we done yet?
                    if (waitingCount === 0) {

                        const prettyCache = JSON.stringify(data);

                        // This was the last cache, write and close the cache file
                        fs.writeFile('data/cache.json', prettyCache, function(err, bufferData){

                            if (err) {
                                console.error(err);
                                return;
                            }

                            console.log("Successfully updated cache file");
                        });

                    }
                });



            });


        //});

        //fd1.pipe(hash);
    });
});
