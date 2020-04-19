var zonedata = require("./zonedata.js"),
    roonevents = require("./roonevents.js"),
    config = require("./config.js");

var WebSocket = require("@oznu/ws-connect");
var ws;

function connect() {
    var url = config.get("server");
    console.log("Connecting to %s", url);

    ws = new WebSocket(url);

    ws.on("message", data => {
        parse_message(data);
    });

    ws.on("open", () => {
        console.log("Connected to djserver");
    });

    ws.on("json", data => {
        console.log("JSON FROM SERVER", data);
    });

    ws.on("close", () => {
        console.log("djserver Connection Closed");
    });

    ws.on("websocket-status", status => {
        console.log("WSSTATUS", status);
    });
}

function parse_message(data) {
    console.log("WSMESSAGE", data);

    if (!config.flag("enabled")) {
        return
    }

    try {
        var track = JSON.parse(data);
    } catch (e) {
        console.log("NOT JSON", e);
        return;
    }


    if (track.channel == config.get("channel")) {
        console.log("TRACK", track);
        if (config.get("mode") == "slave") {
            roonevents.play_track(track.title, track.subtitle);
        } else {
            if (config.get("serverid") != track.serverid) {
                console.log("NEW MASTER DETECTED");
                config.set("mode", "slave");
                roonevents.play_track(track.title, track.subtitle);
            }
        }
    }
}

function announce_play(data) {
    if (!config.flag("enabled")) {
        return
    }

    if (config.get("mode") == "master") {
        console.log("ANNOUNCE", data);

        if (data.zone_id != config.get("djzone").output_id) {
            console.log("Not my zone", config.get("djzone"));
        }

        var msg = new Object();
        msg.action = "PLAYING";
        msg.serverid = config.get("serverid");
        msg.channel = config.get("channel");
        msg.title = data.now_playing.three_line.line1;
        msg.subtitle = data.now_playing.three_line.line2;
        msg.album = data.now_playing.three_line.line3;

        ws.send(JSON.stringify(msg));
    }
}

exports.announce_play = announce_play;
exports.connect = connect;
