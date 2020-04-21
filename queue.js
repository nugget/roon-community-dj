var WebSocket = require("@oznu/ws-connect");
var config = require("./config.json");

var serverid = "devserver";

var url = config.settings.server;
console.log("Connecting to %s", url);
var ws = new WebSocket(url);

var readline = require("readline");
var rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false
});

rl.on("line", function (line) {
    if (line == "") {
        return;
    }

    try {
        var track = JSON.parse(line);
    } catch (e) {
        console.log("INVALID");
        return;
    }

    track.serverid = serverid;
    track.channel = config.settings.channel;

    ws.send(JSON.stringify(track));
});

ws.on("open", function open() {
    console.log("Connection open");
});

ws.on("message", function incoming(data) {
    try {
        var track = JSON.parse(data);
    } catch (e) {
        console.log("NOT JSON", e);
        return;
    }

    if (track.action == "PLAYING") {
        console.log(data);
    }
});
