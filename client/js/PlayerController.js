var ZOR = ZOR || {};

/**
 * This is the Player Controller that is the C in MVC, it has model that syncs state to the server, and a view
 * for rendering.
 * @param model
 * @param scene
 * @constructor
 *
 */
ZOR.PlayerController = function ZORPlayerController(model, scene, current) {
    this.model = new ZOR.Player(model.id, model.name, model.sphere.color, model.type, model.sphere.position,
        model.sphere.scale, model.sphere.velocity, model.sphere.skin);
    this.isDead = false;
    this.is_current_player = current || false;
    this.lastScore = 0;  // last reported score, used to only update UI when there is a change

    this.move_forward_v = new THREE.Vector3();
    this.move_backward_v = new THREE.Vector3();

    this.food_capture_queue = [];

    if (scene) {
        this.initView(scene);
    }

    this.model.abilities.speed_boost.on('activate', function () {
        ZOR.Sounds.sfx.woosh.play();
    });

    this.model.abilities.speed_boost.on('deactivate', function () {
        ZOR.Sounds.sfx.woosh.stop();
    });
};

ZOR.PlayerController.prototype.queueFoodCapture = function ZORPlayerControllerQueueFoodCapture(fi) {
    // queue food capture to send to server on next position update
    this.food_capture_queue.push({fi: fi, radius: this.radius()});
};

ZOR.PlayerController.prototype.getPlayerId = function ZORPlayerControllerGetPlayerId() {
    return this.model.id;
};

ZOR.PlayerController.prototype.getSphereId = function ZORPlayerControllerGetSphereId() {
    return this.model.sphere.id;
};

ZOR.PlayerController.prototype.getPosition = function ZORPlayerControllerGetPosition() {
    return this.view.mainSphere.position;
};

/**
 * Get the current value of the player's speed.
 * @returns {number}
 */
ZOR.PlayerController.prototype.getSpeed = function ZORPlayerControllerGetSpeed() {
    return this.model.getSpeed();
};

ZOR.PlayerController.prototype.getScore = function ZORPlayerControllerGetScore() {
    return this.model.getScore();
};

ZOR.PlayerController.prototype.setAlpha = function ZORPlayerControllerSetAlpha(alpha) {
    if (this.view) {
        this.view.setAlpha(alpha);
    }
};

ZOR.PlayerController.prototype.initView = function ZORPlayerControllerInitView(scene) {
    this.view = new ZOR.PlayerView(this.model, scene, this.is_current_player, this.skinName);
};

ZOR.PlayerController.prototype.removeView = function ZORPlayerControllerRemoveView(scene) {
    this.view.remove(scene);
    this.view = undefined;
};

ZOR.PlayerController.prototype.grow = function ZORPlayerControllerGrow(amount) {
    this.model.sphere.scale += amount;
};

/**
 * Grow the player in an animation
 * @param amount Amount to grow
 * @param num_frames Number of frames to animate growth
 */
ZOR.PlayerController.prototype.animatedGrow = function ZORPlayerControllerAnimatedGrow(amount, num_frames) {
    this._animated_grow_frames = num_frames;
    this._animated_grow_amount = amount / num_frames;
};

ZOR.PlayerController.prototype.refreshSphereModel = function ZORPlayerControllerRefreshSphereModel() {
    if (!this.view) {
        return;
    }

    // sync position
    this.model.sphere.position.copy(this.view.mainSphere.position);
};

ZOR.PlayerController.prototype.handleCapture = function ZORPlayerControllerHandleCapture(capturedPlayer) {
    this.view.handleCapture(capturedPlayer);
};

ZOR.PlayerController.prototype.updateScale = function ZORPlayerControllerUpdateScale(scale) {
    this.setScale(scale);
    this.view.update(scale);
};

ZOR.PlayerController.prototype.updateDrain = function ZORPlayerControllerUpdateDrain(drain_target_id) {
    this.model.sphere.drain_target_id = drain_target_id;
    this.view.updateDrain( drain_target_id );
};

ZOR.PlayerController.prototype.updatePosition = function ZORPlayerControllerUpdatePosition(position) {
    this.model.sphere.position.copy(position);
    this.view.updatePosition(position);
};

/**
 * Returns the radius of the player sphere in terms of the sphere scale
 * @returns {number}
 */
ZOR.PlayerController.prototype.radius = function ZORPlayerControllerRadius() {
    // calculate radius the same as the server
    return this.model.sphere.scale;
};

ZOR.PlayerController.prototype.setScale = function ZORPlayerControllerSetScale(scale) {
    // set the scale on model
    this.model.sphere.scale = scale;
};

