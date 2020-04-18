const WebSocket = require('ws');

const ws = new WebSocket('ws://rem.nuggethaus.net:4242');

ws.on('open', function open() {
  ws.send(`{"title":"You Can't Fight Fate","subtitle":"Taylor Dayne"}`)
});

ws.on('message', function incoming(data) {
  console.log(data);
});
