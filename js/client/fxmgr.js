define(['loggable'], (Loggable) => {

    const SoundSystem = function() {

        const SoundInstance = function() {

            this.onFinished = function(){};
            this.gainNode = null;
        };

        const audioContext = new AudioContext();

        // NOTE: It would be awesome to have a pool of inactive audio buffer sources, then recycle those. The problem is
        // that buffers are immutable after being set for the first time, so essentially they're one-off nodes. Would be
        // worth it to look into other performance optimizations for audio
        //this.inactiveSources = [];
        this.activeSources = [];

        this.loadSample = (sample) => {

            return new Promise((success, fail) => {
                const request = new XMLHttpRequest();
                request.open('GET', sample.sound, true);
                request.responseType = 'arraybuffer';

                // Decode asynchronously
                request.onload = function() {
                    audioContext.decodeAudioData(request.response, (buffer) => {
                        sample.buffer = buffer;
                        success();
                    }, (e) => {
                        fail(e);
                        throw Err(e);
                    });
                }
                request.send();
            });
        };

        this.playSample = (sample, gain) => {

            const soundInstance = new SoundInstance;
            const source = audioContext.createBufferSource();

            // TODO: See this.inactiveSources
            //let source = null;
            //if (this.inactiveSources.length === 0) {
            //    // Create another source
            //    const newSource = audioContext.createBufferSource();
            //    this.inactiveSources.push(newSource);
            //}

            //source = this.inactiveSources.pop();

            source.onended = (evt) => {
                //this.inactiveSources.push(source);
                soundInstance.onFinished();
                _.pull(this.activeSources, soundInstance);
            };

            source.buffer = sample.buffer;

            let rightMostNode = source;

            // Gain Node
            {
                soundInstance.regionGain = gain / FX.settings.volume;
                soundInstance.sampleGain = sample.gain || 1.0;

                if (sample.gain) gain *= sample.gain;
                const gainNode = audioContext.createGain();
                gainNode.gain.value = gain;

                source.connect(gainNode);
                rightMostNode = gainNode;

                soundInstance.gainNode = gainNode;
            }

            rightMostNode.connect(audioContext.destination);
            source.start(0); 

            this.activeSources.push(soundInstance);
            return soundInstance;
        };

        this.playBank = (bank, gain) => {
            const numSamples  = bank.samples.length,
                randSampleIdx = parseInt(Math.random() * numSamples, 10),
                sample        = bank.samples[randSampleIdx];

            const soundInstance = this.playSample(sample, gain);
            return soundInstance;
        };

        this.adjustVolume = (volume) => {
            this.activeSources.forEach((soundInstance) => {
                const gain = soundInstance.regionGain * soundInstance.sampleGain * volume;
                soundInstance.gainNode.gain.value = gain;
            });
        };
    };

    const SoundSys = new SoundSystem();

    const FXMgr = (function(){

        extendClass(this).with(Loggable);

        const _FXMgr = this;

        this.setLogGroup('FX');
        this.setLogPrefix('FX');

        this.fxEvents = {};

        this.transformEvent = (evt, ctx, args) => {
            // FIXME: Check ctx type, movable then use npc name
            // FIXME: There's got to be a better way to transform events when we get a type/trait system in place

            let ctxName = "";
            if (ctx instanceof Movable) {
                ctxName = ctx.npc.name;
            }

            let refinedEvent = `${evt}.${ctxName}`;
            if (this.fxEvents[refinedEvent]) {
                return refinedEvent;
            }

            // No refined event was found, just go with the base event
            return evt;
        };

        const FXEntity = function(ent, region) {

            this.entity = ent;
            this.region = region;

            this.activeFX = [];

            this.playFX = (fx) => {
                const gain   = this.region.gain * FX.settings.volume,
                    instance = SoundSys.playBank(fx.bank, gain);
                this.activeFX.push(instance);

                instance.onFinished = () => {
                    _.pull(this.activeFX, instance);
                };
            };

            this.pushFX = (fx) => {
                // FIXME: handle conditions in there and playing sound
                this.playFX(fx);
            };
        };

        this.regions = {};
        this.samples = {};
        this.soundBanks = {};

        this.fetchEntityInRegion = (region, entity) => {

            let entID = null, ent = null;

            if (entity instanceof Movable) {
                assert('id' in entity, "Entity does not have id!"); // FIXME: Different entities have different id's (eg. UI entity, movable, character, etc.)
                entID = entity.id;
                ent = region.entities[entID];
            } else {
                // Entity does not have an id, lets see if we can find it ourselves
                // FIXME: Would be nice to create an id for entities somehow (hash from some values?)
                ent = _.find(region.entities, (rEntity) => rEntity.entity === entity);

                if (!ent) {
                    entID = _.size(region.entities);
                }
            }

            if (!ent) {
                ent = new FXEntity(entity, region);
                region.entities[entID] = ent;
            }

            return ent;
        };

        this.bgEvent = (evt, args) => {
            const fx = this.fxEvents[evt];
            const ent = this.fetchEntityInRegion(fx.region, this);
            ent.pushFX(fx);
        };

        this.event = (evt, ctx, args) => {
            this.Log(`Got event: ${evt}`);
            if (!this.initialized) return;
            if (!ctx) {
                this.bgEvent(evt, args);
                return;
            }

            const transformedEvent = this.transformEvent(evt, ctx, args);
            if (transformedEvent) {
                const fx = this.fxEvents[transformedEvent];
                if (fx) {
                    const ent = this.fetchEntityInRegion(fx.region, ctx);
                    ent.pushFX(fx);
                }
            }
        };

        this.addEvent = (evtSymbol, evt) => {

            assert(!(evtSymbol in this.fxEvents), `Symbol ${evtSymbol} already exists in fx list!`);

            const region = this.regions[evt.region];
            assert(region, `Region ${evt.region} not added yet!`);
            evt.region = region;

            const soundBank = this.soundBanks[evt.bank];
            assert(soundBank, `Bank ${evt.bank} not added yet!`);
            evt.bank = this.soundBanks[evt.bank];

            this.fxEvents[evtSymbol] = {
                region: evt.region,
                bank: evt.bank,
                conditions: evt.conditions
            };
        };

        this.addRegion = (region) => {
            // FIXME: Pass flags on here (eg. dontPlayOnEntity)
            this.regions[region.name] = {
                entities: {},
                gain: region.gain || 1.0
            };
        };

        this.addBank = (bank) => {
            this.soundBanks[bank.name] = bank;

            // Swap in samples
            const samplesRes = [];
            bank.samples.forEach((sampleName) => {
                const sample = this.samples[sampleName];
                assert(sample, `Sample ${sampleName} not found`);

                samplesRes.push(sample);
            });

            bank.samples = samplesRes;
        };

        this.addSample = (sample) => {
            this.samples[sample.name] = sample;

            return new Promise((success, fail) => {
                SoundSys.loadSample(sample).then(success, fail);
            });
        };

        this.settings = {
            volume: 1.0
        };

        this.setVolume = (volume) => {
            this.settings.volume = volume;
            SoundSys.adjustVolume(volume);
        };

        this.initialized = false;
        this.initialize = (asset) => {

            return new Promise((success, fail) => {

                _.forEach(asset.regions, (region, name) => {
                    region.name = name;
                    this.addRegion(region);
                });

                const SFX = asset.sfx;

                const loadingSamples = [];
                _.forEach(SFX.samples, (sample, name) => {
                    sample.name = name;
                    loadingSamples.push(this.addSample(sample));
                });

                _.forEach(SFX.banks, (bank, name) => {
                    bank.name = name;
                    this.addBank(bank);
                });

                _.forEach(asset.events, (event, name) => {
                    this.addEvent(name, event);
                });

                _.forEach(asset.settings, (value, name) => {
                    this.settings[name] = value;
                });

                Promise.all(loadingSamples).then(() => {
                    this.initialized = true;
                    success();
                });
            });
        };
    });

    return FXMgr;
});
