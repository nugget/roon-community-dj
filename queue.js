const WebSocket = require('ws');

const ws = new WebSocket('ws://rem.nuggethaus.net:4242');

var readline = require('readline');
var rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false
});

rl.on('line', function(line){
    ws.send(line);
})

ws.on('open', function open() {
    console.log(`Here are some sample lines you can paste:
{"action":"PLAYING","title":"Tearing Me Up","subtitle":"Bob Moses","album":"Days Gone By"}
{"action":"PLAYING","title":"House In LA","subtitle":"Jungle","album":"House In LA"}
{"action":"PLAYING","title":"Talk","subtitle":"Bob Moses","album":"Days Gone By"}
{"action":"PLAYING","title":"Lacuna","subtitle":"Will Samson","album":"Paralanguage"}
{"action":"PLAYING","title":"The Heat","subtitle":"Jungle","album":"Jungle"}
    `);
});

ws.on('message', function incoming(data) {
  console.log(data);
});
