define(() => {

    const ResourceProcessor = {

        unpack: (res) => {
            return res;
        },

        pack: (res) => {
            return res;
        },

        readImage: (name) => {
            return new Promise((succeeded, failed) => {
                let mediaNode = Resources.sheets[name] || Resources.sprites[name] || Resources.media.list.find((el) => el.name === name);
                assert(mediaNode, `Could not find node for ${name}`);

                // FIXME: We have the ability to process images in binary format separately (eg. encrypted images;
                // packed images)
                // Send an XHR request in order to open the file in a binary format, and process/read it accordingly
                if (mediaNode.options.encrypted) {

                    const assetFile = mediaNode.file;

                    if (!assetFile) {
                        failed(`Could not find media for ${file} (${assetFile})`);
                    }

                    // TODO: Should offload this stuff into webworkers
                    const oReq = new XMLHttpRequest();
                    oReq.open("GET", assetFile, true);
                    oReq.responseType = "arraybuffer";
                    oReq.onload = (oEvent) => {

                        if (oReq.response) {
                            if (mediaNode.options.encrypted) {

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
                        throw Err(`Error loading img: ${mediaNode.file}`);
                    };

                    const url = mediaNode.file;
                    img.src = url;
                }
            });
        }
    };

    return ResourceProcessor;
});
