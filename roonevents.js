var zonedata = require("./zonedata.js"),
    djserver = require("./djserver.js"),
    config = require("./config.js");

const uuidv4 = require('uuid/v4');

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

function normalize(text) {
    return text;
}

function play_track(title, subtitle, album) {
    console.log("PLAY_TRACKi '%s', '%s'", title, subtitle);

    title = normalize(title);
    subtitle = normalize(subtitle);
    // We have troubles because Roon loves to emit multi-artist subtitles
    // separated with the slash character.  But in searches it expects comma
    // seperated artits.  We punt and just strip off all but the primary artist
    // for our search.  It might be that we want to replace() the slash with
    // a comma, but this seems like a more resilient strategy as a first
    // attempt.
    subtitle = subtitle.split(" / ")[0];

    console.log("NORMALIZED", title, subtitle);

    opts = Object.assign({
        hierarchy: "search",
        input: title + " " + subtitle,
        pop_all: true
    });

    console.log("PLAY opts", opts);

    core.services.RoonApiBrowse.browse(
        opts,
        search_loop.bind(null, title, subtitle)
    );
}

function search_loop(title, subtitle, err, r) {
    loopid = uuidv4().split("-")[0];

    console.log("STARTING search_loop id", loopid);

    console.log(loopid + " R", r);

    if (err) {
        console.log("SEARCH_LOOP ERROR", err, r);
        return;
    }

    if (r.action == "list") {
        console.log(loopid + " BRANCH action is list");
        core.services.RoonApiBrowse.load(
            { hierarchy: "search" },
            search_loop.bind(null, title, subtitle)
        );
        console.log(loopid + " return 0");
        return;
    } else if (r.list.title === "Tracks") {
        console.log(loopid + " BRANCH title is Tracks");

        for (var obj of r.items) {
            console.log(loopid + " startswith", obj.subtitle, ":", subtitle);
            if (obj.subtitle.startsWith(subtitle)) {
                console.log(loopid + " startswith hit on ", subtitle);
                core.services.RoonApiBrowse.browse(
                    { hierarchy: "search", item_key: obj.item_key },
                    search_loop.bind(null, title, subtitle)
                );
                console.log(loopid + " return 1");
                return;
            }
        };
    } else {
        console.log(loopid + " BRANCH everything else");

        for (var obj of r.items) {
            console.log(loopid + " OBJ", obj);

            if (obj.title == "Play Now") {
                console.log(loopid + " PLAYNOW HIT", obj.title, obj.item_key);
                core.services.RoonApiBrowse.browse(
                    {
                        hierarchy: "search",
                        item_key: obj.item_key,
                        zone_or_output_id: config.get("djzone").output_id
                    },
                    djserver.search_success.bind(null, title, subtitle)
                );
                console.log(loopid + " return 2");
                return;
            } else if (obj.title == "Tracks") {
                console.log(loopid + " TRACKS HIT");
                core.services.RoonApiBrowse.browse(
                    { hierarchy: "search", item_key: obj.item_key },
                    search_loop.bind(null, title, subtitle)
                );
                console.log(loopid + " return 4");
                return;
            } else if (
                obj.title == title &&
                obj.subtitle.startsWith(subtitle)
            ) {
                console.log(loopid + " TITLE HIT");
                core.services.RoonApiBrowse.browse(
                    { hierarchy: "search", item_key: obj.item_key },
                    search_loop.bind(null, title, subtitle)
                );
                console.log(loopid + " return 3");
                return;
            }
        }
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
    if (!config.flag("enabled")) {
        console.log("extension is disabled");
        return;
    }

    o = zd.outputs;

    Object.keys(o).forEach(function (key) {
        var val = o[key];
        if (val.output_id == config.get("djzone").output_id) {
            // This is a song playing in the configured DJ Zone
            djserver.announce_play(zd);
        } else {
            console.log(
                "Mismatched zone",
                val.output_id,
                config.get("djzone").output_id
            );
        }
    });
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
