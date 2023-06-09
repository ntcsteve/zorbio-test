/********************************************************************
 * Zorbio Game.js this is the games main bootstrap and event handler
 ********************************************************************/

// ESLint global declarations: https://eslint.org/docs/rules/no-undef
/*
global config:true,
 ZOR:true,
 UTIL:true,
 THREE:true,
 _:true,
 isMobile:true,
 ga:true,
 linodeNearLocation:true,
 CurvePaths:true
*/

ZOR.Game = {};

// Scene and canvas
let scene;
let canvas;

// Camera
let camera;
let camera_controls;
let raycaster = new THREE.Raycaster();
if (config.FOG_ENABLED) {
    raycaster.far = config.FOG_FAR;
}

// Player
let player;

// TODO: get rid of this globals, refactor into MVC Player and Food controllers
let playerFogCenter = new THREE.Vector3();

// Game state
let gameStart = false;
let foodController;

// Model that represents the game state shared with server
let zorbioModel = new ZOR.Model();

// Game websocket client
let zorClient = new ZOR.ZORClient(ZOR.ZORMessageHandler);

ZOR.Game.players = {};
ZOR.Game.dead_players = {};  // hold dead player views while they finish death animations

ZOR.Game.player_meshes = [];

ZOR.Game.steeringHelper = new ZOR.SteeringHelper();

ZOR.Game.fullscreen = function go_fullscreen() {
    let el = document.body;
    if (el.requestFullscreen) {
        el.requestFullscreen();
    }
    else if (el.msRequestFullscreen) {
        el.msRequestFullscreen();
    }
    else if (el.mozRequestFullScreen) {
        el.mozRequestFullScreen();
    }
    else if (el.webkitRequestFullscreen) {
        el.webkitRequestFullscreen();
    }
};

/**
 * Main bootstrap that starts game for a player
 * @param {string} type
 */
function startGame(type) {
    let fake_renderer;
    let missing_extensions;

    // Before we do anything, make sure WebGL is supported by this browser
    try {
        fake_renderer = new THREE.WebGLRenderer();
        missing_extensions = _.chain( config.REQUIRED_WEBGL_EXTENSIONS )
            .map( fake_renderer.extensions.get )
            .some( _.isNull )
            .value();
        fake_renderer = undefined;
        if (missing_extensions) {
            throw new Error('missing WebGL extensions');
        }
    }
    catch (e) {
        console.error('Failed to init game.  Possible WebGL failure.  Original error below.');
        console.error(e.message);
        ZOR.UI.state( ZOR.UI.STATES.GAME_INIT_ERROR );
        return;
    }

    // only automatically fullscreen on mobile devices
    if (isMobile.any) {
        ZOR.Game.fullscreen();
    }

    if (config.MUSIC_ENABLED) {
        ZOR.Sounds.stopMusic();
        setTimeout(function() {
            ZOR.Sounds.playMusic('play');
        }, 1000);
    }

    ZOR.UI.state( ZOR.UI.STATES.PLAYING );

    // Assign player meta data and save to local storage
    let colorCode = UTIL.getRandomIntInclusive(0, config.COLORS.length - 1);
    let colorHex = config.COLORS[colorCode];
    let name = ZOR.UI.engine.get('player_name');
    let key = localStorage.alpha_key = ZOR.UI.engine.get('alpha_key');
    ZOR.Game.playerMeta = {
        playerType: type,
        playerName: name,
        key       : key,
        skin      : localStorage.getItem('skin') || 'default',
        color     : colorCode,
    };

    document.querySelector('meta[name=theme-color]').content = colorHex;

    // Initialize player size ui element
    ZOR.UI.engine.set('player_color', colorCode);
    ZOR.UI.engine.set('player_score', config.GET_PADDED_INT(config.INITIAL_PLAYER_RADIUS));
    ZOR.UI.engine.set('player_size', config.GET_PADDED_INT(config.INITIAL_PLAYER_RADIUS));

    // Schedule one time Google Analytics tracking for Ping and FPS
    setTimeout(gaPerformanceMetrics, 31000);

    console.log('Player meta: ', ZOR.Game.playerMeta);

    zorClient.z_sendEnterGame(ZOR.Game.playerMeta);

    if (!isMobile.any && config.STEERING === config.STEERING_METHODS.MOUSE_FOLLOW) {
        // Start detecting if a player can fly strait
        ZOR.Game.steeringHelper.detectStraight();
    }
}

