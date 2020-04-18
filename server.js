const WebSocket = require("ws");

const wss = new WebSocket.Server({
    port: 8080,
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
    var ts = new Date().toISOString().replace(/T/, ' ').replace(/\..+/, '');
    console.log(ts, ...args);
}

log("Server Started");

function noop() {}

function heartbeat() {
    log("heartbeat");
    this.isAlive = true;
}

wss.on("connection", function connection(ws, req) {
    ws.isAlive = true;
    ws.on('pong', heartbeat);

    log("Connection from %s",  req.connection.remoteAddress);
    ws.on("message", function incoming(data) {
        log("message", data);
        wss.clients.forEach(function each(client) {
            if (client !== ws && client.readyState === WebSocket.OPEN) {
                client.send(data);
            }
        });
    });
});

const interval = setInterval(function ping() {
      wss.clients.forEach(function each(ws) {
    if (ws.isAlive === false) return ws.terminate();

    ws.isAlive = false;
    ws.ping(noop);
  });
}, 30000);

wss.on('close', function close() {
  clearInterval(interval);
});
