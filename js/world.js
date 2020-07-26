define(['loggable', 'eventful', 'area'], (Loggable, Eventful, Area) => {

    const World = function() {

        Ext.extend(this,'world');
        extendClass(this).with(Eventful);

        extendClass(this).with(Loggable);
        this.setLogPrefix('world');

        this.areas = {};
        this.addArea = (id) => {
            if (!this.areas[id]) {
                this.Log(`Adding area to world: ${id}`);

                const area = new Area(id);
                area.loadArea();
                this.areas[id] = area;

                this.listenTo(area, EVT_ZONE_OUT, (oldArea, oldPage, entity, zone) => {
                    this.Log(zone, LOG_DEBUG);

                    const area = this.areas[zone.area];

                    this.Log(`Zoning user [${entity.id}] to new area..`, LOG_INFO);

                    oldArea.removeEntity(entity);
                    const page = area.zoneIn(entity, zone);
                    entity.triggerEvent(EVT_ZONE_OUT, oldArea, oldPage, area, page, zone);
                    entity.isZoning = true; // FIXME: this is a quickfix to tell the movement not to update position in movable.js
                });
            }
        };

        this.start = () => {
            _.forEach(this.areas, (area, areaID) => {
                area.start();
            });
        };

        this.step = (time) => {
            this.handlePendingEvents();

            let lag = time;
            const eventsBuffer = {};
            for (const areaID in this.areas) {
                const beforeStep = now(),
                    areaEvents   = this.areas[areaID].step(lag);

                if (areaEvents) eventsBuffer[areaID] = areaEvents;

                lag += (now() - beforeStep);
            }

            return eventsBuffer;
        };
    };

    return World;
});
