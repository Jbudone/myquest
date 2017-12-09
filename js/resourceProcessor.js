define(() => {

    const ResourceProcessor = {

        unpack: (res) => {
            return res;
        },

        pack: (res) => {
            return res;
        },

        cacheImage: (image) => {
            // Cache = xBytes + yBytes + width + height + data
        },

        readImage: (file) => {
            return new Promise((succeeded, failed) => {
                let strippedName = file.match(/[a-zA-Z0-9_\.]+$/); // FIXME: This is gross, shouldn't need to do this. Just use the name in the map/sheets/etc. files instead
                cacheFile = Resources.cache[strippedName[0]];

                if (!cacheFile) {
                    failed(`Could not find cache for ${file} (${strippedName})`);
                }




                const oReq = new XMLHttpRequest();
                oReq.open("GET", `cache/${cacheFile}`, true);
                oReq.responseType = "arraybuffer";
                oReq.onload = function (oEvent) {
                    // Note: not oReq.responseText
                    if (oReq.response) {
                        var byteArray = new Uint8ClampedArray(oReq.response);

                        const res = ResourceProcessor.unpack(byteArray);
                        if (res) {

                            let xBytes = byteArray[0],
                                yBytes = byteArray[1],
                                width  = _.reduceRight(byteArray.slice(2, 2 + xBytes), (sum, c) => 256 * sum + c, 0),
                                height = _.reduceRight(byteArray.slice(2 + xBytes, 2 + xBytes + yBytes), (sum, c) => 256 * sum + c, 0);
                                //data   = byteArray.slice(xBytes + yBytes + 2);


                            let dataLen = byteArray.length - xBytes - yBytes - 2,
                                offset = xBytes + yBytes + 2;
                            var data = new Uint8ClampedArray(dataLen);
                            const key = "fuckingassetlicenses".split('').map((c) => c.charCodeAt(0));
                            for (let i = 0; i < dataLen; ++i) {
                                data[i] = byteArray[offset + i] ^ key[i % key.length];
                            }


                            // Create bitmap image out of imagedata
                            let imageData = new ImageData(data, width, height);
                            createImageBitmap(imageData).then((bitmapImage) => {
                                succeeded(bitmapImage);
                            });
                            
                        } else {
                            failed(`Could not unpack cache ${cacheFile}`);
                        }
                    }
                };

                oReq.send(null);


            });
        }
    };

    return ResourceProcessor;
});
