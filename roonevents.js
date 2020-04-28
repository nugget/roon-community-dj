var zonedata = require("./zonedata.js"),
    djserver = require("./djserver.js"),
    log = require("./log.js"),
    config = require("./config.js"),
    pjson = require("./package.json");

const uuidv4 = require("uuid/v4");

var roon_zones = {};
var core, transport;
var seek_next_play = 0;

function ready() {
    if (!transport) {
        log.info("transport is not ready");
        return false;
    }

    return true;
}

function core_paired(_core) {
    core = _core;
    log.info("Core Paired");

    transport = core.services.RoonApiTransport;
    transport.subscribe_zones(handler);
}

function track_match(a, b) {
    if (a.title == b.title && a.subtitle.startsWith(b.subtitle)) {
        return true;
    }
    return false;
}

function normalize(text) {
    return text;
}

function play_track(t) {
    if (!ready) {
        return;
    }

    if (config.get("djzone").output_id == "") {
        log.warn(
            "Please choosse an output Zone in the Roon settings extension config"
        );
        return;
    }

    log.info("PLAY_TRACK '%s', '%s'", t.title, t.subtitle);

    t.title = normalize(t.title);
    t.subtitle = normalize(t.subtitle);
    // We have troubles because Roon loves to emit multi-artist subtitles
    // separated with the slash character.  But in searches it expects comma
    // seperated artits.  We punt and just strip off all but the primary artist
    // for our search.  It might be that we want to replace() the slash with
    // a comma, but this seems like a more resilient strategy as a first
    // attempt.
    t.subtitle = t.subtitle.split(" / ")[0];

    log.debug("NORMALIZED '%s', '%s'", t.title, t.subtitle);

    let zd = transport.zone_by_output_id(config.get("djzone").output_id);

    if (typeof zd.now_playing !== "undefined") {
        var np = {
            title: zd.now_playing.three_line.line1,
            subtitle: zd.now_playing.three_line.line2
        };

        if (track_match(np, t)) {
            log.info("Not playing this song, it's already playing");
            return;
        }
    }

    opts = Object.assign({
        hierarchy: "search",
        input: t.title + " " + t.subtitle,
        pop_all: true
    });

    core.services.RoonApiBrowse.browse(opts, search_loop.bind(null, t));
}

function skip_track() {
    if (!ready) {
        return;
    }

    if (config.get("djzone").output_id == "") {
        log.warn(
            "Please choosse an output Zone in the Roon settings extension config"
        );
        return;
    }

    let zd = transport.zone_by_output_id(config.get("djzone").output_id);
    transport.control(zd.zone_id, "next");
    log.info("Skipped current track");
}

function search_loop(t, err, r) {
    log.info("STARTING search_loop for '%s' '%s'", t.title, t.subtitle);
    log.debug("R", r);

    if (err) {
        log.error("SEARCH_LOOP ERROR", err, r);
        djserver.report_error("search failed", err, {
            title: t.title,
            subtitle: t.subtitle,
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
            search_loop.bind(null, t)
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
                    search_loop.bind(null, t)
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
            if (track_match(obj, t)) {
                // I think this is our song!
                log.debug("I think I got a good hit on our song");
                core.services.RoonApiBrowse.browse(
                    { hierarchy: "search", item_key: obj.item_key },
                    search_loop.bind(null, t)
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
                    search_finished.bind(null, t)
                );
                return;
            }
        }
    }

    if (track_match(r.list, t)) {
        // This coult be improved.  We want the best match not just the first
        // match, but it's unclear exactly how we should do that or if there's
        // a big benefit to trying to be clever here.  Revisit later.
        log.debug("this is our guy!  tell me what to do");

        core.services.RoonApiBrowse.browse(
            { hierarchy: "search", item_key: r.items[0].item_key },
            search_loop.bind(null, t)
        );
        return;
    }

    log.warn("unexpected result from search api", r);
    log.info(
        "This usually means that the DJ has played a track we don't have"
    );

    announce_notfound(t);
}

function search_finished(t, err, r) {
    if (err) {
        log.info("SEARCH_SUCCESS error", err);
        report_error("search failed", err, {
            title: t.title,
            subtitle: t.subtitle,
            r: r
        });
        return;
    }

    if (t.seek_position) {
        seek_next_play = t.seek_position;
    }

    if (false && config.get("mode") == "slave" && config.flag("debug")) {
        // Disabled this because it isn've very useful any more
        var msg = new Object();
        msg.action = "SEARCH_SUCCESS";
        msg.title = t.title;
        msg.subtitle = t.subtitle;
        broadcast(msg);
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
                                paused_handler(zd);
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
            announce_play(zd);
        } else {
            log.info(
                "Mismatched zone",
                val.output_id,
                config.get("djzone").output_id
            );
        }
    });
}

function announce_nowplaying() {
    if (!ready) {
        return;
    }

    let zd = transport.zone_by_output_id(config.get("djzone").output_id);
    if (zd.state == "playing") {
        announce_play(zd);
    } else {
        log.warn("Not announcing the play because we are %s", zd.state);
    }
}

function announce_notfound(t) {
    if (!config.flag("enabled")) {
        return;
    }

    var msg = new Object();
    msg.action = "NOTFOUND";
    msg.title = t.title;
    msg.subtitle = t.subtitle;
    djserver.broadcast(msg);
}

function announce_play(zd) {
    if (!config.flag("enabled")) {
        return;
    }

    log.debug("ANNOUNCE_PLAY", zd);

    var msg = new Object();

    if (config.get("mode") == "master") {
        msg.action = "PLAYING";
        if (config.flag("enableradio") && !zd.settings.auto_radio) {
            transport.change_settings(zd.zone_id, { auto_radio: true });
            log.info("Enabled Roon Radio for DJ");
        }

        if (new_song(zd.now_playing)) {
            djserver.reset_users();
        }
    } else {
        msg.action = "SLAVE";
        if (config.flag("disableradio") && zd.settings.auto_radio) {
            transport.change_settings(zd.zone_id, { auto_radio: false });
            log.info("Disabled Roon Radio for DJ");
        }

        if (seek_next_play) {
            msg.seek_position = seek_next_play;
            seek_next_play = 0;
            let zd = transport.zone_by_output_id(
                config.get("djzone").output_id
            );
            log.info("Seeking to %d seconds in the track", msg.seek_position);
            transport.seek(zd.zone_id, "absolute", msg.seek_position);
        }
    }

    msg.title = zd.now_playing.three_line.line1;
    msg.subtitle = zd.now_playing.three_line.line2;
    msg.album = zd.now_playing.three_line.line3;
    msg.length = zd.now_playing.length;
    if (!msg.seek_position) {
        msg.seek_position = zd.now_playing.seek_position;
    }

    djserver.broadcast(msg);

    log.info("Announced playback of '%s - %s'", msg.title, msg.subtitle);

    djserver.set_status();
}

function stopped_handler(zd) {
    var msg = new Object();
    msg.action = "STOPPED";
    djserver.broadcast(msg);
}

function paused_handler(zd) {
    var msg = new Object();
    msg.action = "PAUSED";
    djserver.broadcast(msg);
}

function core_unpaired(_core) {
    core = _core;
    log.warn("Roon core unpaired", core);
}

function new_song(t) {
    if (typeof t.seek_position !== "number" || t.seek_position <= 1) {
        return true;
    }
    return false;
}

exports.core_paired = core_paired;
exports.core_unpaired = core_unpaired;
exports.play_track = play_track;
exports.announce_play = announce_play;
exports.announce_nowplaying = announce_nowplaying;
exports.skip_track = skip_track;
exports.new_song = new_song;
