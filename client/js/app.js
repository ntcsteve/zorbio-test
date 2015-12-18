// Scene and canvas
var scene;
var canvas = document.getElementById('renderCanvas');

// Camera
var camera;
var camera_controls;

// constants

// Player
var playerName;
var playerType;
var playerNameInput = document.getElementById('playerNameInput');
var player;

// player velocity
var velocity = new THREE.Vector3();

// Game state
var players = {};
var food = {};
var gameStart = false;
var kicked = false;
var disconnected = false;
//var died = false;

var renderer;

// Model that represents the game state shared with server
var zorbioModel;

function startGame(type) {
    playerName = playerNameInput.value.replace(/(<([^>]+)>)/ig, '');
    playerType = type;

    showGame(true);

    // Connect to the server
    var colorCode = UTIL.getRandomIntInclusive(0, PlayerView.COLORS.length - 1);
    connectToServer(playerType, playerName, colorCode);
}

// check if nick is valid alphanumeric characters (and underscores)
function validNick() {
    var regex = /^\w*$/;
    console.log('Regex Test', regex.exec(playerNameInput.value));
    return regex.exec(playerNameInput.value) !== null;
}

window.onload = function () {
    'use strict';

    var btn = document.getElementById('startButton'),
        nickErrorText = document.querySelector('#startMenu .input-error');

    btn.onclick = function () {
        // check if the nick is valid
        if (validNick()) {
            startGame(ZOR.PlayerTypes.PLAYER);
        } else {
            nickErrorText.style.display = 'inline';
        }
    };

    playerNameInput.addEventListener('keypress', function (e) {
        var key = e.which || e.keyCode;
        var KEY_ENTER = 13;

        if (key === KEY_ENTER) {
            if (validNick()) {
                //TODO: allow ZOR.PlayerTypes.SPECTATOR type
                startGame(ZOR.PlayerTypes.PLAYER);
            } else {
                nickErrorText.style.display = 'inline';
            }
        }
    });
};

function createScene() {

    init();
    animate();

    function init() {

        scene = new THREE.Scene();
        // scene.fog = new THREE.FogExp2( 0xffffff, 0.002 );
        if (config.FOG_ENABLED) {
            scene.fog = new THREE.Fog( config.FOG_COLOR, config.FOG_NEAR, config.FOG_FAR );
        }

        renderer = new THREE.WebGLRenderer({ antialias: true, canvas: canvas });
        renderer.setClearColor( config.FOG_COLOR );
        renderer.setPixelRatio( window.devicePixelRatio );
        renderer.setSize( window.innerWidth, window.innerHeight );

        // orbit camera

        camera = new THREE.PerspectiveCamera(
            config.INITIAL_FOV,
            window.innerWidth / window.innerHeight,
            1,
            config.WORLD_HYPOTENUSE + 100 // world hypot plus a little extra for camera distance
        );
        camera.position.z = 200;

        camera_controls = new THREE.FollowOrbitControls( camera, renderer.domElement );
        camera_controls.enableDamping = true;
        camera_controls.dampingFactor = 0.25;
        camera_controls.enableZoom = false;
        camera_controls.minDistance = config.INITIAL_CAMERA_DISTANCE;
        camera_controls.maxDistance = config.INITIAL_CAMERA_DISTANCE;
        // controls.minPolarAngle = Infinity; // radians
        // controls.maxPolarAngle = -Infinity; // radians

        // sphere
        // Create the player view and adds the player sphere to the scene
        player.initView(scene);

        // camera
        camera_controls.target = player.view.mainSphere;

        adjustCamera( config.INITIAL_PLAYER_RADIUS );

        // food
        drawFood();

        // Hide currently respawning food
        hideRespawningFood();

        // Draw other players
        drawPlayers();

        // skybox
        var materialArray = [];
        for (var i = 0; i < 6; i++) {
            materialArray.push(new THREE.MeshBasicMaterial( { map: THREE.ImageUtils.loadTexture( 'textures/skybox_grid_black.jpg' ) }));
            materialArray[i].side = THREE.BackSide;
        }
        var skyboxMaterial = new THREE.MeshFaceMaterial( materialArray );
        var skyboxGeom = new THREE.BoxGeometry( zorbioModel.worldSize.x, zorbioModel.worldSize.y, zorbioModel.worldSize.z, 1, 1, 1 );
        var skybox = new THREE.Mesh( skyboxGeom, skyboxMaterial );
        scene.add( skybox );

        // lights

        var light = new THREE.AmbientLight( 0x222222 );
        scene.add( light );

        window.addEventListener( 'resize', onWindowResize, false );
    }

    function onWindowResize() {

        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();

        renderer.setSize( window.innerWidth, window.innerHeight );

    }

    function animate() {

        requestAnimationFrame( animate );

        resetVelocity();

        handleKeysDown();

        applyVelocity();

        checkFoodCaptures();

        updateActors();

        player.view.update(scene, camera, renderer);

        camera_controls.update(); // required if controls.enableDamping = true, or if controls.autoRotate = true

        render();
    }

    function render() {

        renderer.render( scene, camera );

    }
}

