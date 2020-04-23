var zonedata = require("./zonedata.js"),
    roonevents = require("./roonevents.js"),
    config = require("./config.js"),
    stats = require("./status.js"),
    log = require("./log.js"),
    pjson = require("./package.json");

const semver = require("semver");
const util = require("util");

var WebSocket = require("@oznu/ws-connect");
var ws;
var roon_status = "Initializing";

var listeners = 0;

function setStatus(error, template, ...args) {
    var msg = util.format(template, ...args);
    log.info(msg);
    config.setServerState(msg);
    stats.svc.set_status(msg, error);
}

function connect() {
    var url = config.get("server");
    setStatus(false, "Connecting to %s", url);

    ws = new WebSocket(url);

    ws.on("message", data => {
        parse_message(data);
    });

    ws.on("open", () => {
        setStatus(false, "Connected to DJserver");
        announce();
    });

    //ws.on("json", data => {
    //    log.info("JSON FROM SERVER", data);
    //});

    ws.on("close", () => {
        setStatus(false, "DJserver Connection Closed");
    });

    ws.on("websocket-status", status => {
        log.info("STATUS", status);
        if (status.indexOf("Error") > -1) {
            setStatus(true, status);
        }
    });
}

function reconnectIfNeeded() {
    if (config.get("server") != ws.address) {
        log.info("Recycling connection to DJ Server");
        w.close();
        setStatus(false, "Reconnecting...");
        connect();
    }
}

function parse_message(data) {
    log.info("MESSAGE", data);

    try {
        var msg = JSON.parse(data);
    } catch (e) {
        log.info("NOT JSON", e);
        return;
    }

    if (!config.flag("enabled")) {
        setStatus(false, "Extension disabled");
        return;
    }

    // Global message types
    switch (msg.action) {
        case "REJECT":
            rejected(msg);
            break;
        case "CONNECT":
            check_version(msg);
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
            case "ANNOUNCE":
                // Clients don't need to do anything with this right now
                break;
            default:
                log.info("Unknown message type", msg.action);
                break;
        }

        set_status();
    }
}

function check_version(msg) {
    log.info("CHECK_VERSION", msg);
    if (!semver.valid(msg.version)) {
        log.error("Server reports a bogus version (%s)", msg.version);
    } else {
        if (semver.gt(msg.version, pjson.version)) {
            log.warn(
                "Please consider upgrading.  You are v%s and the server is v%s",
                pjson.version,
                msg.version
            );
            setStatus(true, "Upgrade recommended. Server is v%s", msg.version);
            config.setServerVersion(false, msg.version);
        } else {
            config.setServerVersion(true, msg.version);
        }
    }
}

function rejected(msg) {
    setStatus(true, "Rejected by server (%s)", msg.reason);
    return;
}

function disable(msg) {
    config.set("enabled", false);
    setStatus(false, "Disabled by server (%s)", msg);
    return;
}

function set_status() {
    if (!config.flag("enabled")) {
        setStatus(false, "Extension disabled");
        return;
    }

    var msg = "";
    if (config.get("mode") == "master") {
        msg = "DJing in ";
    } else {
        msg = "Listening to ";
        if (config.get("activedj") !== "") {
            msg += config.get("activedj") + " in ";
        }
    }

    msg += config.get("channel");
    msg += " (" + listeners + " listeners)";

    setStatus(false, msg);
}

function slave_track(track) {
    config.set("activedj", track.nickname);

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

    msg.channel = config.get("channel");
    msg.nickname = config.get("nickname");
    msg.serverid = config.get("serverid");
    msg.title = data.now_playing.three_line.line1;
    msg.subtitle = data.now_playing.three_line.line2;
    msg.album = data.now_playing.three_line.line3;
    msg.version = pjson.version;
    msg.length = data.now_playing.length;
    msg.seek_position = data.now_playing.seek_position;

    ws.send(JSON.stringify(msg));
    log.info("Announced playback of '%s - %s'", msg.title, msg.subtitle);
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
