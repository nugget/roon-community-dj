var pjson = require("./package.json");
var debugFlag = true;

const semver = require("semver");
const WebSocket = require("ws");
const util = require("util");

const wss = new WebSocket.Server({
    port: 4242,
    perMessageDeflate: {
        zlibDeflateOptions: {
            // See zlib defaults.
            chunkSize: 1024,
            memLevel: 7,
            level: 3
        },
        zlibInflateOptions: {
            chunkSize: 10 * 1024
        },
        // Other options settable:
        clientNoContextTakeover: true, // Defaults to negotiated value.
        serverNoContextTakeover: true, // Defaults to negotiated value.
        serverMaxWindowBits: 10, // Defaults to negotiated value.
        // Below options specified as default values.
        concurrencyLimit: 10, // Limits zlib concurrency for perf.
        threshold: 1024 // Size (in bytes) below which messages
        // should not be compressed.
    }
});

// This is a bare server log for non-connection-specific log lines.  It emits
// to stdout with the current timestamp prepended.
//
function log(template, ...args) {
    var ts = new Date().toISOString().replace(/T/, " ").replace(/\..+/, "");
    template = "%s " + template;
    console.log(template, ts, ...args);
}

// This is a prototype function which is bound to each websocket client object
// which will emit a lot line with the timestamp and client remote address
// prepended.  Not to be called directly, it's instead bound to ws.log during
// connection setup and should be invoked using the method on the ws object.
//
function clientLog(ra, template, ...args) {
    var ts = new Date().toISOString().replace(/T/, " ").replace(/\..+/, "");
    template = "%s [%s] " + template;
    console.log(template, ts, ra, ...args);
}

function debug(...args) {
    if (!debugFlag) {
        return;
    }
    log(...args)
}

function clientDebug(...args) {
    if (!debugFlag) {
        return;
    }
    clientLog(...args)
}

function exit(signal) {
    log("Exiting on %s", signal);
    process.exit();
}

process.on("SIGTERM", exit);
process.on("SIGINT", exit);

log("%s v%s launching (%s)", pjson.name, pjson.version, pjson.homepage);

wss.on("connection", function connection(ws, req) {
    ws.dj = {};
    setRemoteAddr(ws, req);
    ws.log = clientLog.bind(null, ws.dj.remoteAddr);
    ws.debug = clientDebug.bind(null, ws.dj.remoteAddr);

    ws.log("New remote connection established");

    greeting(ws);

    ws.on("message", function incoming(data) {
        try {
            var msg = JSON.parse(data);
        } catch (e) {
            ws.log("BOGUS", data);
            return;
        }

        probeClient(ws, msg);

        if (!checkVersion(ws)) {
            ws.log("IGNORED", data);
            return;
        }

        // console.log(ws);

        ws.log("MESG", data);
        wss.clients.forEach(function each(client) {
            if (client !== ws && client.readyState === WebSocket.OPEN) {
                if (
                    typeof client.dj.channel !== "undefined" &&
                    client.dj.channel.toUpperCase() == msg.channel.toUpperCase()
                ) {
                    client.send(data);
                }
            }
        });
    });

    ws.on("close", function close() {
        var msg = {}
        msg.nickname = ws.dj.nickname;
        msg.serverid = ws.dj.serverid;
        msg.channel = ws.dj.channel;
        msg.action = "DROP";

        ws.log("DROP", JSON.stringify(msg));

        wss.clients.forEach(function each(client) {
            if (client !== ws && client.readyState === WebSocket.OPEN) {
                if (
                    typeof client.dj.channel !== "undefined" &&
                    client.dj.channel.toUpperCase() == msg.channel.toUpperCase()
                ) {
                    client.send(JSON.stringify(msg));
                }
            }
        });
    });
});

function setRemoteAddr(c, req) {
    c.dj.remoteAddr =
        req.headers["x-forwarded-for"] || req.connection.remoteAddress;
}

function probeClient(c, msg) {
    // Set some of our client attributes to the websocket object for
    // tracking internally
    if (typeof msg.channel !== "undefined") {
        c.dj.channel = msg.channel;
    }

    if (typeof msg.serverid !== "undefined") {
        c.dj.serverid = msg.serverid;
    }

    if (typeof msg.nickname !== "undefined") {
        c.dj.nickname = msg.nickname;
    }

    if (typeof msg.enabled !== "undefined") {
        c.dj.enabled = msg.enabled;
    }

    if (typeof msg.mode !== "undefined") {
        c.dj.mode = msg.mode;
    }

    if (typeof msg.version !== "undefined") {
        c.dj.version = msg.version;
    }
}

function requiredVersion() {
    myVersion = semver.parse(pjson.version);
    return util.format("%s.%s.x", myVersion.major, myVersion.minor);
}

function checkVersion(c) {
    if (typeof c.dj.version === "undefined") {
        c.debug("Ignoring client with unknown version");
        return false;
    }

    if (!semver.valid(c.dj.version)) {
        c.debug("Ignoring client with bogus version");
        return false;
    }

    if (!semver.satisfies(c.dj.version, requiredVersion())) {
        // client version does not satisfy requirements
        reason = util.format(
            "Upgrade required, server requires version %s",
            requiredVersion()
        )
        reject(c, reason);
        return false;
    }

    return true;
}

function greeting(c) {
    var msg = new Object();
    msg.action = "CONNECT";
    msg.version = pjson.version;

    c.send(JSON.stringify(msg));
}

function reject(c, reason) {
    var msg = new Object();
    msg.action = "REJECT";
    msg.reason = reason;
    msg.version = pjson.version;

    c.send(JSON.stringify(msg));
    c.log("Rejected client (%s)", reason);
}