function drawPlayers() {
    var playerModels = zorbioModel.players;
    // Iterate over player
    var playerIds = Object.getOwnPropertyNames(playerModels);
    for (var i = 0, l = playerIds.length; i < l; i++) {
        var id = playerIds[i];
        var playerModel = playerModels[id];
        if (playerModel.type === ZOR.PlayerTypes.PLAYER) {
            // Only draw other players
            if (id !== player.getPlayerId()) {
                players[id] = new PlayerController(playerModel, scene);
            }
        }
    }
}

function checkFoodCaptures() {

    var x, y, z, i, l;
    var vdist = checkFoodCaptures.vdist;
    var dist = 0;
    var mainSphere = player.view.mainSphere;
    var sphere_radius = player.radius();

    for ( i = 0, l = food.positions.length; i < l; i += 3 ) {
        if (aliveFood( i / 3 )) {
            x = food.positions[ i     ];
            y = food.positions[ i + 1 ];
            z = food.positions[ i + 2 ];
            vdist.set(x, y, z);

            dist = vdist.distanceTo(mainSphere.position);
            if (dist <= (sphere_radius + config.FOOD_CAPTURE_ASSIST)) {
                var fi = i / 3;
                captureFood( fi );
            }
        }
    }
}
checkFoodCaptures.vdist = new THREE.Vector3();

function updateActors() {
    var actors = zorbioModel.actors;

    // Iterate over actor properties in the actors object
    var actorIds = Object.getOwnPropertyNames(actors);
    for (var i = 0, l = actorIds.length; i < l; i++) {
        var id = actorIds[i];
        var actor = actors[id];
        if (actor.type === ZOR.ActorTypes.PLAYER_SPHERE) {
            if (id !== player.getSphereId()) {
                var otherPlayer = players[actor.playerId];
                if (otherPlayer.view) {
                    // update players sphere position
                    otherPlayer.updatePosition(actor.position, scene, camera, renderer);
                    otherPlayer.setScale(actor.scale);
                }
            }
        }
    }
}

function captureFood(fi) {
    if (aliveFood(fi)) {
        var mainSphere = player.view.mainSphere;

        // give food value diminishing returns to prevent runaway growth
        var value = config.FOOD_VALUE / mainSphere.scale.x;

        var new_radius = ( mainSphere.scale.x + value ) * config.INITIAL_PLAYER_RADIUS;

        var safe_to_grow = !checkWallCollision( mainSphere.position, new_radius, new THREE.Vector3(), zorbioModel.worldSize );

        hideFood(fi);

        if (safe_to_grow) {
            player.grow( value );
            adjustCamera(new_radius);
            sendFoodCapture(fi);  // send the food capture to the server
        }
        else {
            console.log("NOT SAFE TO GROW!");
        }

    }
}

/**
 * Given a sphere radius, adjust the camera so the whole sphere is within view.
 */
function adjustCamera( radius ) {
    camera_controls.minDistance = radius / Math.tan( Math.PI * camera.fov / 360 ) + 100;
    camera_controls.maxDistance = camera_controls.minDistance;
}

function aliveFood(fi) {
    return food.respawning[fi] === 0;
}

function hideFood(fi) {
    food.respawning[fi] = 1; // hide food
    food.particleSystem.geometry.attributes.respawning.needsUpdate = true;
}

function showFood(fi) {
    food.respawning[fi] = 0;
    food.particleSystem.geometry.attributes.respawning.needsUpdate = true;
}

