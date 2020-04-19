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
    log("Connection from ", req.connection.remoteAddress);
    ws.on("message", function incoming(data) {
        log("Message", req.connection.remoteAddress, data);
        wss.clients.forEach(function each(client) {
            if (client !== ws && client.readyState === WebSocket.OPEN) {
                client.send(data);
            }
        });
    });
});
