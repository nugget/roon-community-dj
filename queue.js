const WebSocket = require('ws');

const ws = new WebSocket('ws://localhost:8080');

ws.on('open', function open() {
  ws.send(`{"title":"You Can't Fight Fate","subtitle":"Taylor Dayne"}`)
});

ws.on('message', function incoming(data) {
  console.log(data);
});
