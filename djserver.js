var zonedata = require("./zonedata.js"),
    roonevents = require("./roonevents.js"),
    config = require("./config.js"),
    stats = require("./status.js"),
    log = require("./log.js"),
    pjson = require("./package.json");

const semver = require("semver");

var WebSocket = require("@oznu/ws-connect");
var ws;
var roon_status = "Initializing";

var listeners = 0;

function connect() {
    var url = config.get("server");
    log.info("Connecting to %s", url);

    ws = new WebSocket(url);

    ws.on("message", data => {
        parse_message(data);
    });

    ws.on("open", () => {
        log.info("Connected to djserver");
        stats.svc.set_status("Connected to DJserver", false);
        announce();
    });

    //ws.on("json", data => {
    //    log.info("JSON FROM SERVER", data);
    //});

    ws.on("close", () => {
        log.info("djserver Connection Closed");
    });

    ws.on("websocket-status", status => {
        log.info("WSSTATUS", status);
        if (status.indexOf("Error") > -1) {
            stats.svc.set_status(status, true);
        }
    });
}

function reconnectIfNeeded() {
    if (config.get("server") != ws.address) {
        log.info("Recycling connection to DJ Server");
        ws.close();
        set_status("Reconnecting", false);
        connect();
    }
}

function parse_message(data) {
    log.info("WSMESSAGE", data);

    try {
        var msg = JSON.parse(data);
    } catch (e) {
        log.info("NOT JSON", e);
        return;
    }

    if (!config.flag("enabled")) {
        return;
    }

    // Global message types
    switch (msg.action) {
        case "REJECT":
            rejected(msg);
            break;
    }

    // Channel specific message types
    if (msg.channel == config.get("channel")) {
        log.info("msg.action was '" + msg.action + "'");
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
                log.info("Unknown message type", msg.action);
                break;
        }

        set_status();
    }
}

function rejected(msg) {
    log.error("Rejected by server (%s)", msg.reason);
    stats.svc.set_status(msg.reason, true);
    return;
}

function disable(msg) {
    config.set("enabled", false);
    stats.svc.set_status(msg, true);
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

    log.info("set_status", msg);
    stats.svc.set_status(msg, false);
}

function slave_track(track) {
    if (config.get("mode") == "slave") {
        roonevents.play_track(track.title, track.subtitle);
    } else {
        if (config.get("serverid") != track.serverid) {
            log.info("NEW MASTER DETECTED");
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
        log.info("Not announcing in-progress playback");
        return;
    }

    log.debug("ANNOUNCE", data);

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
    log.info("Announced playback of %s - %s", msg.title, msg.subtitle);
    set_status();
}

function report_error(text, err, trace) {
    if (config.flag("debug")) {
        var msg = new Object();
        msg.action = "ERROR";
        msg.serverid = config.get("serverid");
        msg.channel = config.get("channel");
        msg.text = text;
        msg.errtext = err;
        msg.trace = trace;

        ws.send(JSON.stringify(msg));
    }
}

function search_success(title, subtitle, err, r) {
    if (err) {
        log.info("SEARCH_SUCCESS error", err);
        report_error("search failed", err, {
            title: title,
            subtitle: subtitle,
            r: r
        });
        return;
    }

    if (config.get("mode") == "slave" && config.flag("debug")) {
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
exports.reconnectIfNeeded = reconnectIfNeeded;
exports.roon_status = roon_status;
exports.set_status = set_status;
exports.announce = announce;
exports.reconnectIfNeeded = reconnectIfNeeded;
exports.report_error = report_error;
