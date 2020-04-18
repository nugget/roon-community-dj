var zonedata = require("./zonedata.js"),
    roonevents = require("./roonevents.js"),
    config = require("./config.js");

function heartbeat() {
    clearTimeout(this.pingTimeout);

    // Use `WebSocket#terminate()`, which immediately destroys the connection,
    // instead of `WebSocket#close()`, which waits for the close timer.
    // Delay should be equal to the interval at which your server
    // sends out pings plus a conservative assumption of the latency.
    this.pingTimeout = setTimeout(() => {
        this.terminate();
    }, 30000 + 1000);
}

const WebSocket = require("ws");

var ws;

function connect() {
    var url = config.get("server");
    console.log("Connecting to %s", url);
    ws = new WebSocket(url);

    ws.on("ping", heartbeat);

    ws.on("close", function clear() {
        clearTimeout(this.pingTimeout);
    });

    ws.on("open", function open() {
        ws.on("message", function incoming(data) {
            parse_message(data);
        });
    });
}

function parse_message(data) {
    console.log("WSMESSAGE", data);

    try {
        var track = JSON.parse(data);
    } catch (e) {
        console.log("NOT JSON", e);
        return;
    }

    console.log("TRACK", track);

    if (config.get("mode") == "slave") {
        roonevents.play_track(track.title, track.subtitle);
    }
}

function announce_play(data) {
    if (config.get("mode") == "master") {
        console.log("ANNOUNCE", data);

        if (data.zone_id != config.get("djzone").output_id) {
            console.log("Not my zone", config.get("djzone"));
        }

        var msg = new Object();
        msg.action = "PLAYING";
        msg.title = data.now_playing.three_line.line1;
        msg.subtitle = data.now_playing.three_line.line2;
        msg.album = data.now_playing.three_line.line3;

        ws.send(JSON.stringify(msg));
    }
}

exports.announce_play = announce_play;
exports.connect = connect;
