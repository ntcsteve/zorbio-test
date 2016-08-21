var ZOR = ZOR || {};

/**
 * This class represents the view aspects of a player sphere.  Like how the sphere is rendered, how it looks
 * visually, and how to move it's different 3D pieces around.
 * @constructor
 * @param model
 * @param scene
 */

ZOR.PlayerView = function ZORPlayerView(model, scene, current, skinName) {
    this.model = model;
    this.scene = scene;
    this.is_current_player = current || false;
    this.playerColor = config.COLORS[model.sphere.color];
    this.skinName = skinName;
    this.skin = ZOR.PlayerSkins[this.skinName || 'default'](this);

    this.geometry = new THREE.SphereGeometry(
        1,
        config.PLAYER_SPHERE_POLYCOUNT,
        config.PLAYER_SPHERE_POLYCOUNT
    );

    playerFogCenter.copy(model.sphere.position);
    this.material = new THREE.ShaderMaterial( this.skin.material.uniforms );

    if (config.FOOD_ALPHA_ENABLED) {
        this.material.depthWrite = true;
    }

    this.mainSphere = new THREE.Mesh( this.geometry, this.material );
    this.mainSphere.position.copy(model.sphere.position);

    this.drainView = new ZOR.DrainView(this, scene);

    this.setScale(model.sphere.scale);

    this.mainSphere.player_id = this.model.id;
    ZOR.Game.player_meshes.push(this.mainSphere);  // store mesh for raycaster search

    scene.add( this.mainSphere );

    this.initTrail();
};

ZOR.PlayerView.prototype.initTrail = function ZORPlayerInitTrail() {
    this.trail = particleGroup = new SPE.Group(this.skin.trail.group);

    this.trailEmitter = new SPE.Emitter(this.skin.trail.emitter);

    this.trailClock = new THREE.Clock();
    this.trail.mesh.renderOrder = 1;
    this.trail.mesh.frustumCulled = false;
    this.trail.addEmitter( this.trailEmitter );
    this.scene.add( this.trail.mesh );
};

ZOR.PlayerView.prototype.updateTrail = function ZORPlayerUpdateTrail() {
    var oldPos = this.trailEmitter.position._value.clone();
    var newPos = this.mainSphere.position.clone();

    this.trailEmitter.position._value.x = newPos.x;
    this.trailEmitter.position._value.y = newPos.y;
    this.trailEmitter.position._value.z = newPos.z;

    var scale = Math.PI* 3/4 * this.mainSphere.scale.x;
    // this.trailEmitter.position._radius = scale;
    this.trailEmitter.size._value =  [scale, scale*2/3, scale*1/3, 0];

    var boosting = this.model.abilities.speed_boost.isActive();

    if (boosting) {
        this.trailEmitter.activeMultiplier = 1;
    }
    else {
        this.trailEmitter.activeMultiplier = 0.1;
    }

    // var speed = oldPos.clone().sub(newPos).length();
    // var diffPos = newPos.sub(oldPos).multiplyScalar(speed);

    // this.trailEmitter.velocity._value.x = diffPos.x;
    // this.trailEmitter.velocity._value.y = diffPos.y;

    this.trailEmitter.updateFlags.position = true;
    this.trailEmitter.updateFlags.velocity = true;
    this.trailEmitter.updateFlags.size = true;

    this.trail.tick( this.trailClock.getDelta() );
};

ZOR.PlayerView.prototype.grow = function ZORPlayerViewGrow(amount) {
    this.mainSphere.scale.addScalar( amount );
    this.mainSphere.scale.clampScalar( 1, config.MAX_PLAYER_RADIUS );
    this.mainSphere.geometry.computeBoundingSphere(); // compute the new bounding sphere after resizing
};

ZOR.PlayerView.prototype.update = function ZORPlayerViewUpdate(scale) {
    this.setScale( scale * 0.1 + this.mainSphere.scale.x * 0.9);
    this.updateTrail();
};

ZOR.PlayerView.prototype.updateDrain = function ZORPlayerViewUpdateDrain(drain_target_id) {
    this.drainView.update( drain_target_id );
};

ZOR.PlayerView.prototype.setAlpha = function ZORPlayerViewSetAlpha(alpha) {
    // TODO remove transparent true/false
    this.material.transparent = !alpha;

    // TODO implement this
    // this.material.alpha = alpha;
};

ZOR.PlayerView.prototype.updatePosition = function ZORPlayerViewUpdatePosition(position) {
    this.mainSphere.position.lerp(position, config.PLAYER_MOVE_LERP_WEIGHT);
};

ZOR.PlayerView.prototype.remove = function ZORPlayerViewRemove(scene) {
    this.drainView.dispose();
    this.trail.emitters.forEach(function (emitter) { emitter.remove(); });
    this.trail.dispose();
    scene.remove(this.mainSphere);

    // find the player mesh used for raycasting and remove it
    for (var i = 0; i < ZOR.Game.player_meshes.length; i++) {
        var playerMesh = ZOR.Game.player_meshes[i];

        if (playerMesh && playerMesh.player_id === this.model.id) {
            // remove this players mesh
            console.log("Removing mesh for player: ", this.model.id);
            ZOR.Game.player_meshes.splice(i, 1);
        }
    }
};

ZOR.PlayerView.prototype.setScale = function ZORPlayerViewSetScale(scale) {
    this.mainSphere.scale.set(scale, scale, scale);
    this.mainSphere.scale.clampScalar( 1, config.MAX_PLAYER_RADIUS );
    this.mainSphere.geometry.computeBoundingSphere();
};

ZOR.PlayerView.prototype.setCameraControls = function ZORPlayerViewSetCameraControls(camera_controls) {
    this.camera_controls = camera_controls;
};

ZOR.PlayerView.prototype.adjustCamera = function ZORPlayerViewAdjustCamera(scale) {
    this.camera_controls.minDistance = scale / Math.tan( Math.PI * camera.fov / 360 ) + 100;
    this.camera_controls.maxDistance = this.camera_controls.minDistance;
};
