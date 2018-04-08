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

        readImage: (name) => {
            return new Promise((succeeded, failed) => {
                const cacheNode = Resources.cache.cacheList.find((el) => el.name === name);
                assert(cacheNode, `Could not find cache for ${name}`);

                // Has the file been cached? If so then we must send an XHR request in order to open the file in a
                // binary format, and process/read it accordingly
                if (cacheNode.options.cached) {

                    const assetFile = '/dist/resources/' + cacheNode.asset;

                    if (!assetFile) {
                        failed(`Could not find cache for ${file} (${assetFile})`);
                    }

                    // TODO: Should offload this stuff into webworkers
                    const oReq = new XMLHttpRequest();
                    oReq.open("GET", assetFile, true);
                    oReq.responseType = "arraybuffer";
                    oReq.onload = (oEvent) => {

                        if (oReq.response) {
                            if (cacheNode.options.encrypted) {

                                const encrypted = new Uint8Array(oReq.response),
                                    options     = {
                                        message: openpgp.message.read(encrypted), // parse encrypted bytes
                                        password: 'secret stuff',                 // decrypt with password
                                        format: 'binary'                          // output as Uint8Array
                                    };

                                openpgp.decrypt(options).then((plaintext) => {

                                    const blob = new Blob([plaintext.data]),
                                        url    = URL.createObjectURL(blob),
                                        img    = new Image();

                                    img.onload = function() {
                                        URL.revokeObjectURL(this.src); // free memory held by Object URL

                                        createImageBitmap(this).then((bitmapImage) => {
                                            succeeded(bitmapImage);
                                        }, (err) => {
                                            console.error(err);
                                        });
                                    };

                                    img.src = url;
                                });
                            } else {

                                const byteArray = new Uint8ClampedArray(oReq.response),
                                    blob        = new Blob([byteArray]),
                                    url         = URL.createObjectURL(blob),
                                    img         = new Image();

                                img.onload = function() {
                                    URL.revokeObjectURL(this.src); // free memory held by Object URL

                                    createImageBitmap(this).then((bitmapImage) => {
                                        succeeded(bitmapImage);
                                    }, (err) => {
                                        console.error(err);
                                    });
                                };

                                img.src = url;
                            }
                        }
                    };

                    oReq.send(null);

                } else {

                    const img = new Image();
                    img.onload = function() {
                        createImageBitmap(this).then((bitmapImage) => {
                            succeeded(bitmapImage);
                        }, (err) => {
                            console.error(err);
                        });
                    };

                    img.onerror = function() {
                        throw Err(`Error loading img: ${cacheNode.asset}`);
                    };

                    const url = '/dist/resources/' + cacheNode.asset;
                    img.src = url;
                }
            });
        }
    };

    return ResourceProcessor;
});
