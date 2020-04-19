var RoonApiStatus = require("node-roon-api-status");

var svc;

function init(roon) {
    svc = new RoonApiStatus(roon);
    console.log("Initialized RoonApiStatus", svc);
}

exports.init = init;
exports.svc = svc;
