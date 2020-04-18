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

function search_test() {
    console.log("SEARCH TEST");

    let searchTerm = "Never Gonna Give You Up";

    if (true) {
        do_search(config.get("streamingzone").output_id, searchTerm);
        return;
    }

    var options = Object.assign(
        {
            hierarchy: "search",
            input: searchTerm,
            zone_or_output_id: config.get("streamingzone").output_id
        },
        options
    );

    core.services.RoonApiBrowse.browse(options, function (error, payload) {
        console.log("*********************************");
        console.log("ERROR", error);
        console.log("PAYLOAD", payload);

        var opt2 = Object.assign(
            {
                hierarchy: "search"
            },
            opt2
        );

        core.services.RoonApiBrowse.load(opt2, function (error, payload) {
            console.log("^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^");
            console.log("ERROR", error);
            console.log("PAYLOAD", payload);

            var opt = Object.assign(
                {
                    hierarchy: "search",
                    item_key: "8:4"
                },
                opt
            );

            core.services.RoonApiBrowse.load(opt, function (error, payload) {
                console.log("%%%%%%%%%%%%%%%%");
                console.log("ERROR", error);
                console.log("PAYLOAD", payload);
            });
        });
    });
}

function do_search(zone_id, searchTerm) {
    opts = Object.assign({
        hierarchy: "search",
        zone_or_output_id: zone_id,
        input: searchTerm
    });

    core.services.RoonApiBrowse.browse(opts, search_loop);
}

function search_loop(err, r) {
    console.log("R", r);
    console.log("ERR", err);

    if (err) {
        console.log(err, r);
        return;
    }

    if (r.action == "list") {
        core.services.RoonApiBrowse.load({ hierarchy: "search" }, search_loop);
    } else {
        r.items.forEach(obj => {
            if (obj.title == "Tracks") {
                core.services.RoonApiBrowse.browse({hierarchy: "search", item_key: obj.item_key }, search_loop);
            }
        });
    } 
}

function handler(cmd, data) {
    search_test();
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
}

function stopped_handler(zd) {
}

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
exports.search_test = search_test;