/**
 * Respawns a player
 */
function respawnPlayer() {
    console.log('Respawning player: ', player.getPlayerId());
    ZOR.UI.state( ZOR.UI.STATES.PLAYING );
    ZOR.Sounds.stopMusic();
    setTimeout(function() {
        ZOR.Sounds.playMusic('play');
    }, 1000);
    gameStart = false;
    zorClient.z_sendRespawn();

    if (!isMobile.any && config.STEERING === config.STEERING_METHODS.MOUSE_FOLLOW) {
        // Start detecting if a player can fly strait
        ZOR.Game.steeringHelper.detectStraight();
    }
}

/**
 * Main function that creates the threejs scene and renders the game and starts the animate loop
 */
function createScene() {
    // a function to reveal the canvas after a few frames have been drawn.
    // turns into a noop afterwards.
    let revealCanvas = _.after(4, function() {
        canvas.classList.add('active');
        ZOR.UI.engine.set('loading', false);
    });

    ZOR.UI.engine.fire(ZOR.UI.ACTIONS.UPDATE_LEADERBOARD, zorClient);

    try {
        init();
        animate();
    }
    catch (e) {
        console.error('Failed to init game.  Possible WebGL failure.  Original error below.');
        ZOR.UI.engine.set('loading', false);
        ZOR.UI.state( ZOR.UI.STATES.GAME_INIT_ERROR );
        throw e;
    }

    /**
     * Initialize the scene, camera, and actors
     */
    function init() {
        canvas = document.getElementById('render-canvas');
        scene = new THREE.Scene();
        // scene.fog = new THREE.FogExp2( 0xffffff, 0.002 );
        if (config.FOG_ENABLED) {
            scene.fog = new THREE.Fog( config.FOG_COLOR, config.FOG_NEAR, config.FOG_FAR );
        }

        ZOR.Game.renderer = new THREE.WebGLRenderer({ antialias: true, canvas: canvas });
        ZOR.Game.renderer.setClearColor( config.FOG_COLOR );
        ZOR.Game.renderer.setPixelRatio( window.devicePixelRatio );
        ZOR.Game.renderer.setSize( window.innerWidth, window.innerHeight );

        // Initial title screen camera
        camera = new THREE.PerspectiveCamera(
            config.INITIAL_FOV,
            window.innerWidth / window.innerHeight,
            1,
            config.WORLD_HYPOTENUSE + 100 // world hypot plus a little extra for camera distance
        );
        camera.position.set(0, 0, 0);

        // food
        foodController = new ZOR.FoodController(zorbioModel, camera.position);
        foodController.drawFood(scene);

        // Hide currently respawning food
        foodController.hideFoodMultiple(zorbioModel.food_respawning_indexes);

        // Draw other players
        drawPlayers();

        // skybox
        let materialArray = [];
        let wall_texture;
        for (let i = 0; i < 6; i++) {
            wall_texture = new THREE.TextureLoader().load( 'textures/skybox_grid_black.png' );
            wall_texture.wrapS = wall_texture.wrapT = THREE.MirroredRepeatWrapping;
            wall_texture.repeat.set(config.WALL_GRID_SEGMENTS, config.WALL_GRID_SEGMENTS);
            materialArray.push(new THREE.MeshBasicMaterial( { map: wall_texture }));
            materialArray[i].side = THREE.DoubleSide;
            materialArray[i].transparent = true;
            materialArray[i].alphaTest = 0.5;
            materialArray[i].map.magFilter = THREE.NearestFilter;
            materialArray[i].map.minFilter = THREE.LinearFilter;
        }
        let skyboxMaterial = new THREE.MeshFaceMaterial( materialArray );
        let skyboxGeom = new THREE.BoxGeometry(
            zorbioModel.worldSize.x,
            zorbioModel.worldSize.y,
            zorbioModel.worldSize.z, 1, 1, 1);
        let skybox = new THREE.Mesh( skyboxGeom, skyboxMaterial );
        skybox.renderOrder = -10;
        scene.add( skybox );

        // lights
        let light = new THREE.AmbientLight( 0x222222 );
        scene.add( light );

        window.addEventListener( 'resize', onWindowResize, false );
    }

    /**
     * A way to quickly visualize what curve paths look like in space
     */
    function previewCurves() {
        let curvePaths = new CurvePaths();
        for (let i = 0; i < 300; i++) {
            let points = curvePaths.cinquefoilKnot();
            let geometry = new THREE.BufferGeometry();
            geometry.setFromPoints( points );

            let material = new THREE.LineBasicMaterial( { color: 0xffffff } );

            let curveObject = new THREE.Line( geometry, material );
            scene.add(curveObject);
        }
    }

    /**
     * windows resize event handler
     */
    function onWindowResize() {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();

        ZOR.Game.renderer.setSize( window.innerWidth, window.innerHeight );
    }

    /**
     * Main animate loop for rendering each frame of the game
     */
    function animate() {
        requestAnimationFrame(animate);

        let ui_state = ZOR.UI.state();
        if (ui_state.indexOf('menu') === 0 || ui_state === ZOR.UI.STATES.CREDITS_SCREEN ) {
            camera.rotation.y -= config.TITLE_CAMERA_SPIN_SPEED * ZOR.LagScale.get();
        }

        let fogCenter;

        updateActors();

        updateDeadPlayers();

        if (gameStart && !player.isDead) {
            fogCenter = player.view.mainSphere.position;

            player.resetVelocity();

            handleKeysDown();

            ZOR.LagScale.update();

            player.update(scene, camera, camera_controls, ZOR.LagScale.get());

            throttledSendPlayerUpdate();

            zorClient.z_sendClientPositionRapid(player.model.sphere.id, player.view.mainSphere.position);

            foodController.checkFoodCaptures(player, captureFood);

            camera_controls.update(); // required if controls.enableDamping = true, or if controls.autoRotate = true

            raycaster.set(player.view.mainSphere.position, camera.getWorldDirection().normalize());

            throttledUpdatePlayerSizeUI();

            throttledUpdateTargetLock();
        }
        else if (ZOR.UI.state().indexOf('menu') === 0) {
            fogCenter = camera.position;
        }
        else if (player && player.isDead) {
            fogCenter = player.model.sphere.position;
        }
        else {
            fogCenter = { x: 0, y: 0, z: 0 };
        }

        playerFogCenter.copy(fogCenter);
        foodController.update(fogCenter);

        ZOR.UI.update();

        render();
    }

    /**
     * Sends the scene and camera to be rendered by threejs renderer
     */
    function render() {
        ZOR.Game.renderer.render( scene, camera );

        revealCanvas();
    }
}

