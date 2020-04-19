var zonedata = require("./zonedata.js"),
    roonevents = require("./roonevents.js"),
    config = require("./config.js"),
    pjson = require("./package.json");

var WebSocket = require("@oznu/ws-connect");
var ws;

var roon_status = "Initializing";

function connect() {
    var url = config.get("server");
    console.log("Connecting to %s", url);

    ws = new WebSocket(url);

    ws.on("message", data => {
        parse_message(data);
    });

    ws.on("open", () => {
        console.log("Connected to djserver");
        greet();
    });

    //ws.on("json", data => {
    //    console.log("JSON FROM SERVER", data);
    //});

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
        return;
    }

    try {
        var track = JSON.parse(data);
    } catch (e) {
        console.log("NOT JSON", e);
        return;
    }

    if (track.channel == config.get("channel")) {
        switch (track.action) {
            case "PLAYING":
                slave_track(track);
                break;
            case "POLL":
                poll_response(track);
                break;
            default:
                console.log("Unknown message type", track.action);
                break;
        }
    }
}

function slave_track(track) {
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

function greet() {
    var msg = new Object();
    msg.action = "ANNOUNCE";
    msg.serverid = config.get("serverid");
    msg.channel = config.get("channel");
    msg.version = pjson.version;
    msg.mode = config.get("mode");

    ws.send(JSON.stringify(msg));
}

function poll_response(track) {
    var msg = new Object();
    msg.action = "ROLLCALL";
    msg.serverid = config.get("serverid");
    msg.channel = config.get("channel");

    ws.send(JSON.stringify(msg));
}

function announce_play(data) {
    if (!config.flag("enabled")) {
        return;
    }

    if (data.now_playing.seek_position > 10) {
        console.log("Not announcing in-progress playback");
        return;
    }

    console.log("ANNOUNCE", data);

    var msg = new Object();

    if (config.get("mode") == "master") {
        msg.action = "PLAYING";
    } else {
        msg.action = "SLAVE";
 
    }

    msg.serverid = config.get("serverid");
    msg.channel = config.get("channel");
    msg.title = data.now_playing.three_line.line1;
    msg.subtitle = data.now_playing.three_line.line2;
    msg.album = data.now_playing.three_line.line3;
    msg.version = pjson.version;
    msg.length = data.now_playing.length;

    ws.send(JSON.stringify(msg));
}

function search_success(title, subtitle, err, r) {
    if (err) {
        console.log("SEARCH_SUCCESS error", err);
        return;
    }

    if (config.get("mode") == "slave") {
        var msg = new Object();
        msg.action = "SEARCH_SUCCESS";
        msg.serverid = config.get("serverid");
        msg.channel = config.get("channel");
        msg.title = title;
        msg.subtitle = subtitle;
        msg.version = pjson.version;

        ws.send(JSON.stringify(msg));
    }
}

exports.announce_play = announce_play;
exports.search_success = search_success;
exports.connect = connect;
exports.roon_status = roon_status;
