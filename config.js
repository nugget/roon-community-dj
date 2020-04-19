const uuidv4 = require('uuid/v4');

//
// If we failed to load a config from roon.load_config we will populate our
// settings object with these values
//
DefaultConfig = {
    server: "wss://macnugget.org/rcdj",
    djzone: { output_id: "", name: "" },
    mode: "slave",
    debug: false,
    channel: "discord",
    enabled: true,
    serverid: "",
};

var current = {};
var debug = false;

function load(roon) {
    console.log("Loading configuration cache");
    current = roon.load_config("settings") || DefaultConfig;
    debug = current.debug;

    console.log(typeof current.serverid, current.serverid);

    if (typeof current.serverid === "undefined" || current.serverid == "") {
        current.serverid = uuidv4();
        console.log("Assigning new serverid", current.serverid);

    }
    console.log("Debugging output is " + debug);
}

function get(_key) {
    if (debug) {
        console.log("config getter for %s returned", _key, current[_key]);
    }
    return current[_key];
}

function set(_key, value) {
    current[_key] = value;
    if (debug) {
        console.log("config setter for %s with ", _key, current[_key]);
    }
}

function flag(_key) {
    _val = current[_key];

    switch (typeof _val) {
        case "boolean":
            return _val;
            break;
        case "string":
            switch (_val) {
                case "true":
                case "on":
                case "yes":
                case "1":
                    return true;
                case "default":
                    return false;
            }
        default:
            console.log(
                "Unknown flag type " + _val + " (" + typeof _val + ")"
            );
            return false;
    }
}

function update(_settings) {
    console.log("Updating configuration cache");
    current = _settings;
    debug = current["debug"];
    console.log("Debugging output is " + debug);
}

function all() {
    return current;
}

// https://community.roonlabs.com/t/settings-api-can-make-a-remote-crash/35899/4?u=nugget

const fakeBoolean = [
    { title: "On", value: true },
    { title: "Off", value: false }
];

function layout(settings) {
    var l = {
        values: settings,
        layout: [],
        has_error: false
    };

    l.layout.push({
        type: "dropdown",
        title: "Enabled",
        values: fakeBoolean,
        setting: "enabled"
    });

    l.layout.push({
        type: "string",
        title: "Server URL",
        setting: "server"
    });

    l.layout.push({
        type: "zone",
        title: "DJ Zone",
        setting: "djzone"
    });

    l.layout.push({
        type: "dropdown",
        title: "Mode",
        values: [{title: "DJ", value: "master"}, {title: "Listener", value: "slave"}],
        setting: "mode"
    });

    l.layout.push({
        type: "string",
        title: "channel",
        setting: "channel"
    });


    l.layout.push({
        type: "group",
        title: "Developer Settings",
        collapsable: true,
        items: [
            {
                type: "dropdown",
                values: fakeBoolean,
                title: "Debug Output",
                setting: "debug"
            },
            {
                type: "string",
                title: "User ID",
                setting: "serverid",
            }
        ]
    });
    
    return l;
}

exports.load = load;
exports.layout = layout;
exports.get = get;
exports.set = set;
exports.update = update;
exports.all = all;
exports.flag = flag;
exports.debug = debug;
