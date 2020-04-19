var zonedata = require("./zonedata.js"),
    djserver = require("./djserver.js"),
    config = require("./config.js");

var roon_zones = {};

var core, transport;

function ready() {
    // console.log("READYCHECK", transport);
    if (!transport) {
        return false;
    }

    return true;
}

function core_paired(_core) {
    core = _core;

    transport = core.services.RoonApiTransport;
    transport.subscribe_zones(handler);

    transport.get_zones(function (msg, body) {
        if (config.debug) {
            console.log("GET_ZONES", body);
            console.log("ARRAY", body.zones[1].outputs);
        }
    });
}

function play_track(title, subtitle, album) {
    console.log("PLAY_TRACK", title, subtitle);
    opts = Object.assign({
        hierarchy: "search",
        input: title,
        pop_all: true,
        
    });

    console.log("PLAY opts", opts);

    core.services.RoonApiBrowse.browse(
        opts,
        search_loop.bind(null, title, subtitle)
    );
}

function success(err, r) {
    console.log("PLAYED!", err, r);
}

function search_loop(title, subtitle, err, r) {
    console.log("R", r);

    if (err) {
        console.log("SEARCH_LOOP ERROR", err, r);
        return;
    }

    if (r.action == "list") {
        console.log("BRANCH action is list");
        core.services.RoonApiBrowse.load(
            { hierarchy: "search" },
            search_loop.bind(null, title, subtitle)
        );
        return;
    } else if (r.list.title === "Tracks") {
        console.log("BRANCH title is Tracks");
        r.items.forEach(obj => {
            console.log("startswith",obj.subtitle,":", subtitle);
            if (obj.subtitle.startsWith(subtitle)) {
                console.log("startswith hit on ",subtitle);
                core.services.RoonApiBrowse.browse(
                    { hierarchy: "search", item_key: obj.item_key },
                    search_loop.bind(null, title, subtitle)
                );
                return;
            }
        });
    } else {
        console.log("BRANCH everything else");

        r.items.forEach(obj => {
            console.log("OBJ", obj);

            if (obj.title == "Play Now") {
                console.log("PLAYNOW HIT");
                core.services.RoonApiBrowse.browse(
                    {
                        hierarchy: "search",
                        item_key: obj.item_key,
                        zone_or_output_id: config.get("djzone").output_id
                    },
                    success
                );
                return;
            } else if (obj.title == title && obj.subtitle.startsWith(subtitle)) {
                console.log("TITLE HIT");
                core.services.RoonApiBrowse.browse(
                    { hierarchy: "search", item_key: obj.item_key },
                    search_loop.bind(null, title, subtitle)
                );
                return;
            } else if (obj.title == "Tracks") {
                console.log("TRACKS HIT");
                core.services.RoonApiBrowse.browse(
                    { hierarchy: "search", item_key: obj.item_key },
                    search_loop.bind(null, title, subtitle)
                );
                return;
            }
        });
    }
}

function handler(cmd, data) {
    if (typeof data !== "undefined") {
        for (var zoneevent in data) {
            var zones = data[zoneevent];
            for (var index in zones) {
                var zd = zonedata.parse(zones[index]);
                var zonename = zd.display_name;

                if (typeof zonename !== "undefined" && zonename) {
                    //var regex = '';
                    zonename = zonename.replace(/ \+.*/, "");
                    roon_zones[zonename] = JSON.parse(JSON.stringify(zd));

                    if (config.debug) {
                        console.log("PLAYING", zd);
                    }

                    if (typeof zd.state !== "undefined") {
                        switch (zd.state) {
                            case "loading":
                                // Do nothing during short-lived loading pauses
                                break;
                            case "playing":
                                playing_handler(zd);
                                break;
                            case "paused":
                            case "stopped":
                                stopped_handler(zd);
                                break;
                            default:
                                console.log("UNKNOWN zone state: " + zd.state);
                                stopped_handler();
                        }
                    }
                }
            }
        }
    }
}

function playing_handler(zd) {
    djserver.announce_play(zd);
}

function stopped_handler(zd) {}

function core_unpaired(_core) {
    core = _core;

    console.log(
        core.core_id,
        core.display_name,
        core.display_version,
        "-",
        "LOST"
    );
}

exports.core_paired = core_paired;
exports.core_unpaired = core_unpaired;
exports.play_track = play_track;
