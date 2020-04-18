var config = require("./config.js"),
    zonedata = require("./zonedata.js"),
    roonevents = require("./roonevents.js"),
    djserver = require("./djserver.js");


var RoonApi = require("node-roon-api"),
    RoonApiStatus = require("node-roon-api-status"),
    RoonApiTransport = require("node-roon-api-transport"),
    RoonApiSettings = require("node-roon-api-settings"),
    RoonApiImage = require("node-roon-api-image"),
    RoonApiBrowse = require("node-roon-api-browse");

var roon = new RoonApi({
    extension_id: "org.macnugget.community-dj",
    display_name: "Community DJ",
    display_version: "0.0.1",
    publisher: "Nugget",
    email: "nugget@macnugget.org",
    website: "https://github.com/nugget/roon-community-dj",
    core_paired: roonevents.core_paired,
    core_unpaired: roonevents.core_unpaired
});

var roon_svc_status = new RoonApiStatus(roon);

var roon_svc_settings = new RoonApiSettings(roon, {
    get_settings: function (cb) {
        cb(config.layout(config.all()));
    },
    save_settings: function (req, isdryrun, settings) {
        let l = config.layout(settings.values);
        req.send_complete(l.has_error ? "NotValid" : "Success", {
            settings: l
        });

        if (!isdryrun && !l.has_error) {
            roon_svc_settings.update_settings(l);
            roon.save_config("settings", l.values);
            config.update(l.values);
        }
    }
});

config.load(roon);

roon.init_services({
    required_services: [RoonApiTransport, RoonApiBrowse],
    provided_services: [roon_svc_settings, roon_svc_status]
});

roon.start_discovery();
