var pjson = require("./package.json");
var debugFlag = true;

const semver = require("semver");
const WebSocket = require("ws");
const util = require("util");

var express = require("express");
var graphqlHTTP = require("express-graphql");
var { buildSchema } = require("graphql");

var channelCache = new Map();

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
    log(...args);
}

function clientDebug(...args) {
    if (!debugFlag) {
        return;
    }
    clientLog(...args);
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

        if (msg.mode == "slave") {
            didTheDJDrop(ws, msg);
        }
        // console.log(ws);

        ws.log("MESG", data);
        wss.clients.forEach(function each(client) {
            if (client !== ws && client.readyState === WebSocket.OPEN) {
                if (
                    typeof client.dj.channel !== "undefined" &&
                    client.dj.channel.toUpperCase() ==
                        msg.channel.toUpperCase()
                ) {
                    client.send(data);
                }
            }
            processMessage(ws, msg);
        });
    });

    ws.on("close", function close() {
        var msg = {};
        msg.action = "DROP";
        msg.channel = ws.dj.channel;
        msg.nickname = ws.dj.nickname;
        msg.serverid = ws.dj.serverid;

        didTheDJDrop(ws, msg);

        ws.log("DROP", JSON.stringify(msg));

        wss.clients.forEach(function each(client) {
            if (client !== ws && client.readyState === WebSocket.OPEN) {
                if (
                    typeof client.dj.channel !== "undefined" &&
                    typeof msg.channel !== "undefined" &&
                    client.dj.channel.toUpperCase() ==
                        msg.channel.toUpperCase()
                ) {
                    client.send(JSON.stringify(msg));
                }
            }
        });
    });
});

function didTheDJDrop(c, msg) {
    if (typeof msg.channel === "undefined") {
        // No channel in this message
        return
    }

    cUC = msg.channel.toUpperCase();
    if (typeof channelCache[cUC] !== "undefined") {
        var currentDJ = channelCache[cUC].serverid;
        if (msg.serverid === currentDJ) {
            c.log("We lost our DJ");
            channelCache[cUC] = {};
        }
    }
}

function processMessage(c, msg) {
    if (typeof msg.channel !== "undefined") {
        cUC = msg.channel.toUpperCase();

        if (!channelCache[cUC]) {
            channelCache[cUC] = {};
        }

        var a = {};
        a.action = msg.action;
        //a.start = Math.floor(new Date() / 1000) - msg.seek_position;

        switch (msg.action) {
            case "PLAYING":
                a.description = "DJ'ing";
                a.title = msg.title;
                a.artist = msg.subtitle;
                a.album = msg.album;
                a.length = msg.length;
                a.serverid = msg.serverid;

                if (msg.mode == "master") {
                    channelCache[cUC] = a;
                }
                c.dj.activity = channelCache[cUC];
                break;
            case "STOPPED":
                a.description = "Nothing Playing";

                if (msg.mode == "master") {
                    channelCache[cUC] = a;
                }
                c.dj.activity = a;
                break;
            case "PAUSED":
                a.description = "Nothing Playing";

                if (msg.mode == "master") {
                    channelCache[cUC] = a;
                }
                c.dj.activity = a;
                break;
            case "SLAVE":
                a.description = "Listening";
                a.title = msg.title;
                a.artist = msg.subtitle;
                a.album = msg.album;
                a.length = msg.length;

                c.dj.activity = a;
                break;
            case "NOTFOUND":
                a.description = "Song Not Available";

                c.dj.activity = a;
                break;
        }
    }
}

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
        );
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

// GraphQL Handlers Here

var schema = buildSchema(`
    type User {
        channel: String
        serverid: String
        nickname: String
        enabled: Boolean
        mode: String
        version: String
        activity: Action
    }

    type Channel {
        name: String
        users: [User]
        dj: User
        userCount: Int
        activity: Action
    }

    type Action {
        action: String
        description: String
        start: Int
        title: String
        artist: String
        album: String
        length: Int
    }

    type Query {
        version: String
        users(channel: String): [User]
        channels: [Channel]
    }
`);

var root = {
    hello: () => {
        return pjson.version;
    },
    users: ({ channel }) => {
        return userList(channel);
    },
    channels: () => {
        return channelList();
    }
};

var api = express();
api.use(
    "/graphql",
    graphqlHTTP({
        schema: schema,
        rootValue: root,
        graphiql: true
    })
);
api.listen(8282);
console.log("Running a GraphQL API server at http://localhost:8282/graphql");

function userList(channel) {
    var l = [];
    wss.clients.forEach(function each(c) {
        if (c.readyState === WebSocket.OPEN) {
            if (!channel) {
                l.push(c.dj);
            } else if (
                channel &&
                c.dj.channel &&
                channel.toUpperCase() == c.dj.channel.toUpperCase()
            ) {
                l.push(c.dj);
            }
        }
    });
    return l;
}

function channelDJ(channel) {
    var l = userList(channel);
    for (var u of l) {
        if (u.mode == "master") {
            return u;
        }
    }
    return {};
}

function channelList() {
    var channelList = [];
    wss.clients.forEach(function each(c) {
        var obj = {};
        if (
            c.readyState === WebSocket.OPEN &&
            typeof c.dj.channel !== "undefined"
        ) {
            var picked = channelList.find(
                o => o.name.toUpperCase() === c.dj.channel.toUpperCase()
            );
            if (!picked) {
                // Usern's channel is new to us
                obj.name = c.dj.channel;
                obj.users = userList(obj.name);
                obj.userCount = obj.users.length;
                obj.dj = channelDJ(obj.name);
                if (!obj.dj.serverid) {
                    obj.activity = { action: "NODJ", description: "No DJ" };
                } else {
                    obj.activity = channelCache[c.dj.channel.toUpperCase()];
                }
                channelList.push(obj);
            }
        }
    });

    return channelList;
}
