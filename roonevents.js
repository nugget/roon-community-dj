var zonedata = require("./zonedata.js"),
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

function play_track(title, subtitle) {
    console.log("PLAY_TRACK", title, subtitle);
    opts = Object.assign({
        hierarchy: "search",
        input: title
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
    console.log("ERR", err);

    if (err) {
        console.log(err, r);
        return;
    }

    if (r.action == "list") {
        console.log("BRANCH action is list");
        core.services.RoonApiBrowse.load(
            { hierarchy: "search" },
            search_loop.bind(null, title, subtitle)
        );
    } else if (r.list.title === "Tracks") {
        console.log("BRANCH title is Tracks");
        r.items.forEach(obj => {
            if (obj.subtitle == subtitle) {
                core.services.RoonApiBrowse.browse(
                    { hierarchy: "search", item_key: obj.item_key },
                    search_loop.bind(null, title, subtitle)
                );
            }
        });
    } else {
        console.log("BRANCH everything else");

        r.items.forEach(obj => {
            if (obj.title == "Tracks") {
                core.services.RoonApiBrowse.browse(
                    { hierarchy: "search", item_key: obj.item_key },
                    search_loop.bind(null, title, subtitle)
                );
            }

            if (obj.title == title && obj.subtitle == subtitle) {
                core.services.RoonApiBrowse.browse(
                    { hierarchy: "search", item_key: obj.item_key },
                    search_loop.bind(null, title, subtitle)
                );
            }

            if (obj.title == "Play Now") {
                core.services.RoonApiBrowse.browse(
                    {
                        hierarchy: "search",
                        item_key: obj.item_key,
                        zone_or_output_id:
                            "1701fa13b47e4ae20588acf651c74e9a6302"
                    },
                    success
                );
            }
        });
    }
}

function handler(cmd, data) {
    play_track(
        "Never Gonna Give You Up",
        "Rick Astley, Pete Waterman, Mike Stock, Matt Aitken"
    );

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

function playing_handler(zd) {}

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
