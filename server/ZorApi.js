var NODEJS = typeof module !== 'undefined' && module.exports;

var basicAuth = require('basic-auth');
var config    = require('../common/config.js');
var Zorbio    = require('../common/zorbio.js');

/**
 * Api for accessing and updating game state through http.
 * @param app
 * @param model
 * @param sockets
 * @constructor
 */
var ZorApi = function zorApi (app, instances) {
    self.app = app;
    self.instances = instances;

    ///////////////////////////////////////////////////////////////////
    // API
    ///////////////////////////////////////////////////////////////////

    // Basic Auth
    self.basicAuth = function appBasicAuth (req, res, next) {
        var user = basicAuth(req);
        //noinspection JSUnresolvedVariable
        if (!user || !user.name || !user.pass) {
            res.set('WWW-Authenticate', 'Basic realm=Authorization Required');
            res.sendStatus(401);
            return;
        }

        //noinspection JSUnresolvedVariable
        if (user.name === 'zoruser' && user.pass === 'Z0r-b!0') {
            next();
        } else {
            res.set('WWW-Authenticate', 'Basic realm=Authorization Required');
            res.sendStatus(401);
        }
    };
    self.app.all("/api/*", self.basicAuth);

    /**
     * API to return the current count of players on this server
     */
    self.app.get('/api/games', function (req, res) {
        var total_players = 0;
        var total_bots = 0;
        var total_clients = 0;
        var games = [];

        self.instances.forEach(function eachInstance(instance) {
            var client_count = instance.getClientCount();
            var player_count = instance.getPlayerCount(Zorbio.PlayerTypes.PLAYER);
            var bot_count    = instance.getPlayerCount(Zorbio.PlayerTypes.BOT);
            var instance_info = {
                id: instance.id,
                clients: client_count,
                players: player_count,
                bots: bot_count,
            };
            total_clients += client_count;
            total_players += player_count;
            total_bots += bot_count;
            games.push(instance_info);
        });

        var response = {
            total_players: total_players,
            total_bots: total_bots,
            total_clients: total_clients,
            percent_full:  (total_players / (config.MAX_PLAYERS_PER_INSTANCE * config.NUM_GAME_INSTANCES)) * 100,
            games: games,
        };

        res.setHeader('content-type', 'application/json');
        res.send( JSON.stringify(response) );
    });

    /**
     * API to return the current count of players on this server
     */
    self.app.get('/api/games/:game_id/players/count', function (req, res) {
        var instance = self.instances[req.params.game_id];
        if (instance) {
            var count = instance.model.players.length;
            res.setHeader('content-type', 'application/json');
            res.send( "{\"count\": " + count + "}" );
        }
        else {
            res.sendStatus(406);
        }
    });

    /**
     * API to return all the player objects on this server
     */
    self.app.get('/api/games/:game_id/players', function (req, res) {
        var instance = self.instances[req.params.game_id];
        if (instance) {
            res.setHeader('content-type', 'application/json');
            res.send( JSON.stringify(instance.model.players) );
        }
        else {
            res.sendStatus(406);
        }
    });

    /**
     * API to return all the player objects on this server
     */
    self.app.get('/api/games/:game_id/out', function (req, res) {
        var instance = self.instances[req.params.game_id];
        if (instance) {
            res.setHeader('content-type', 'application/json');
            res.send( JSON.stringify(instance.out) );
        }
        else {
            res.sendStatus(406);
        }
    });

    /**
     * API to return all the actor objects on this server
     */
    self.app.get('/api/games/:game_id/actors', function (req, res) {
        var instance = self.instances[req.params.game_id];
        if (instance) {
            res.setHeader('content-type', 'application/json');
            res.send( JSON.stringify(instance.model.actors) );
        }
        else {
            res.sendStatus(406);
        }
    });

    /**
     * API to return all the actor objects on this server
     */
    self.app.get('/api/games/:game_id/food', function (req, res) {
        var instance = self.instances[req.params.game_id];
        if (instance) {
            var foodModel = {};
            foodModel.foodDensity = instance.model.foodDensity;
            foodModel.foodCount = instance.model.foodCount;
            foodModel.food_respawning_indexes = instance.model.food_respawning_indexes;
            foodModel.food_respawn_ready_queue = instance.model.food_respawn_ready_queue;

            res.setHeader('content-type', 'application/json');
            res.send( JSON.stringify(foodModel) );
        }
        else {
            res.sendStatus(406);
        }
    });

    /**
     * API to number of socket connections
     */
    self.app.get('/api/games/:game_id/clients/count', function (req, res) {
        var instance = self.instances[req.params.game_id];
        if (instance) {
            var clientIds = Object.getOwnPropertyNames(instance.clients);
            var count = typeof clientIds.length !== 'undefined' ? clientIds.length : 0;
            res.setHeader('content-type', 'application/json');
            res.send( "{\"count\": " + count + "}" );
        }
        else {
            res.sendStatus(406);
        }
    });
};

if (NODEJS) module.exports = ZorApi;