ZOR.PlayerController.prototype.update = function ZORPlayerControllerUpdate(scene, camera, camera_controls, lag_scale) {

    // first update any player abilities
    this.model.abilities.speed_boost.update();

    if (config.AUTO_RUN_ENABLED) {
        this.moveForward(camera); // always move forward
    }
    this.applyVelocity(lag_scale, camera_controls);
    this.view.adjustCamera(this.radius());

    // Update drain
    this.view.updateDrain(this.model.sphere.drain_target_id);

    // check if we need to animate anything
    if (this._animated_grow_frames > 0) {
        this.view.grow(this._animated_grow_amount);
        this._animated_grow_frames--;
    }
};

ZOR.PlayerController.prototype.applyVelocity = function ZORPlayerControllerApplyVelocity(lag_scale, camera_controls) {
    this.model.sphere.velocity.sub( camera_controls.velocityRequest );
    this.model.sphere.velocity.normalize();
    this.model.sphere.velocity.multiplyScalar( player.getSpeed() * lag_scale );

    this.view.mainSphere.position.sub(
        UTIL.adjustVelocityWallHit(
            this.view.mainSphere.position,
            0,
            this.model.sphere.velocity,
            zorbioModel.worldSize
        )
    );

    // sync position with model
    this.model.sphere.position.copy(this.view.mainSphere.position);

    // Save recent positions for speed validation on the server
    this.addRecentPosition();

    // reset the velocity requested by camera controls.  this should be done
    // inside the camera controls but I couldn't find a good place to do it.
    camera_controls.velocityRequest.set( 0, 0, 0 );
};

ZOR.PlayerController.prototype.addRecentPosition = function ZORPlayerControllerAddRecentPosition() {
    var p = {x: this.view.mainSphere.position.x, y: this.view.mainSphere.position.y, z: this.view.mainSphere.position.z};

    var time = Date.now() - this.model.createdTime;  // milliseconds since the player was created
    this.model.sphere.recentPositions.push({position: p, radius: this.radius(), time: time});

    if (this.model.sphere.recentPositions.length > config.PLAYER_POSITIONS_WINDOW) {
        this.model.sphere.recentPositions.shift();  // remove the oldest position
    }
};

ZOR.PlayerController.prototype.resetVelocity = function ZORPlayerControllerResetVelocity() {
    this.model.sphere.velocity.set( 0, 0, 0 );
};

ZOR.PlayerController.prototype.moveForward = function ZORPlayerControllerMoveForward(camera) {
    var v = this.move_forward_v;
    var mainSphere = this.view.mainSphere;
    v.copy( mainSphere.position );
    v.sub( camera.position );
    v.multiplyScalar( -1 );
    v.normalize();
    v.multiplyScalar( this.getSpeed() );
    this.model.sphere.velocity.add( v );
};

ZOR.PlayerController.prototype.moveBackward = function ZORPlayerControllerMoveBackward(camera) {
    var v = this.move_backward_v;
    var mainSphere = this.view.mainSphere;
    v.copy( mainSphere.position );
    v.sub( camera.position );
    v.normalize();
    v.multiplyScalar( this.getSpeed() );
    this.model.sphere.velocity.add( v );
};

ZOR.PlayerController.prototype.setCameraControls = function ZORPlayerControllerSetCameraControls(camera_controls) {
    this.view.setCameraControls(camera_controls);
};

ZOR.PlayerController.prototype.speedBoostStart = function ZORPlayerControllerSpeedBoostStart() {
    this.model.abilities.speed_boost.activate();
};

ZOR.PlayerController.prototype.speedBoostStop = function ZORPlayerControllerSpeedBoostStop() {
    this.model.abilities.speed_boost.deactivate();
};

/**
 * @return {boolean}
 */
ZOR.PlayerController.prototype.isSpeedBoostActive = function ZORPlayerControllerIsSpeedBoostActive() {
    return this.model.abilities.speed_boost.isActive();
};

/**
 * @return {boolean}
 */
ZOR.PlayerController.prototype.isSpeedBoostReady = function ZORPlayerControllerIsSpeedBoostReady() {
    return this.model.abilities.speed_boost.isReady();
};

/**
 * Set the activity state of the speed boost on the model, for tracking other players speed boost.
 * NOTE: this does NOT activate speed boost, just sets the active flag for other players.
 * @param state
 */
ZOR.PlayerController.prototype.setSpeedBoostActive = function ZORPlayerControllerSetSpeedBoostActive(state) {
    this.model.abilities.speed_boost.active = state;
};


ZOR.PlayerController.prototype.setTargetLock = function ZORPlayerControllerSetTargetLock(player_id) {
    this.targeting_player_id = player_id;
};

ZOR.PlayerController.prototype.getTargetLock = function ZORPlayerControllerGetTargetLock() {
    return this.targeting_player_id;
};
