// Configuration values.  Values defined here are available to both the client and
// the server.

var NODEJS = typeof module !== 'undefined' && module.exports;

if (NODEJS) {
    global.self = {}; // threejs expects there to be a global named 'self'... for some reason..
    global.THREE = require('three.js');
}

var config = {};

////////////////////////////////////////////////////////////////////////
//                           WORLD SETTINGS                           //
////////////////////////////////////////////////////////////////////////

config.WORLD_SIZE       = 1000;
config.WORLD_HYPOTENUSE = Math.sqrt( Math.pow( Math.sqrt( Math.pow( config.WORLD_SIZE, 2 ) + Math.pow( config.WORLD_SIZE, 2 ) ), 2 ) + Math.pow( config.WORLD_SIZE, 2 ));

////////////////////////////////////////////////////////////////////////
//                          NETWORK SETTINGS                          //
////////////////////////////////////////////////////////////////////////

config.PORT                     = 3000;
config.HEARTBEAT_ENABLE         = true;
config.HEARTBEAT_TIMEOUT        = 30000; // how long before a client is considered disconnected
config.HEARTBEAT_CHECK_INTERVAL = 1000;  // server heartbeat test interval
config.HEARTBEAT_PULSE_INTERVAL = 3000;  // client heartbeat pulse
config.SERVER_TICK_INTERVAL     = 250;   // General server updates in milliseconds
config.ACTOR_UPDATE_INTERVAL    = 50;    // How often actors update their position in milliseconds

////////////////////////////////////////////////////////////////////////
//                          PLAYER SETTINGS                           //
////////////////////////////////////////////////////////////////////////

config.BASE_PLAYER_SPEED = 5;

////////////////////////////////////////////////////////////////////////
//                           FOOD SETTINGS                            //
////////////////////////////////////////////////////////////////////////

config.FOOD_DENSITY          = 10;    // How much food there is, total food = this number cubed
config.FOOD_RESPAWN_TIME     = 30000; // Respawn time for food in milliseconds
config.FOOD_VALUE            = 2;     // amount to increase sphere by when food is consumed
config.FOOD_CAPTURE_ASSIST   = 2;     // this number is added to player's radius for food capturing

////////////////////////////////////////////////////////////////////////
//                            GFX SETTINGS                            //
////////////////////////////////////////////////////////////////////////

config.INITIAL_CAMERA_DISTANCE = 50;
config.FOG_ENABLED             = true;
config.FOG_NEAR                = 100;
config.FOG_FAR                 = 1000;
config.FOG_COLOR               = THREE.ColorKeywords.black;
config.INITIAL_FOV             = 50;
config.SPHERE_GLOW_SCALE       = 1.001; // multiplier to determine how big glow sphere should be relative to player sphere
config.MAX_PLAYER_RADIUS       = 150;
config.INITIAL_PLAYER_RADIUS   = 2;

////////////////////////////////////////////////////////////////////////
//                          NODEJS EXPORTER                           //
////////////////////////////////////////////////////////////////////////

if (NODEJS) module.exports = config;