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
    filepath        = require('path');

const sharp = require('sharp');



// TODO
//  - Read cache list/resource
//  - FOr each cache item -- load raw asset, cache, write to cache

fs.readFile('data/cache.json', function(err, bufferData){

    if (err) {
        return;
    }

    const data = JSON.parse(bufferData);

    _.each(data, (cacheName, rawAssetName) => {
        console.log(rawAssetName);

        // Load raw asset
        // FIXME: Should have a name for the asset, and file location
        file = `sprites/${rawAssetName}`;

        const cacheFile = 'cache/' + cacheName;

        // If its an image then we need to load it through an image, rather than the actual image data
        const img = sharp(file);
            
        img.raw().toBuffer((err, imgData, info) => {

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
                let cursor = fs.writeSync(fd, buf);
                //fs.writeSync(fd, wBytes);
                //fs.writeSync(fd, hBytes);
                //fs.writeSync(fd, metadata.width);
                //fs.writeSync(fd, metadata.height);

                let imgBuf = new Buffer(imgData.length);
                const key = "fuckingassetlicenses".split('').map((c) => c.charCodeAt(0));
                for (let i = 0; i < imgBuf.length; ++i) {
                    imgBuf[i] = imgData[i] ^ key[i % key.length];
                }

                fs.writeSync(fd, imgBuf, 0, 'binary');
                fs.closeSync(fd);

                console.log(`Wrote ${cacheFile}: ${info.width} / ${info.height} (${wBytes} / ${hBytes});  ${imgData.length}`);
            });
        });
    });
});
