
// Page
//
// Map is stored in pages; each page fills up the entire view of the screen. Pages are linked in an
// octree, and at any given moment the current page and its immediate neighbours are loaded into
// memory
define(
    [
        'eventful', 'movable', 'loggable', 'hookable'
    ],
    (
        Eventful, Movable, Loggable, Hookable
    ) => {

        const Page = function(area) {

            extendClass(this).with(Eventful);
            extendClass(this).with(Loggable);
            extendClass(this).with(Hookable);
            Ext.extend(this, 'page');

            this.baseTile = null; // TODO: Base tile
            this.tiles = []; // Specific tiles to render ontop of base

            this.sprites       = new Array();
            this.movables      = {};
            this.items         = {};
            this.interactables = {};

            // A matrix of collidable tiles; each element is a number which represents the i_th row of this page.  That
            // number is a bitmask where 1 represents a collision and 0 is an open tile
            this.collidables = new Array(Env.pageHeight);
            this.collidables.fill(0);

            this.updateList   = [];
            this.eventsBuffer = []; // To be sent out to connected users

            this.area  = area;
            this.index = null;
            this.x     = null;
            this.y     = null;
            this.neighbours = {
                northwest: null,
                north: null,
                northeast: null,
                southeast: null,
                south: null,
                southwest: null
            };

            // Entity zoning out of page
            this.zoneEntity = (newPage, entity) => {

                // Remove from this page
                if (!this.movables[entity.id]) throw Err(`Entity not in movables list (${entity.id})`);
                delete this.movables[entity.id];

                let foundEntity = false;
                for (let i = 0; i < this.updateList.length; ++i) {
                    if (this.updateList[i] === entity) {
                        this.updateList.splice(i, 1);
                        foundEntity = true;
                        break;
                    }
                }
                if (!foundEntity) throw Err(`Entity was not in update list ${entity.id}`);

                this.stopListeningTo(entity);

                // Add to new page
                // NOTE: if newPage === null then this is probably a client w/out the page loaded
                if (!newPage && Env.isServer) throw Err("No new page given for entity zoning");
                if (newPage) {
                    newPage.addEntity(entity);
                }

                entity.page = newPage;
            };

            // Add entity to page
            this.addEntity = (entity) => {

                if (this.movables[entity.id]) throw Err(`Entity (${entity.id}) already in movables`);
                this.movables[entity.id] = entity;
                this.updateList.push(entity);

                this.triggerEvent(EVT_ADDED_ENTITY, entity);
                this.Log(`Adding Entity[${entity.id}] to page: ${this.index}`, LOG_DEBUG);
            };

            // Update
            this.step = (time) => {

                this.handlePendingEvents();

                for (let i = 0; i < this.updateList.length; ++i) {
                    this.updateList[i].step(now());
                }
            };
        };

        return Page;
    });