/**
 * Initialize the camera and player when the player first enters the game or respawns
 */
function initCameraAndPlayer() {
    // sphere
    // Create the player view and adds the player sphere to the scene
    player.initView(scene);

    // orbit camera
    camera = new THREE.PerspectiveCamera(
        config.INITIAL_FOV,
        window.innerWidth / window.innerHeight,
        1,
        config.WORLD_HYPOTENUSE + 100 // world hypot plus a little extra for camera distance
    );

    if ( config.STEERING.NAME === 'FOLLOW' ) {
        // Trackball settings for steering Follow method
        camera_controls = new THREE.TrackballControls( camera, ZOR.Game.renderer.domElement );
        camera_controls.staticMoving = true;
        camera_controls.noZoom = false;
        camera_controls.noPan = true;
        camera_controls.dynamicDampingFactor = 0.0;
        camera_controls.rotateSpeed = config.STEERING.SPEED;
        camera_controls.target = player.view.mainSphere.position;
    }
    else if (config.STEERING.NAME === 'DRAG') {
        // FollowOrbit settings for drag steering method
        camera_controls = new THREE.FollowOrbitControls( camera, ZOR.Game.renderer.domElement );
        camera_controls.enableDamping = true;
        camera_controls.dampingFactor = 0.25;
        camera_controls.enableZoom = false;
        camera_controls.enablePan = false;
        camera_controls.target = player.view.mainSphere;
    }

    // Common settings between Trackball and FollowOrbit
    camera_controls.minDistance = config.INITIAL_CAMERA_DISTANCE;
    camera_controls.maxDistance = config.INITIAL_CAMERA_DISTANCE;

    // move camera so that the player is facing towards the origin each time
    // they spawn
    camera.position.copy( player.model.sphere.position.clone().multiplyScalar(1.2) );

    player.setCameraControls( camera_controls );
    player.view.adjustCamera(player.radius());

    playerFogCenter.copy(player.view.mainSphere.position);
}

