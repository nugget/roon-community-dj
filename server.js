var pjson = require("./package.json");

const semver = require("semver");
const WebSocket = require("ws");

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

function log(...args) {
    var ts = new Date().toISOString().replace(/T/, " ").replace(/\..+/, "");
    console.log(ts, ...args);
}

log("Server Started");

wss.on("connection", function connection(ws, req) {
    var remoteAddr = req.connection.remoteAddress;
    log("JOIN", remoteAddr);
    greeting(ws);

    ws.on("message", function incoming(data) {
        try {
            var msg = JSON.parse(data);
        } catch (e) {
            log("REJECT", data);
            return;
        }

        checkVersion(msg);

        log("MESG", req.connection.remoteAddress, data);
        wss.clients.forEach(function each(client) {
            if (client !== ws && client.readyState === WebSocket.OPEN) {
                client.send(data);
            }
        });
    });

    ws.on("close", function close() {
        log("DROP", remoteAddr);
    });
});

function checkVersion(msg) {
    log("Checking version", msg);
}

function greeting(ws) {
    var msg = new Object();
    msg.action = "CONNECT";
    msg.version = pjson.version;

    ws.send(JSON.stringify(msg));
}
