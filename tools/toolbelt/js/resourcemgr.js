
const ResourceMgr = (new function(){


    const resFuncs = {
        default: {
            findResources: (data) => [],
            resType: (res) => null
        },

        sheets: {
            findResources: (data) => {
                return data.tilesheets.list;
            },

            resType: (res) => 'tilesheet'
        }
    };

    this.data = null;
    this.initialize = () => {

        // Add resource viewer element
        this.resourceMgrListEl = $('#resourceMgrList');

        // Load all resources
        return new Promise((success, fail) => {
            $.getJSON('/resources/data/resources.json', (data) => {

                const waitingOn = [];
                this.data = data;
                _.forEach(data, (resource, resourceKey) => {

                    // Load resource file
                    const file = resource.file;
                    waitingOn.push(new Promise((successRes, failRes) => {
                        $.getJSON(`/resources/data/${file}`, (resData) => {
                            resource.data = resData;
                            successRes();
                        });
                    }));

                    resource.funcs = _.defaults(resFuncs[resourceKey] || {}, resFuncs['default']);
                });

                Promise.all(waitingOn).then(success);
            });
        });
    };

    this.buildElements = () => {

        const allResources = [];
        _.forEach(this.data, (resource, resourceKey) => {
            const childResources = resource.funcs.findResources(resource.data);

            childResources.forEach((res) => {
                const resDetails = {
                    resType: resource.funcs.resType(res),
                    data: res,
                    resParent: resource,
                    resParentKey: resourceKey
                };
                allResources.push(resDetails);
            });
        });

        allResources.forEach((resDetails) => {
            const resEl = $('<a/>')
                            .attr('href', '#')
                            .addClass('resource')
                            .text(resDetails.data.image || resDetails.data.output || resDetails.data.id)
                            .click(() => {
                                const resType = resDetails.resType;
                                this.onSelectResource(resDetails);
                                return false;
                            });
            this.resourceMgrListEl.append(resEl);
        });
        console.log(allResources);
    };

    this.saveResource = (resParent) => {
        console.log(this.data);
        console.log(resParent);

        const data = JSON.stringify(resParent.data, null, 2),
            file   = `../../resources/data/${resParent.file}`;

        $.post('fs.php', { request: "save", data, file }, function(data){
            const json  = JSON.parse(data),
                success = !!json.success;
            console.log('saved sheets: '+(success?'true':'false'));
            console.log(json);

            if (success) {
                //finishedSaving();
                // FIXME
                console.log("Finished saving");

                $('#tilesheetControls').removeClass('pendingChanges');
            }
        });
    };

    this.rawImages = [];
    this.fetchRawImages = () => {
        return new Promise((succeeded, failed) => {
            $.post('fs.php', { request: "fetchImages" }, (data) => {
                const json = JSON.parse(data),
                    success = !!json.success;

                if (success) {
                    this.rawImages = json.data.split(' ');

                    const directoriedImages = {};
                    this.rawImages.forEach((image) => {
                        const path = image.split('/');

                        let curDir = directoriedImages;
                        for (let i = 0; i < path.length; ++i) {
                            if (!curDir[path[i]]) {

                                if (i === (path.length - 1)) {
                                    curDir[path[i]] = {
                                        image: true,
                                        pathTo: image
                                    };
                                } else {
                                    curDir[path[i]] = {};
                                }
                            }

                            curDir = curDir[path[i]];
                        }
                    });

                    succeeded(directoriedImages);
                } else {
                    failed();
                }
            });
        });
    };

    this.onSelectResource = () => {};
}());