/**
 * Draws other players currently in the game
 */
function drawPlayers() {
    // Iterate over player
    zorbioModel.players.forEach(function drawEachPlayer(playerModel) {
        if (playerModel.type !== ZOR.PlayerTypes.SPECTATOR) {
            let id = playerModel.id;

            // Only draw other players
            if (!player || (id !== player.getPlayerId())) {
                ZOR.Game.players[id] = new ZOR.PlayerController(playerModel, scene, false);
            }
        }
    });
}

/**
 * Updates all actors currently in the game every frame
 */
function updateActors() {
    // Iterate over actor properties in the actors object
    zorbioModel.actors.forEach(function updateEachActor(actor) {
        if (actor.type === ZOR.ActorTypes.PLAYER_SPHERE) {
            if (!player || (actor.id !== player.getSphereId())) {
                let otherPlayer = ZOR.Game.players[actor.playerId];
                if (otherPlayer && otherPlayer.view) {
                    // update actor
                    otherPlayer.updatePosition(actor.position);
                    otherPlayer.updateScale(actor.scale);
                    otherPlayer.updateDrain(actor.drain_target_id);
                }
            }
            else {
                // update main player
                player.updateScale(actor.scale);
                player.updateDrain(actor.drain_target_id);
            }
        }
    });
}

/**
 * When a player dies they aren't imidately removed they first have a death animation.
 * This function updates the view for that death animation i.e. particle explosion
 */
function updateDeadPlayers() {
    let dead_player_ids = Object.getOwnPropertyNames( ZOR.Game.dead_players );
    for (let i = 0, l = dead_player_ids.length; i < l; i++) {
        let deadPlayer = ZOR.Game.dead_players[dead_player_ids[i]];
        if (deadPlayer && deadPlayer.view) {
            deadPlayer.view.update();  // update the dead player view for death particle effect
        }
    }
}

/**
 * This updates the players score and size meter in the UI
 */
function updatePlayerSizeUI() {
    let currentScore = player.getScore();
    let currentSize = player.getSize();

    if (currentScore !== player.lastScore || currentSize !== player.lastSize) {
        ZOR.UI.engine.set('player_score', player.getScore());
        ZOR.UI.engine.set('player_size', currentSize);
        player.lastScore = currentScore;
        player.lastSize = currentSize;
    }
}
let throttledUpdatePlayerSizeUI = _.throttle(updatePlayerSizeUI, 70);

/**
 * Updates the target UI based on raycasting from the current player. The target
 * is the name of another player sphere that they are looking at.
 */
function updateTargetLock() {
    // calculate objects intersecting the ray
    let intersects = raycaster.intersectObjects( ZOR.Game.player_meshes );

    if (intersects && intersects.length > 0) {
        // looking at a player
        let playerMesh     = intersects[0].object;

        if (playerMesh && playerMesh.player_id > 0) {
            let targeting_self = playerMesh.player_id === player.model.id;

            if (!targeting_self) {
                // Update target locked UI
                let pointedPlayer = ZOR.Game.players[playerMesh.player_id];

                if (pointedPlayer) {
                    let target_changed = player.getTargetLock() !== playerMesh.player_id;
                    let currentSize = pointedPlayer.getSize();
                    let warning = 'Caution';
                    let warning_color = 11;

                    if (currentSize < player.getSize() - 10) {
                        warning = 'Can eat';
                        warning_color = 9;
                    }
                    else if (currentSize > player.getSize()) {
                        warning = 'Danger';
                        warning_color = 14;
                    }

                    let target = {
                        name         : pointedPlayer.model.name,
                        size         : currentSize,
                        color        : pointedPlayer.model.sphere.color,
                        warning      : warning,
                        warning_color: warning_color,
                    };

                    if (target_changed) {
                        // Set new target
                        player.setTargetLock(playerMesh.player_id);
                        ZOR.UI.engine.set('target', target);
                        pointedPlayer.lastSize = currentSize;
                        clearTimeout(ZOR.UI.target_clear_timeout_id);
                    }
                    else if (currentSize !== pointedPlayer.lastSize) {
                        // Update target score
                        ZOR.UI.engine.set('target', target);
                        pointedPlayer.lastSize = currentSize;
                    }
                }
            }
        }
    }
    else if (player.getTargetLock()) {
        // not looking at anything so clear target name after timeout
        player.setTargetLock(0);
        ZOR.UI.target_clear_timeout_id = setTimeout(ZOR.UI.clearTarget, 4000);
        console.log('clearing target lock');
    }
}
let throttledUpdateTargetLock = _.throttle(updateTargetLock, 100);

