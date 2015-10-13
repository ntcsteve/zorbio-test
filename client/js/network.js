/**
 * Client network related functions
 */

var socket;

function connectToServer(playerType, playerName, color) {
    if (!socket) {
        socket = io({query: "type=" + playerType + "&name=" + playerName + "&color=" + color});
        setupSocket(socket);
    }
    socket.emit('respawn');
}

function sendPlayerSpherePosition() {
    // cut down on the number of bytes sent across the wire
    var position = {
        x: player.sphere.geo.position.x.toFixed(4),
        y: player.sphere.geo.position.y.toFixed(4),
        z: player.sphere.geo.position.z.toFixed(4)
    };
    var sphere = {"id": player.sphere.id, "p": position};
    socket.emit('myPosition', sphere);

    //TODO: only send if the player is moving.  If their position hasn't changed, don't send.
}

function setupSocket(socket) {
    console.log('Game handleNetwork');

    // Handle connection
    socket.on('welcome', function (playerSettings, model, playerSpheres) {
        player = playerSettings;
        zorbioModel = model;
        playerSpherePositions = playerSpheres;

        socket.emit('gotit', player);
        gameStart = true;
        console.log('Game is started: ' + gameStart);

        // start sending the players position every 1/10 of a second
        window.setInterval(sendPlayerSpherePosition, 70);

        // create the scene
        var scene = createScene();

        // Add the other players currently in the game to the scene
        drawOtherPlayerSpheres();

        // Register a render loop to repeatedly render the scene
        engine.runRenderLoop(function () {
            scene.render();
        });

        //TODO: add chat system
        //chat.addSystemLine('Connected to the game!');
        //chat.addSystemLine('Type <b>-help</b> for a list of commands');
        if (isMobile.any) {
            //TODO: handle mobile UI stuff
            //document.getElementById('gameAreaWrapper').removeChild(document.getElementById('chatbox'));
        }
        document.getElementById('renderCanvas').focus();
    });

    socket.on('playerJoin', function (newPlayer) {
        //TODO: implement chat system
        //chat.addSystemLine('Player <b>' + data.name + '</b> joined!');

        //TODO: should the client also keep track of ZOR.Player objects and not just actors?
        zorbioModel.actors[newPlayer.sphere.id] = newPlayer.sphere;

        //TODO: refactor otherPlayers into the model somehow, it's late and I'm just trying to see other players
        if (newPlayer.id !== player.id) {
            playerSpherePositions[newPlayer.sphere.id] = newPlayer.sphere;
            var newSphereGeo = drawPlayerSphere(newPlayer.sphere);
            playerSpherePositions[newPlayer.sphere.id].geo = newSphereGeo;
        }

        console.log('Player ' + newPlayer.name + ' joined!');
    });

    socket.on('gameSetup', function (data) {
        console.log('Games finished setting up', data);
    });

    socket.on('playerPositions', function (newPlayerSpheresPositions) {
        if (!gameStart) {
            return; // don't start updating player positions in the client until their game has started
        }

        Object.getOwnPropertyNames(newPlayerSpheresPositions).forEach(function(id) {
            playerSpherePositions[id].position = newPlayerSpheresPositions[id].position;
        });
    });

    /*
     // Handle ping
     socket.on('pong', function () {
     var latency = Date.now() - startPingTime;
     debug('Latency: ' + latency + 'ms');
     chat.addSystemLine('Ping: ' + latency + 'ms');
     });

     // Handle error
     socket.on('connect_failed', function () {
     socket.close();
     disconnected = true;
     });

     socket.on('disconnect', function () {
     socket.close();
     disconnected = true;
     });

     // Handle connection
     socket.on('welcome', function (playerSettings) {
     player = playerSettings;
     player.name = playerName;
     player.screenWidth = screenWidth;
     player.screenHeight = screenHeight;
     player.target = target;
     socket.emit('gotit', player);
     gameStart = true;
     debug('Game is started: ' + gameStart);
     chat.addSystemLine('Connected to the game!');
     chat.addSystemLine('Type <b>-help</b> for a list of commands');
     if (mobile) {
     document.getElementById('gameAreaWrapper').removeChild(document.getElementById('chatbox'));
     }
     document.getElementById('cvs').focus();
     });

     socket.on('gameSetup', function(data) {
     gameWidth = data.gameWidth;
     gameHeight = data.gameHeight;
     resize();
     });

     socket.on('playerDied', function (data) {
     chat.addSystemLine('Player <b>' + data.name + '</b> died!');
     });

     socket.on('playerDisconnect', function (data) {
     chat.addSystemLine('Player <b>' + data.name + '</b> disconnected!');
     });

     socket.on('playerJoin', function (data) {
     chat.addSystemLine('Player <b>' + data.name + '</b> joined!');
     });

     socket.on('leaderboard', function (data) {
     leaderboard = data.leaderboard;
     var status = '<span class="title">Leaderboard</span>';
     for (var i = 0; i < leaderboard.length; i++) {
     status += '<br />';
     if (leaderboard[i].id == player.id){
     if(leaderboard[i].name.length !== 0)
     status += '<span class="me">' + (i + 1) + '. ' + leaderboard[i].name + "</span>";
     else
     status += '<span class="me">' + (i + 1) + ". A cell unnamed</span>";
     } else {
     if(leaderboard[i].name.length !== 0)
     status += (i + 1) + '. ' + leaderboard[i].name;
     else
     status += (i + 1) + '. A cell unnamed';
     }
     }
     //status += '<br />Players: ' + data.players;
     document.getElementById('status').innerHTML = status;
     });

     socket.on('serverMSG', function (data) {
     chat.addSystemLine(data);
     });

     // Chat
     socket.on('serverSendPlayerChat', function (data) {
     chat.addChatLine(data.sender, data.message, false);
     });

     // Handle movement
     socket.on('serverTellPlayerMove', function (userData, foodsList, massList) {
     var playerData;
     for(var i =0; i< userData.length; i++) {
     if(typeof(userData[i].id) == "undefined") {
     playerData = userData[i];
     i = userData.length;
     }
     }
     if(playerType == 'player') {
     var xoffset = player.x - playerData.x;
     var yoffset = player.y - playerData.y;

     player.x = playerData.x;
     player.y = playerData.y;
     player.hue = playerData.hue;
     player.massTotal = playerData.massTotal;
     player.cells = playerData.cells;
     player.xoffset = isNaN(xoffset) ? 0 : xoffset;
     player.yoffset = isNaN(yoffset) ? 0 : yoffset;
     }
     users = userData;
     foods = foodsList;
     fireFood = massList;
     });

     // Die
     socket.on('RIP', function () {
     gameStart = false;
     died = true;
     window.setTimeout(function() {
     document.getElementById('gameAreaWrapper').style.opacity = 0;
     document.getElementById('startMenuWrapper').style.maxHeight = '1000px';
     died = false;
     if (animLoopHandle) {
     window.cancelAnimationFrame(animLoopHandle);
     animLoopHandle = undefined;
     }
     }, 2500);
     });

     socket.on('kick', function (data) {
     gameStart = false;
     reason = data;
     kicked = true;
     socket.close();
     });
     */
}