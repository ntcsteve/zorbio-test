var NODEJS = typeof module !== 'undefined' && module.exports;

if (NODEJS) var schemapack = require('schemapack');

var ZOR = ZOR || {};

ZOR.Schemas = function ZORSchemas() {
    var vector3 = {x: "float32", y: "float32", z: "float32"};
    var actor = {
        id: "varuint",
        position: vector3,
        velocity: vector3,
        scale: "float32",
        type: "string",
        color: "uint8",
        drain_target_id: "varuint",
        speed_boosting: "boolean",
        playerId: "varuint"
    };

    var model = {
        actors: [actor],
        players: [
            {
                id: "varuint",
                name: "string",
                type: "string",
                sphere: actor,
            }
        ],
        worldSize: {x: "uint16", y: "uint16", z: "uint16"},
        food: ["int16"],
        foodCount: "uint32",
        foodDensity: "uint8",
        food_respawning: ["varuint"],
        food_respawn_ready_queue: ["varuint"],
        food_respawning_indexes: ["varuint"]
    };

    var recent_position = {
        position: vector3,
        radius: "float32",
        time: "varuint",
    };

    var food_capture_entry = {
        fi: "varuint",
        radius: "float32",
    };

    var op_init_game = {
        0: "uint8",
        model: model,
    };

    var op_actor_updates = {
        0: "uint8",
        actors: [actor],
    };

    var op_player_update = {
        0: "uint8",
        player_id: "varuint",
        sphere_id: "varuint",
        pp_gap: "varuint",
        au_gap: "varuint",
        buffered_mount: "varuint",
        latest_position: recent_position,
        prev_position_1: recent_position,
        prev_position_2: recent_position,
        prev_position_3: recent_position,
        oldest_position: recent_position,
        food_capture_queue: [food_capture_entry],
    };

    var ops = {
        INIT_GAME: 1,
        ACTOR_UPDATES: 2,
        PLAYER_UPDATE: 3,
    };

    return {
        ops: ops,
        initGameSchema: schemapack.build(op_init_game),
        actorUpdatesSchema: schemapack.build(op_actor_updates),
        playerUdateSchema: schemapack.build(op_player_update),
    }
}();

if (NODEJS) module.exports = ZOR.Schemas;