/**
 * Sends the player update message to the server throttled to tick fast interval
 */
function sendPlayerUpdate() {
    // Make sure model is synced with view
    player.refreshSphereModel();

    // make sure we always have at least 4 recent positions
    while (player.model.sphere.recentPositions.length < 4) {
        player.addRecentPosition();
    }

    zorClient.z_sendPlayerUpdate(player.model.sphere, player.food_capture_queue);

    // clear food queue
    player.food_capture_queue = [];
}
let throttledSendPlayerUpdate = _.throttle(sendPlayerUpdate, config.TICK_FAST_INTERVAL);

/**
 * Handle current player capturing food
 * @param {number} fi
 */
function captureFood(fi) {
    player.queueFoodCapture(fi);
    foodController.hideFood(fi);
}

window.addEventListener('keydown', handleKeydown);
window.addEventListener('keyup', handleKeyup);
window.addEventListener('mousedown', handleMouseDown);
window.addEventListener('mouseup', handleMouseUp);

/**
 * Handler for the window.onload event.  The main thing this does is connect to the game server
 */
function handleOnload() {
    // First see if we are connecting to ws or wss based on if https is enabled
    let protocol = config.ENABLE_HTTPS ? 'wss' : 'ws';

    zorClient.z_connectToServer(protocol + '://' + config.BALANCER + ':' + config.WS_CONNECT_PORT);
}

window.onload = handleOnload;

let KeysDown = {};
let KeyCodes = {
    87: 'w',
    83: 's',
    65: 'a',
    68: 'd',
    32: 'space',
    16: 'shift',
};

let ListenForKeys = Object.keys(KeyCodes);

/**
 * Handle key down event
 * @param {Object} evt
 */
