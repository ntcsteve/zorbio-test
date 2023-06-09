// ESLint global declarations: https://eslint.org/docs/rules/no-undef
/*
global _:true
*/

let ZOR = {};

let Zorbio = require('../common/zorbio.js');

ZOR.ZORMessageHandler = {};

ZOR.ZORMessageHandler.z_handle_init_game = function ZORhandleInitGame(model) {
    _.assign(global.zorbioModel, model);

    console.log('Game initialzed');
};

ZOR.ZORMessageHandler.z_handle_welcome = function ZORhandleWelcome(msg) {
    let model = msg.player;

    global.player = new Zorbio.Player(model.id, model.name, model.sphere.color, model.type, model.sphere.position,
        model.sphere.scale, model.sphere.velocity, model.sphere.skin);

    console.log('handle welcome');

    return global.player;
};

ZOR.ZORMessageHandler.z_handle_game_setup = function ZORhandleGameSetup() {
    global.zorbioModel.addPlayer(global.player);
    global.gameStart = true;
    console.log('Game Started!');
};

/**
 * @returns {number}
 */
ZOR.ZORMessageHandler.z_handle_send_ping = function ZORhandleSendPing() {
    return 60;  // FPS
};

ZOR.ZORMessageHandler.z_handle_pong = function ZORhandlePong(duration) {
    global.player.ping_metric.add(duration);
    console.log('Ping: ', duration);
};

ZOR.ZORMessageHandler.z_handleNetworkTermination = function ZORhandleNetworkTermination() {
    global.gameStart = false;
    console.log('Connection terminated');
    process.exit();
};

ZOR.ZORMessageHandler.z_handle_actor_updates = function ZORhandleActorUpdates() {
    // Headless don't really care about updating other players positions or size
};

ZOR.ZORMessageHandler.z_handle_player_join = function ZORhandlePlayerJoin(newPlayer) {
    global.zorbioModel.addPlayer(newPlayer);

    console.log('Player joined: ', newPlayer.id, newPlayer.name);
};

ZOR.ZORMessageHandler.z_handle_server_tick = function ZORHandleServerTick() {
    // don't care about anything in server tick slow
};


ZOR.ZORMessageHandler.z_handle_captured_player = function ZORHandleCapturePlayer() {
    // Headless doesn't caputure players
};

ZOR.ZORMessageHandler.z_handle_you_died = function ZORHandleYouDied(msg) {
    global.playerDead = true;
    global.gameStart = false;

    console.log('YOU DIED! You were alive for ' + msg.time_alive + ' seconds. Killed by: ', msg.attacking_player_id);
};

ZOR.ZORMessageHandler.z_handle_player_died = function ZORHandlePlayerDied(capturedPlayerId) {
    global.zorbioModel.removePlayer(capturedPlayerId);
    console.log('Player was captured: ', capturedPlayerId);
};

ZOR.ZORMessageHandler.z_handle_remove_player = function ZORHandleRemovePlayer(playerId) {
    global.zorbioModel.removePlayer(playerId);
    console.log('Removed Player: ', playerId);
};

ZOR.ZORMessageHandler.z_handle_kick = function ZORhandleKick(reason) {
    console.log('you were kicked: ', reason);
    global.gameStart = false;
    global.playerDead = true;
};

ZOR.ZORMessageHandler.handle_speed_boost_res = function ZORhandleSpeedBoostRes() {
    // Headless does not speedboost
};

ZOR.ZORMessageHandler.z_handle_speed_boost_stop = function ZORhandleSpeedBoostStop() {
    // Headless does not speedboost
};

ZOR.ZORMessageHandler.z_handle_client_position_rapid = function ZORhandleClientPositionRapid() {
    // dont care about updating client positions
};

ZOR.ZORMessageHandler.z_handle_leaderboard_update = function ZORHandLeaderboardUpdate() {
    // dont care
};

module.exports = ZOR.ZORMessageHandler;
