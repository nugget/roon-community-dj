var zonedata = require("./zonedata.js"),
    roonevents = require("./roonevents.js"),
    config = require("./config.js"),
    stats = require("./status.js"),
    pjson = require("./package.json");

const semver = require("semver");

var WebSocket = require("@oznu/ws-connect");
var ws;
var roon_status = "Initializing";

var listeners = 0;

function connect() {
    var url = config.get("server");
    console.log("Connecting to %s", url);

    ws = new WebSocket(url);

    ws.on("message", data => {
        parse_message(data);
    });

    ws.on("open", () => {
        console.log("Connected to djserver");
        stats.svc.set_status("Connected to DJserver", false);
        announce();
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

    try {
        var msg = JSON.parse(data);
    } catch (e) {
        console.log("NOT JSON", e);
        return;
    }

    check_version(msg);

    if (!config.flag("enabled")) {
        return;
    }

    if (msg.channel == config.get("channel")) {
        console.log("msg.action was '" + msg.action + "'");
        switch (msg.action) {
            case "PLAYING":
                slave_track(msg);
                listeners = 0;
                break;
            case "SLAVE":
                listeners++;
                break;
            case "POLL":
                poll_response(msg);
                break;
            default:
                console.log("Unknown message type", msg.action);
                break;
        }

        set_status();
    }
}

function check_version(msg) {
    if (!semver.valid(msg.version)) {
        disable("Bogus server version (" + msg.version + ")");
        return;
    }

    if (!semver.satisfies(pjson.version, msg.version)) {
        disable("Needs Upgrade (DJ server is v" + msg.version + ")");
        return;
    }

    return;
}

function disable(msg) {
    stats.svc.set_status(msg, true);
    config.set("enabled", false);
    return;
}

function set_status() {
    if (!config.flag("enabled")) {
        stats.svc.set_status("Extension disabled", false);
        return;
    }

    var msg = "";
    if (config.get("mode") == "master") {
        msg = "DJing in ";
    } else {
        msg = "Listening to ";
    }

    msg += config.get("channel");
    msg += " (" + listeners + " listeners)";

    console.log("set_status", msg);
    stats.svc.set_status(msg, false);
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

function announce() {
    var msg = new Object();
    msg.action = "ANNOUNCE";
    msg.serverid = config.get("serverid");
    msg.channel = config.get("channel");
    msg.version = pjson.version;
    msg.mode = config.get("mode");
    msg.enabled = config.flag("enabled");

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
        listeners = 0;
    } else {
        msg.action = "SLAVE";
        listeners++;
    }

    msg.serverid = config.get("serverid");
    msg.channel = config.get("channel");
    msg.title = data.now_playing.three_line.line1;
    msg.subtitle = data.now_playing.three_line.line2;
    msg.album = data.now_playing.three_line.line3;
    msg.version = pjson.version;
    msg.length = data.now_playing.length;

    ws.send(JSON.stringify(msg));

    set_status();
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
exports.set_status = set_status;
exports.announce = announce;
