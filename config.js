const uuidv4 = require("uuid/v4");
const util = require("util");

//
// If we failed to load a config from roon.load_config we will populate our
// settings object with these values
//
DefaultConfig = {
    server: "wss://dj.macnugget.org/",
    api: "https://dj.macnugget.org/graphql",
    djzone: { output_id: "", name: "" },
    mode: "slave",
    debug: false,
    channel: "chaos",
    enabled: true,
    serverid: "",
    code: "",
    nickname: "",
    enableradio: false,
    disableradio: false,
    notfound: "any"
};

var current = {};

var serverState = "";
var serverVersion = "";

function debug() {
    if (current.debug) {
        return true;
    }
    return false;
}

function load(roon) {
    console.log("Loading configuration cache");
    current = roon.load_config("settings") || DefaultConfig;

    if (typeof current.serverid === "undefined" || current.serverid == "") {
        current.serverid = uuidv4();
        console.log("Assigning new serverid", current.serverid);
    }

    if (typeof current.code === "undefined" || current.code == "") {
        current.code = uuidv4().split("-")[1];
        console.log("Assigning new security code", current.code);
    }

    console.log("Debugging output is " + debug());

    Object.keys(DefaultConfig).forEach(function (key) {
        if (typeof current[key] === "undefined") {
            console.log("Seeding new config item %s", key);
        }
    });
}

function get(_key) {
    return current[_key];
}

function set(_key, value) {
    current[_key] = value;
    if (current["debug"]) {
        console.log(
            "set config value for '%s' with '%s'",
            _key,
            current[_key]
        );
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
            console.log("Unknown flag type '%s' (%s)", _val, typeof _val);
            return false;
    }
}

function update(_settings) {
    console.log("Updating configuration cache");
    current = _settings;
    console.log("Debugging output is " + debug());
}

function all() {
    return current;
}

function setServerState(line) {
    serverState = line;
}

function setServerVersion(ok, version) {
    serverVersion = util.format("DJ server is v%s", version);
    if (!ok) {
        serverVersion += " ** Please upgrade";
    }
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
        type: "group",
        title: "Playback",
        items: [
            {
                type: "zone",
                title: "Zone",
                setting: "djzone"
            },
            {
                type: "string",
                title: "Channel",
                setting: "channel"
            },
            {
                type: "dropdown",
                title: "Role",
                values: [
                    { title: "DJ", value: "master" },
                    { title: "Listener", value: "slave" }
                ],
                setting: "mode"
            },
            {
                type: "string",
                title: "Nickname",
                max_length: 16,
                setting: "nickname"
            },
            {
                type: "dropdown",
                title: "Turn off Roon Radio when Listening",
                values: fakeBoolean,
                setting: "disableradio"
            }
        ]
    });

    l.layout.push({
        type: "group",
        title: "DJ Settings",
        items: [
            {
                type: "dropdown",
                title: "Skip 'not found' songs",
                values: [
                    {
                        title: "if ANY listener fails",
                        value: "any"
                    },
                    {
                        title: "never",
                        value: "never"
                    }
                ],
                setting: "notfound"
            },
            {
                type: "dropdown",
                title: "Turn on Roon Radio when DJing",
                values: fakeBoolean,
                setting: "enableradio"
            }
        ]
    });

    l.layout.push({
        type: "group",
        title: "Advanced Settings",
        items: [
            {
                type: "string",
                title: "DJ Server URL",
                setting: "server"
            }
        ]
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
                setting: "serverid"
            }
        ]
    });

    l.layout.push({
        type: "label",
        title: serverState
    });
    l.layout.push({
        type: "label",
        title: serverVersion
    });
    l.layout.push({
        type: "label",
        title: util.format("Your private code is '%s'", current.code)
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
exports.setServerState = setServerState;
exports.setServerVersion = setServerVersion;
