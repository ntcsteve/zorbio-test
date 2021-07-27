// ESLint global declarations: https://eslint.org/docs/rules/no-undef
/*
global ZOR:true
*/

const NODEJS_SKINS = typeof module !== 'undefined' && module.exports;

ZOR.SkinCatalog = {
    default: {
        name: 'default',
        type: 'custom',
        friendly_name: 'Smooth Shade',
        preview: 'skins/default/thumb.jpg',
        sort: 1,
    },
    earth: {
        name: 'earth',
        type: 'standard',
        friendly_name: 'Planet Earth',
        color: '#B9D5EB',
        trail: 'particle',
        capture: 'fiery_explosion',
        preview: 'skins/images/earth_thumb.jpg',
        texture: 'skins/images/earth_texture.jpg',
        sort: 2,
    },
    jupiter: {
        name: 'jupiter',
        type: 'standard',
        friendly_name: 'Jupiter',
        color: '#fcb765',
        trail: 'particle',
        capture: 'fiery_explosion',
        preview: 'skins/images/jupiter-thumb.png',
        texture: 'skins/images/jupiter-1k-oil.jpg',
        sort: 3,
    },
    neptune: {
        name: 'neptune',
        type: 'standard',
        friendly_name: 'Neptune',
        color: '#6087ec',
        trail: 'line',
        capture: 'bubbles',
        preview: 'skins/images/neptune-thumb.png',
        texture: 'skins/images/neptune-1k-oil.jpg',
        sort: 4,
    },
    uranus: {
        name: 'uranus',
        type: 'standard',
        friendly_name: 'Uranus',
        color: '#95bccb',
        trail: 'line',
        capture: 'bubbles',
        preview: 'skins/images/uranus-thumb.png',
        texture: 'skins/images/uranus-1k-oil.jpg',
        sort: 7,
    },
    venus: {
        name: 'venus',
        type: 'standard',
        friendly_name: 'Venus',
        color: '#fedd7d',
        trail: 'particle',
        capture: 'fiery_explosion',
        preview: 'skins/images/venus-thumb.png',
        texture: 'skins/images/venus-1k-oil.jpg',
        sort: 6,
    },
    mars: {
        name: 'mars',
        type: 'standard',
        friendly_name: 'Mars',
        color: '#d45510',
        trail: 'particle',
        capture: 'fiery_explosion',
        preview: 'skins/images/mars-thumb.png',
        texture: 'skins/images/mars-1k-oil.jpg',
        sort: 5,
    },
    kitten: {
        name: 'kitten',
        type: 'standard',
        friendly_name: 'Cute Kitten',
        color: '#FFFFFF',
        trail: 'particle',
        capture: 'bubbles',
        preview: 'skins/images/kitten_thumb.png',
        texture: 'skins/images/kitten_texture.png',
        unlock_url: '?kitten',
        sort: 0,
    },
    boing: {
        friendly_name: 'Boing',
        type: 'custom',
        name: 'boing',
        preview: 'skins/boing/thumb.jpg',
        sort: 8,
    },
    reddit: {
        name: 'reddit',
        type: 'standard',
        friendly_name: 'Reddit',
        color: '#FF431D',
        trail: 'line',
        capture: 'fiery_explosion',
        preview: 'skins/images/reddit_thumb.png',
        texture: 'skins/images/reddit_texture.jpg',
        unlock_url: '?reddit',
        sort: 0,
    },
    lyons: {
        name: 'lyons',
        type: 'standard',
        friendly_name: 'Paul Lyons',
        color: '#FF431D',
        trail: 'particle',
        capture: 'bubbles',
        preview: 'skins/lyons/thumb.jpg',
        texture: 'skins/lyons/texture.jpg',
        unlock_url: '?lyons',
        sort: 0,
    },
};

if (NODEJS_SKINS) module.exports = ZOR.SkinCatalog;