function drawFood() {

    food.positions = new Float32Array( zorbioModel.foodCount * 3 );
    food.colors = new Float32Array( zorbioModel.foodCount * 3 );
    food.respawning = new Float32Array( zorbioModel.foodCount );

    var positions = food.positions;
    var colors = food.colors;
    var respawning = food.respawning;

    // copy food position and food color values from the zorbioModel.food array
    // into the typed arrays for the particle system

    var X, Y, Z, R, G, B;
    var particle_index = 0;
    var food_index = 0;
    for (var i = 0, l = zorbioModel.foodCount; i < l; i++) {

        X = zorbioModel.food[ food_index     ];
        Y = zorbioModel.food[ food_index + 1 ];
        Z = zorbioModel.food[ food_index + 2 ];
        R = zorbioModel.food[ food_index + 3 ];
        G = zorbioModel.food[ food_index + 4 ];
        B = zorbioModel.food[ food_index + 5 ];

        respawning[ i ] = 0;

        positions[ particle_index     ] = X;
        positions[ particle_index + 1 ] = Y;
        positions[ particle_index + 2 ] = Z;

        colors[ particle_index     ] = R / 255;
        colors[ particle_index + 1 ] = G / 255;
        colors[ particle_index + 2 ] = B / 255;

        particle_index += 3;
        food_index += 6;
    }

    var geometry = new THREE.BufferGeometry();
    geometry.addAttribute( 'position', new THREE.BufferAttribute( positions, 3 ) );
    geometry.addAttribute( 'respawning', new THREE.BufferAttribute( respawning, 1 ) );
    geometry.addAttribute( 'ca', new THREE.BufferAttribute( colors, 3 ) );

    //

    var texture = THREE.ImageUtils.loadTexture( "textures/solid-particle.png" );
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;

    var material = new THREE.ShaderMaterial( {

        uniforms: {
            amplitude   : { type: "f", value: 1.0 },
            color       : { type: "c", value: new THREE.Color( 0xffffff ) },
            texture     : { type: "t", value: texture },
            size        : { type: "f", value: 3000 },
            FOG_FAR     : { type: "f", value: config.FOG_FAR },
            FOG_ENABLED : { type: "f", value: ~~config.FOG_ENABLED },
        },
        vertexShader:   document.getElementById( 'vertexshader' ).textContent,
        fragmentShader: document.getElementById( 'fragmentshader' ).textContent,
        transparent:    false,
        depthTest:      true

    });

    food.particleSystem = new THREE.Points( geometry, material );
    scene.add( food.particleSystem );
}

function hideRespawningFood() {
    // hide any food that was respawning when the player connected
    for (var i = 0, l = zorbioModel.food_respawning_indexes.length; i < l; i++) {
        food.respawning[zorbioModel.food_respawning_indexes[i]] = 1; // hide food
    }
    food.particleSystem.geometry.attributes.respawning.needsUpdate = true;
}

window.addEventListener("keydown", handleKeydown);
window.addEventListener("keyup", handleKeyup);

var KeysDown = {};
var KeyCodes = {
    87 : 'w',
    83 : 's',
    65 : 'a',
    68 : 'd',
    32 : 'space',
    16 : 'shift'
};

var ListenForKeys = Object.keys(KeyCodes);

function handleKeydown(evt) {
    var we_care_about_this_key;
    var already_pressed;

    if (!gameStart) return;

    // if key exists in keycodes, set its 'down' state to true
    we_care_about_this_key = ListenForKeys.indexOf(evt.keyCode+'') !== -1;
    if (we_care_about_this_key) {
        already_pressed = KeysDown[KeyCodes[evt.keyCode]];
        if (!already_pressed) {
            keyJustPressed(KeyCodes[evt.keyCode]);
        }
        KeysDown[KeyCodes[evt.keyCode]] = true;
    }
}

function handleKeyup(evt) {
    if (!gameStart) return;

    // if key exists in keycodes, set its 'down' state to false
    var we_care_about_this_key = ListenForKeys.indexOf(evt.keyCode+'') !== -1;
    if (we_care_about_this_key) {
        keyReleased(KeyCodes[evt.keyCode]);
        KeysDown[KeyCodes[evt.keyCode]] = false;
    }
}

function handleKeysDown() {
    for( var key in KeysDown ) {
        if (KeysDown[key]) {
            keyDown(key);
        }
    }
}

