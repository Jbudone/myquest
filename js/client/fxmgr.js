define(['loggable'], (Loggable) => {

    const SoundSystem = function() {

        const SoundInstance = function() {

            this.onFinished = function(){};
        };

        const audioContext = new AudioContext();

        // NOTE: It would be awesome to have a pool of inactive audio buffer sources, then recycle those. The problem is
        // that buffers are immutable after being set for the first time, so essentially they're one-off nodes. Would be
        // worth it to look into other performance optimizations for audio
        //this.inactiveSources = [];

        this.loadSample = (sample) => {

            const request = new XMLHttpRequest();
            request.open('GET', sample.sound, true);
            request.responseType = 'arraybuffer';

            // Decode asynchronously
            request.onload = function() {
                audioContext.decodeAudioData(request.response, (buffer) => {
                    sample.buffer = buffer;
                }, (e) => {
                    throw Err(e);
                });
            }
            request.send();

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
            };

            source.buffer = sample.buffer;

            let rightMostNode = source;

            {
                if (sample.gain) gain *= sample.gain;
            }

            // Gain Node
            if (gain !== 1.0) {
                const gainNode = audioContext.createGain();
                gainNode.gain.value = gain;

                source.connect(gainNode);
                rightMostNode = gainNode;
            }

            rightMostNode.connect(audioContext.destination);
            source.start(0); 

            return soundInstance;
        };

        this.playBank = (bank, gain) => {
            const numSamples  = bank.samples.length,
                randSampleIdx = parseInt(Math.random() * numSamples, 10),
                sample        = bank.samples[randSampleIdx];

            const soundInstance = this.playSample(sample, gain);
            return soundInstance;
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
            let ctxName = ctx.npc.name,
                refinedEvent = `${evt}.${ctxName}`;
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
            assert('id' in entity, "Entity does not have id!"); // FIXME: Different entities have different id's (eg. UI entity, movable, character, etc.)
            const entID = entity.id;
            let ent = region.entities[entID];
            if (!ent) {
                ent = new FXEntity(entity, region);
                region.entities[entID] = ent;
            }

            return ent;
        };

        this.event = (evt, ctx, args) => {
            this.Log(`Got event: ${evt}`);
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

            SoundSys.loadSample(sample);
        };

        this.settings = {
            volume: 1.0
        };

        this.initialize = (asset) => {

            _.forEach(asset.regions, (region, name) => {
                region.name = name;
                this.addRegion(region);
            });

            const SFX = asset.sfx;
            _.forEach(SFX.samples, (sample, name) => {
                sample.name = name;
                this.addSample(sample);
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
        };

        this.initialize(Resources.fx);
    });

    return FXMgr;
});
