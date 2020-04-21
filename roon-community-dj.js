var config = require("./config.js"),
    zonedata = require("./zonedata.js"),
    roonevents = require("./roonevents.js"),
    djserver = require("./djserver.js"),
    stats = require("./status.js"),
    log = require("./log.js"),
    pjson = require("./package.json");

var RoonApi = require("node-roon-api"),
    RoonApiTransport = require("node-roon-api-transport"),
    RoonApiStatus = require("node-roon-api-status"),
    RoonApiSettings = require("node-roon-api-settings"),
    RoonApiImage = require("node-roon-api-image"),
    RoonApiBrowse = require("node-roon-api-browse");

var roon = new RoonApi({
    extension_id: "org.macnugget.community-dj",
    display_name: "Community DJ",
    display_version: pjson.version,
    publisher: pjson.author.name,
    email: pjson.author.email,
    website: pjson.homepage,
    core_paired: roonevents.core_paired,
    core_unpaired: roonevents.core_unpaired,
    log_level: "none"
});

var roon_svc_settings = new RoonApiSettings(roon, {
    get_settings: function (cb) {
        cb(config.layout(config.all()));
        log.info("Loaded extension settings from roon core");
        set_core_log_level();
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
            set_core_log_level();
            log.info("Saved extension settings to roon core");

            djserver.reconnectIfNeeded();
            djserver.set_status();
            djserver.announce();
        }
    }
});

function set_core_log_level() {
    if (config.flag("debug")) {
        // Can also set to "all" but that's way too chatty for me
        roon.log_level = "quiet";
    } else {
        roon.log_level = "none";
    }
    log.info("Set roon core log level to %s", roon.log_level);
}

config.load(roon);
stats.svc = new RoonApiStatus(roon);

roon.init_services({
    required_services: [RoonApiTransport, RoonApiBrowse],
    provided_services: [roon_svc_settings, stats.svc]
});

roon.start_discovery();
djserver.connect();
if (config.flag("enabled")) {
    stats.svc.set_status("Extension enabled", false);
} else {
    stats.svc.set_status("Extension disabled", false);
}

set_core_log_level();
log.debug("Hello", roon);