function keyDown( key ) {
    if ( key === 'w' ) {
        moveForward();
    }
    else if ( key === 's' ) {
        moveBackward();
    }
}

function keyJustPressed(key) {
    console.log('key ' + key + ' just pressed');
}

function keyReleased(key) {
    console.log('key ' + key + ' released');
}

function resetVelocity() {
    velocity.set( 0, 0, 0 );
}

function applyVelocity() {
    velocity.sub( camera_controls.velocityRequest );
    velocity.normalize();
    velocity.multiplyScalar( config.BASE_PLAYER_SPEED );

    player.view.mainSphere.position.sub(
        adjustVelocityWallHit(
            player.view.mainSphere.position,
            player.radius(),
            velocity,
            zorbioModel.worldSize
        )
    );

    // reset the velocity requested by camera controls.  this should be done
    // inside the camera controls but I couldn't find a good place to do it.
    camera_controls.velocityRequest.set( 0, 0, 0 );
}

function moveForward() {
    var v = moveForward.v;
    var mainSphere = player.view.mainSphere;
    v.copy( mainSphere.position );
    v.sub( camera.position );
    v.multiplyScalar( -1 );
    v.normalize();
    v.multiplyScalar( config.BASE_PLAYER_SPEED );
    velocity.add( v );
}
moveForward.v = new THREE.Vector3();

function moveBackward() {
    var v = moveBackward.v;
    var mainSphere = player.view.mainSphere;
    v.copy( mainSphere.position );
    v.sub( camera.position );
    v.normalize();
    v.multiplyScalar( config.BASE_PLAYER_SPEED );
    velocity.add( v );
}
moveBackward.v = new THREE.Vector3();

function adjustVelocityWallHit( p, r, v, w ) {

    var vs = v.clone();
    if ( hitxp( p, r, v, w ) || hitxn( p, r, v, w ) )
        vs.x = 0;

    if ( hityp( p, r, v, w ) || hityn( p, r, v, w ) )
        vs.y = 0;

    if ( hitzp( p, r, v, w ) || hitzn( p, r, v, w ) )
        vs.z = 0;

    return vs;

}

function checkWallCollision( p, r, v, w ) {

    return hitxp( p, r, v, w ) ||
           hitxn( p, r, v, w ) ||
           hityp( p, r, v, w ) ||
           hityn( p, r, v, w ) ||
           hitzp( p, r, v, w ) ||
           hitzn( p, r, v, w );

}

// TODO: make sure when a collision occurs with two or more walls at once
// happens, it is handled correctly

// functions to detect hitting the wall in the positive (p) and negative (n)
// directions, on x, y, and z axes.
function hitxp( p, r, v, w ) { return hitp( p, r, v, w, 'x' ); }
function hitxn( p, r, v, w ) { return hitn( p, r, v, w, 'x' ); }
function hityp( p, r, v, w ) { return hitp( p, r, v, w, 'y' ); }
function hityn( p, r, v, w ) { return hitn( p, r, v, w, 'y' ); }
function hitzp( p, r, v, w ) { return hitp( p, r, v, w, 'z' ); }
function hitzn( p, r, v, w ) { return hitn( p, r, v, w, 'z' ); }

function hitp( p, r, v, w, axis ) {
    return p[axis] + r - v[axis] > w[axis]/2;
}
function hitn( p, r, v, w, axis ) {
    return p[axis] - r - v[axis] < -w[axis]/2;
}

function cleanupMemory() {
    players = {};
    food = {};
    zorbioModel = null;
}

function removePlayerFromGame(playerId) {
    var kickedPlayer = players[playerId];

    if (kickedPlayer && kickedPlayer.view) {
        // remove player from model
        var sphereId = kickedPlayer.getSphereId();
        zorbioModel.actors[sphereId] = null;
        delete zorbioModel.actors[sphereId];
        zorbioModel.players[playerId] = null;
        delete zorbioModel.players[playerId];

        // Remove player from the scene
        kickedPlayer.removeView(scene);
        players[playerId] = null;
        delete players[playerId];

        console.log('Removed player from game', playerId);
    }
}

function handleServerTick(serverTickData) {
    // handle food respawns
    for(var i = 0, l = serverTickData.fr.length; i < l; ++i) {
        showFood(serverTickData.fr[i]);  // Show the food index
    }
}
