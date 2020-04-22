var zonedata = require("./zonedata.js"),
    djserver = require("./djserver.js"),
    log = require("./log.js"),
    config = require("./config.js");

const uuidv4 = require("uuid/v4");

var roon_zones = {};

var core, transport;

function ready() {
    if (!transport) {
        log.trace("READYCHECK not ready");
        return false;
    }

    return true;
}

function core_paired(_core) {
    core = _core;

    transport = core.services.RoonApiTransport;
    transport.subscribe_zones(handler);
}

function normalize(text) {
    return text;
}

function play_track(title, subtitle, album) {
    log.info("PLAY_TRACK '%s', '%s'", title, subtitle);

    title = normalize(title);
    subtitle = normalize(subtitle);
    // We have troubles because Roon loves to emit multi-artist subtitles
    // separated with the slash character.  But in searches it expects comma
    // seperated artits.  We punt and just strip off all but the primary artist
    // for our search.  It might be that we want to replace() the slash with
    // a comma, but this seems like a more resilient strategy as a first
    // attempt.
    subtitle = subtitle.split(" / ")[0];

    log.info("NORMALIZED '%s', '%s'", title, subtitle);

    opts = Object.assign({
        hierarchy: "search",
        input: title + " " + subtitle,
        pop_all: true
    });

    //log.info("PLAY opts", opts);

    core.services.RoonApiBrowse.browse(
        opts,
        search_loop.bind(null, title, subtitle)
    );
}

function search_loop(title, subtitle, err, r) {
    log.info("STARTING search_loop for '%s' '%s'", title, subtitle);
    log.debug("R", r);

    if (err) {
        log.error("SEARCH_LOOP ERROR", err, r);
        djserver.report_error("search failed", err, {
            title: title,
            subtitle: subtitle,
            r: r
        });
        return;
    }

    if (r.action == "message") {
        if (r.is_error) {
            log.error("Message from search api: %s", r.message);
        } else {
            log.info("Message from search api: %s", r.message);
        }
        return;
    }

    if (r.action == "list") {
        // If action is list then our result has directly followed a search
        // that we have requested.  All we need to do in this case is send
        // an immediate load() with the same hierarchy as our search and we'll
        // get the actual results.  This is the least ambiguous result we can
        // see from the API.
        log.debug("list detected, requesting load()");
        core.services.RoonApiBrowse.load(
            { hierarchy: "search" },
            search_loop.bind(null, title, subtitle)
        );
        return;
    }

    // Nexxt up, we want to know if Roon is asking us to limit our search to
    // only a specific type of item.  In this case, we always want to narrow it
    // down to just tracks.  If there's an item here titled "Tracks" and our
    // list title is "Search" then we want to hit that button straight away
    if (r.list.title === "Search") {
        log.debug("title is 'search', looking for a tracks item");
        for (var obj of r.items) {
            if (obj.title == "Tracks" && obj.hint == "list") {
                log.info("limiting our search to just tracks");
                core.services.RoonApiBrowse.browse(
                    { hierarchy: "search", item_key: obj.item_key },
                    search_loop.bind(null, title, subtitle)
                );
                return;
            }
        }
    }

    // Have we been given a list of tracks to search?  If so, let's try
    // to find our song!  This is where we should place the most clever
    // matching logic.
    if (r.list.title === "Tracks") {
        log.debug(
            "search has given us a list of tracks (%s)",
            r.list.subtitle
        );

        for (var obj of r.items) {
            if (obj.title == title && obj.subtitle.startsWith(subtitle)) {
                // I think this is our song!
                log.debug("I think I got a good hit on our song");
                core.services.RoonApiBrowse.browse(
                    { hierarchy: "search", item_key: obj.item_key },
                    search_loop.bind(null, title, subtitle)
                );
                return;
            }
        }
    }

    // Is there a play button for us?
    if (r.list.hint == "action_list") {
        log.debug("It's an action list");
        for (var obj of r.items) {
            log.debug("OBJ", obj);
            if (obj.title == "Play Now" && obj.hint == "action") {
                log.debug("PLAYNOW HIT", obj.title, obj.item_key);
                core.services.RoonApiBrowse.browse(
                    {
                        hierarchy: "search",
                        item_key: obj.item_key,
                        zone_or_output_id: config.get("djzone").output_id
                    },
                    djserver.search_success.bind(null, title, subtitle)
                );
                return;
            }
        }
    }

    if (r.list.title === title && r.list.subtitle.startsWith(subtitle)) {
        // This coult be improved.  We want the best match not just the first
        // match, but it's unclear exactly how we should do that or if there's
        // a big benefit to trying to be clever here.  Revisit later.
        log.debug("this is our guy!  tell me what to do");

        core.services.RoonApiBrowse.browse(
            { hierarchy: "search", item_key: r.items[0].item_key },
            search_loop.bind(null, title, subtitle)
        );
        return;
    }

    log.warn("unexpected result from search api", r);
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

                    log.debug("zone event", zd);

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
                                log.warn("UNKNOWN zone state: %s", zd.state);
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
        log.info("extension is disabled");
        return;
    }

    o = zd.outputs;

    Object.keys(o).forEach(function (key) {
        var val = o[key];
        if (val.output_id == config.get("djzone").output_id) {
            // This is a song playing in the configured DJ Zone
            djserver.announce_play(zd);
        } else {
            log.info(
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
    log.warn("Roon core unpaired", core);
}

exports.core_paired = core_paired;
exports.core_unpaired = core_unpaired;
exports.play_track = play_track;
