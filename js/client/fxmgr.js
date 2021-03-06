define(['loggable'], (Loggable) => {

    const SoundSystem = function() {

        const SoundInstance = function() {

            this.onFinished = function(){};

            this.gainNode = null;
            this.sourceNode = null;

            this.stop = () => {
                this.sourceNode.stop();
                this.sourceNode.disconnect(0);
                this.gainNode.disconnect(0);
            };

            this.fadeOut = () => {
                this.gainNode.gain.linearRampToValueAtTime(0.0, audioContext.currentTime + 2.0);
            };
            this.fadeIn = () => {
                const gain = this.gainNode.gain.value;
                this.gainNode.gain.linearRampToValueAtTime(gain, audioContext.currentTime + 2.0);
            };
        };

        let audioContext = new AudioContext();
        this.audioContext = audioContext;

        // NOTE: It would be awesome to have a pool of inactive audio buffer sources, then recycle those. The problem is
        // that buffers are immutable after being set for the first time, so essentially they're one-off nodes. Would be
        // worth it to look into other performance optimizations for audio
        //this.inactiveSources = [];
        this.activeSources = [];

        this.loadSample = (sample) => {

            return new Promise((success, fail) => {
                const fetchSoundPromise = Resources.fetchSound(sample.sound);
                fetchSoundPromise.then((response) => {

                    audioContext.decodeAudioData(response, (buffer) => {
                        sample.buffer = buffer;
                        success();
                    }, (e) => {
                        fail(e);
                        throw Err(e);
                    });
                }, (err) => {
                    fail(err);
                    throw Err(err);
                });
            });
        };

        this.playSample = (sample, region) => {

            const soundInstance = new SoundInstance();
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
                soundInstance.regionGain = region.gain;
                soundInstance.sampleGain = sample.gain || 1.0;

                let gain = FX.settings.volume;
                if ('gain' in region) gain *= region.gain;
                if ('gain' in sample) gain *= sample.gain;
                const gainNode = audioContext.createGain();
                gainNode.gain.value = gain;

                source.connect(gainNode);
                rightMostNode = gainNode;

                soundInstance.gainNode = gainNode;
            }

            rightMostNode.connect(audioContext.destination);
            source.start(0); 

            this.activeSources.push(soundInstance);

            soundInstance.sourceNode = source;
            return soundInstance;
        };

        this.playBank = (bank, region) => {
            const numSamples  = bank.samples.length,
                randSampleIdx = parseInt(Math.random() * numSamples, 10),
                sample        = bank.samples[randSampleIdx];

            const soundInstance = this.playSample(sample, region);
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


    const BackgroundSystem = function() {

        let lastUpdate = now();
        this.layers = [];
        this.activeLayers = [];
        this.primaryLayer = null;

        this.initialize = (bgLayers) => {

            bgLayers.forEach((layer) => {
                const layerEl = $('<div/>')
                                .addClass('bgLayer')
                                .css({
                                    'background-image': `url(${layer.src})`,
                                    'background-repeat': 'repeat',
                                    'background-position-x': 0
                                })
                                .appendTo( $('#screenBackground') );

                const layerObj = {
                    layerEl: layerEl,
                    offset: 0,
                    moveSpeed: layer.moveSpeed
                };

                if (layer.primary) {
                    this.primaryLayer = layerObj;

                    layerEl.css({
                        'background-color': '#FFF',
                        'background-blend-mode': 'multiply'
                    });
                }

                this.layers.push(layerObj);
                if (layer.moveSpeed > 0) {
                    this.activeLayers.push(layerObj);
                }
            });
        };

        this.step = (time) => {

            const delta = time - lastUpdate;
            if (delta < 60) return; // Otherwise moves are too small

            this.activeLayers.forEach((layer) => {
                const moveAmount = delta * layer.moveSpeed;
                if (moveAmount > 0) {
                    const elOffset = Math.floor(layer.offset);
                    layer.offset = (layer.offset + moveAmount) % $(layer.layerEl).width();
                    const newElOffset = Math.floor(layer.offset);

                    if (elOffset !== newElOffset) {
                        $(layer.layerEl).css({ 'background-position-x': newElOffset });
                    }
                }
            });

            lastUpdate = time;
        };
    };

    const BackgroundSys = new BackgroundSystem();




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
                ctxName = ctx.npc.type;
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
                const instance = SoundSys.playBank(fx.bank, this.region);
                this.activeFX.push(instance);

                // Is only one sample allowed to play at a time in this region? Fade between previous sound instance and
                // next
                if (this.region.fadeBetweenSamples) {

                    // We're fading between the previous sound and this sound
                    // FIXME: Find the highest gain FX and kick out the other ones
                    let activeFXCount = this.activeFX.length;
                    while (this.activeFX.length > 2) {
                        this.activeFX[0].stop();
                        if (this.activeFX.length === activeFXCount) {
                            // Hasn't had a chance to stop yet, pull it immediately!
                            _.pull(this.activeFX, instance);
                        }
                    }

                    if (this.activeFX.length === 2) {
                        this.activeFX[0].fadeOut();
                        this.activeFX[0].onFinished(); // FIXME: Seems fadeOut doesn't have a callback to the sample finishing
                    }

                    instance.fadeIn();
                }

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
                gain: region.gain || 1.0,
                fadeBetweenSamples: region.fadeBetweenSamples
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

                BackgroundSys.initialize(asset.backgroundLayers);

                Promise.all(loadingSamples).then(() => {
                    this.initialized = true;
                    success();
                });
            });
        };

        this.step = (time) => {

            // We may have not successfully started the audio context; if not then we needed to wait for user input
            // before we could resume. Attempt to resume now
            //
            // Error: The AudioContext was not allowed to start. It must be resume (or created) after a user gesture on the page. https://goo.gl/7K7WLu
            if (SoundSys.audioContext.state === 'suspended') {
                SoundSys.audioContext.resume();

                if (SoundSys.audioContext.state !== 'suspended') {
                    this.setVolume( this.settings.volume );
                }
            }

            BackgroundSys.step(time);
        };
    });

    return FXMgr;
});
