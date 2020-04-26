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

var users = [];

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
    if (
        msg.channel &&
        msg.channel.toUpperCase() == config.get("channel").toUpperCase()
    ) {
        track_user(msg);
        switch (msg.action) {
            case "PLAYING":
                reset_users();
                track_user(msg);
                slave_track(msg);
                break;
            case "SLAVE":
                break;
            case "POLL":
                poll_response(msg);
                break;
            case "ANNOUNCE":
                process_announce(msg);
                break;
            case "NOTFOUND":
                process_notfound(msg);
                break;
            case "DROP":
                forget_user();
                break;
            default:
                log.info("Unknown message type", msg.action);
                break;
        }

        user_stats();
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
    }

    msg += util.format(
        "%s in %s (%d listeners)",
        current_dj(),
        config.get("channel"),
        listener_count()
    );

    setStatus(false, msg);
}

function reset_users() {
    log.debug("Restting users object");
    users = [];

    var me = {}
    me.serverid = config.get("serverid");
    me.nickname = config.get("nickname");
    if (config.get("mode") == "master") {
        me.dj = true;
    } else {
        me.dj = false;
    }

    users.push(me);
}

function user_stats() {
    log.info("There are %d known users", users.length);
    console.log(users);
}

function user_is_known(serverid) {
    for (var u of users) {
        if (u.serverid == serverid) {
            return true;
        }
    }
    return false;
}

function current_dj() {
    for (var u of users) {
        if (u.dj) {
            return u.nickname;
        }
    }

    return "an anonymous dj";
}

function listener_count() {
    var c = 0;

    for (var u of users) {
        if (!u.dj) {
            c++;
        }
    }
    return c;
}

function update_user(u) {
    for (i = 0; i < users.length; i++) {
        ul = users[i];
        if (u.serverid == ul.serverid) {
            users[i] = { ...users[i], ...u };
            return;
        }
    }
    users.push(u);
}

function forget_user(track) {
    for (i = 0; i < users.length; i++) {
        ul = users[i];
        if (track.serverid == ul.serverid) {
            users.splice(i, 1);
            return;
        }
    }
}

function track_user(track) {
    var u = {};
    u.nickname = track.nickname;
    u.serverid = track.serverid;
    if (track.action == "PLAYING" || track.mode == "master") {
        u.dj = true;
    } else {
        u.dj = false;
    }

    if (track.action == "SLAVE") {
        u.slave = true;
    }
    if (track.action == "NOTFOUND") {
        u.notfound = true;
    }

    update_user(u);
}

function slave_track(track) {
    if (track.seek_position < 10) {
        // We only want to reset the listener count if this is a fresh play
    }

    if (config.get("mode") == "slave") {
        roonevents.play_track(track);
    } else {
        if (config.get("serverid") != track.serverid) {
            log.info("NEW MASTER DETECTED");
            config.set("mode", "slave");
            roonevents.play_track(track);
        }
    }
}

function announce() {
    var msg = new Object();
    msg.action = "ANNOUNCE";
    msg.channel = config.get("channel");
    msg.nickname = config.get("nickname");
    msg.serverid = config.get("serverid");
    msg.version = pjson.version;
    msg.mode = config.get("mode");
    msg.enabled = config.flag("enabled");

    broadcast(msg);
}

function process_announce(msg) {
    log.info(config.get("mode"));
    if (config.get("mode") == "master") {
        roonevents.announce_nowplaying();
    }
}

function process_notfound(msg) {
    if (config.get("mode") == "master") {
        switch (config.get("notfound")) {
            case "any":
                roonevents.skip_track();
                break;
            case "all":
                log.error("Not Implemented: notfound all");
                break;
        }
    }
}

function poll_response(track) {
    var msg = new Object();
    msg.action = "ROLLCALL";
    msg.serverid = config.get("serverid");
    msg.channel = config.get("channel");

    broadcast(msg);
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

        broadcast(msg);
    }
}

function search_success(t, err, r) {
    if (err) {
        log.info("SEARCH_SUCCESS error", err);
        report_error("search failed", err, {
            title: t.title,
            subtitle: t.subtitle,
            r: r
        });
        return;
    }

    if (false && config.get("mode") == "slave" && config.flag("debug")) {
        // Disabled this because it isn've very useful any more
        var msg = new Object();
        msg.action = "SEARCH_SUCCESS";
        msg.serverid = config.get("serverid");
        msg.channel = config.get("channel");
        msg.title = t.title;
        msg.subtitle = t.subtitle;
        msg.version = pjson.version;

        broadcast(msg);
    }
}

function broadcast(msg) {
    ws.send(JSON.stringify(msg));
}

exports.broadcast = broadcast;
exports.search_success = search_success;
exports.connect = connect;
exports.reconnectIfNeeded = reconnectIfNeeded;
exports.roon_status = roon_status;
exports.set_status = set_status;
exports.announce = announce;
exports.reconnectIfNeeded = reconnectIfNeeded;
exports.report_error = report_error;
