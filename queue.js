var WebSocket = require("@oznu/ws-connect");

var serverid = "devserver";

var url = "ws://djserver.nuggethaus.net:4242/";
console.log("Connecting to %s", url);
var ws = new WebSocket(url);

var readline = require("readline");
var rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false
});

rl.on("line", function (line) {
    try {
        var track = JSON.parse(line);
    } catch (e) {
        console.log("NOT JSON", e);
        return;
    }

    track.serverid = serverid;
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
