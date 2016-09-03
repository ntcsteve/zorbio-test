var ZOR = ZOR || {};

ZOR.Sounds = (function ZORSounds() {

    var sounds = {
        sfx: {
            // a chime sound for food capture
            food_capture: new Wad({
                source: 'sine',
                volume: config.VOLUME_FOOD_CAPTURE,
                env: {
                    attack: 0.001,
                    decay: 0.001,
                    sustain: .9,
                    hold: 0.1,
                    release: 0.5
                },
            }),
            woosh: new Wad({
                source: 'noise',
                volume: 0.35,
                env: {
                    attack: 0.5,
                    decay: 0.5,
                    sustain: 1,
                    hold: 3600, // a long time... 1 hour
                    release: .5
                },
                filter: {
                    type: 'lowpass',
                    frequency: 300,
                    q: 1.0
                },
            }),
            state_change: new Wad({
                source: 'sine',
                volume: config.VOLUME_SFX_INITIAL,
                pitch: config.SFX_FOOD_CAPTURE_TONES[2],
                env: {
                    attack: 0.1,
                    decay: 0.001,
                    sustain: 0.1,
                    hold: 0.1,
                    release: 0.1
                },
            }),
            player_capture: new Wad({
                volume: config.VOLUME_SFX_INITIAL,
                source: 'sfx/player_capture.wav',
            }),
        },
    };

    if (!config.MUSIC_ENABLED) {
        sounds.music = {};
    }

    return sounds;

})();