function handleKeydown(evt) {
    let we_care_about_this_key;
    let already_pressed;

    if (!gameStart || player.isDead) return;

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

/**
 * Handle key up event
 * @param {Object} evt
 */
function handleKeyup(evt) {
    if (!gameStart || player.isDead) return;

    // if key exists in keycodes, set its 'down' state to false
    let we_care_about_this_key = ListenForKeys.indexOf(evt.keyCode+'') !== -1;
    if (we_care_about_this_key) {
        keyReleased(KeyCodes[evt.keyCode]);
        KeysDown[KeyCodes[evt.keyCode]] = false;
    }
}

/**
 * Handle mouse down event
 * @param {Object} evt
 */
function handleMouseDown(evt) {
    if (!gameStart || player.isDead) return;

    if (config.AUTO_RUN_ENABLED && !isMobile.any) {
        if (evt.button === 0 && config.STEERING === config.STEERING_METHODS.MOUSE_FOLLOW) {
            if (player.isSpeedBoostReady()) {
                zorClient.z_sendSpeedBoostStart();
            }
        }
        else if (evt.button === 2) {
            player.holdPosition = true;
        }
    }
}

/**
 * Handle mouse up event
 * @param {Object} evt
 */
function handleMouseUp(evt) {
    if (!gameStart || player.isDead) return;

    if (config.AUTO_RUN_ENABLED && !isMobile.any) {
        if (evt.button === 0  && config.STEERING === config.STEERING_METHODS.MOUSE_FOLLOW) {
            player.speedBoostStop();
            zorClient.z_sendSpeedBoostStop();
        }
        else if (evt.button === 2) {
            player.holdPosition = false;
        }
    }
}

/**
 * Handle keys down
 */
function handleKeysDown() {
    for ( let key in KeysDown ) {
        if (KeysDown[key]) {
            keyDown(key);
        }
    }
}

/**
 * Key down mapping for player controls
 * @param {string} key
 */
function keyDown( key ) {
    if ( key === 'w' && !config.AUTO_RUN_ENABLED) {
        player.moveForward(camera);
    }
    else if ( key === 's' ) {
        if (config.AUTO_RUN_ENABLED) {
            player.holdPosition = true;
        }
        else {
            player.moveBackward(camera);
        }
    }
}

/**
 * Key just pressed mapping for player controls
 * @param {string} key
 */
function keyJustPressed(key) {
    if ( key === 'w' && config.AUTO_RUN_ENABLED) {
        if (player.isSpeedBoostReady()) {
            zorClient.z_sendSpeedBoostStart();
        }
    }
}

/**
 * Key released mapping for player controls
 * @param {string} key
 */
function keyReleased(key) {
    if (config.AUTO_RUN_ENABLED) {
        switch (key) {
            case 'w':
                if (player.isSpeedBoostActive()) {
                    player.speedBoostStop();
                    zorClient.z_sendSpeedBoostStop();
                }
                break;
            case 's':
                player.holdPosition = false;
                break;
        }
    }
}

/**
 * Completely remove a player from the game both their model and view
 * @param {number} playerId
 * @param {number} time
 */
function removePlayerFromGame(playerId, time) {
    let deadPlayer = ZOR.Game.players[playerId];

    // safe reference to dead player to finish death FX e.g. particle explosion
    ZOR.Game.dead_players[playerId] = deadPlayer;

    // remove player from model
    zorbioModel.removePlayer(playerId);

    // remove from player controllers
    ZOR.Game.players[playerId] = undefined;

    setTimeout(function removePlayerNow() {
        // remove player from scene and client
        if (deadPlayer) {
            if (deadPlayer.view) {
                // Remove player from the scene
                deadPlayer.removeView();
            }

            // remove from player controllers
            delete ZOR.Game.dead_players[playerId];
        }
        console.log('Removed dead player: ', playerId);
    }, time);
}

/**
 * Handle the server tick slow this includes leaders update and other housekeeping
 * It gets called every config.TICK_SLOW_INTERVAL milliseconds
 * @param {Object} serverTickData
 */
function handleServerTick(serverTickData) {
    if (!gameStart) return;

    serverTickData.leaders.forEach(function eachLeader(leader) {
        // get leader name and color
        let clientPlayer = ZOR.Game.players[leader.player_id];
        if (clientPlayer) {
            leader.name = clientPlayer.model.name;
            leader.color = clientPlayer.model.sphere.color;

            // Sync own score
            if (leader.player_id === player.getPlayerId()) {
                player.setScore(leader.score);
            }
        }
        else {
            leader.name = '';
            leader.color = 1;
        }
    });

    // Trim leaders that will be displayed in the UI
    if (serverTickData.leaders.length > config.LEADERS_LENGTH) {
        serverTickData.leaders.length = config.LEADERS_LENGTH;
    }

    ZOR.UI.engine.set( 'leaders', serverTickData.leaders );
    ZOR.UI.data.leaders = serverTickData.leaders;

    if (foodController && foodController.isInitialized()) {
        // handle food respawns
        for (let i = 0, l = serverTickData.fr.length; i < l; ++i) {
            foodController.showFood( serverTickData.fr[i] );  // Show the food index
        }

        // handle food captures
        for (let i = 0, l = serverTickData.fc.length; i < l; ++i) {
            foodController.hideFood( serverTickData.fc[i] );
        }
    }

    // Send server message to the UI (either real message, or undefined)
    ZOR.UI.engine.set('server_message', serverTickData.sm);

    // expire locks
    ZOR.expireLocks();
}

/**
 * Updates the leaderboard UI
 * @param {Object} leaderboards
 */
function handleLeaderboardUpdate(leaderboards) {
    console.log('Updating leaderboards');
    ZOR.UI.engine.set('leaderboard.data', leaderboards);
}

/**
 * Current player has captured someone.
 * @param {number} capturedPlayerID
 */
function handleSuccessfulPlayerCapture(capturedPlayerID) {
    let sound = ZOR.Sounds.sfx.player_capture;
    let capturedPlayer = ZOR.Game.players[capturedPlayerID];
    let windDownTime = 0;

    console.log('handleSuccessfulPlayerCapture', capturedPlayerID);

    if (capturedPlayer) {
        // Play capture sound modified volume based on size difference
        ZOR.Sounds.playFromDelta(sound, player.radius(), capturedPlayer.radius());
        capturedPlayer.handleCapture();
        windDownTime = capturedPlayer.getWindDownTime();
    }

    removePlayerFromGame(capturedPlayerID, windDownTime);
}

/**
 * A player captured another player.  Current player not involved.
 * @param {number} capturedPlayerID
 */
function handleOtherPlayerCapture(capturedPlayerID) {
    let sound = ZOR.Sounds.sfx.player_capture;
    let capturedPlayer = ZOR.Game.players[capturedPlayerID];
    let windDownTime = 0;
    let ear;

    if (capturedPlayer) {

        if (player && capturedPlayer.getPlayerId() === player.getPlayerId()) {
            ZOR.Sounds.playFromDelta(sound, 1, 1); // Own death sound should relative to main player
        }
        else {
            // Other player death sound should be based on distance
            ear = (player && player.view) ? player.view.mainSphere : camera;
            ZOR.Sounds.playFromPos(sound, ear, capturedPlayer.model.sphere.position);
        }

        capturedPlayer.handleCapture();
        windDownTime = capturedPlayer.getWindDownTime();
    }

    console.log('Player died:  ', capturedPlayerID);
    removePlayerFromGame(capturedPlayerID, windDownTime);
}

/**
 * Handle GAME OVER for the current player
 * @param {Object} msg
 */
function handleDeath(msg) {
    let attackingPlayerId = msg.attacking_player_id;

    console.log('YOU DIED! You were alive for ' + msg.time_alive + ' seconds. Killed by: ', attackingPlayerId);
    setDeadState();

    ZOR.Sounds.playMusic('gameover');

    let attackingPlayer = zorbioModel.getPlayerById(attackingPlayerId);
    let attackingActor = zorbioModel.getActorById(attackingPlayer.sphere.id);
    attackingPlayer.size = config.GET_PADDED_INT(attackingActor.scale);

    // Set finally data about the player from the server
    let playerStats = {
        drainAmount   : msg.drain_ammount,
        foodCaptures  : msg.food_captures,
        playerCaptures: msg.player_captures,
        score         : msg.score,
        size          : msg.size,
    };

    // stop woosh in case player was speed boosting
    ZOR.Sounds.sfx.woosh.stop();

    ZOR.UI.engine.set('attacker', attackingPlayer);
    ZOR.UI.engine.set('player', playerStats);
    ZOR.UI.state( ZOR.UI.STATES.RESPAWN_SCREEN );

    // Stop the steering helper
    ZOR.Game.steeringHelper.stop();
}

/**
 * Handle kicking a player from the game
 * @param {string} reason
 */
function handlePlayerKick(reason) {
    setDeadState();

    ZOR.UI.state( ZOR.UI.STATES.KICKED_SCREEN );

    // Send server message to the UI (either real message, or undefined)
    ZOR.UI.engine.set('kicked_message', reason);

    console.log('you were kicked: ', reason);

    // Stop the steering helper
    ZOR.Game.steeringHelper.stop();
}

/**
 * Sets the state on the current player to dead
 */
function setDeadState() {
    player.beingCaptured = false;
    player.isDead = true;
    KeysDown = {};
}

/**
 * Sends performance metrics like fps and ping to Google Analytics
 */
function gaPerformanceMetrics() {
    if (gameStart && !player.isDead) {
        let ping = player.model.ping_metric.series;
        let fps = player.model.fps_metric.series;

        let pingMedian = UTIL.median(ping);
        let fpsMedian = UTIL.median(fps) * 1000;

        if (pingMedian > 0) {
            ga('send', {
                hitType       : 'timing',
                timingCategory: 'Ping',
                timingVar     : 'ping',
                timingValue   : pingMedian,
                timingLabel   : linodeNearLocation(),
            });
        }

        if (fpsMedian > 0) {
            ga('send', {
                hitType       : 'timing',
                timingCategory: 'FPS',
                timingVar     : 'fps',
                timingValue   : fpsMedian,
                timingLabel   : isMobile.any ? 'mobile' : 'desktop',
            });
        }
    }
}
