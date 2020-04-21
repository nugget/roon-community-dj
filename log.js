var config = require("./config.js"),
    pjson = require("./package.json");

const chalk = require("chalk");

function trace(template, ...args) {
    if (config.flag("debug")) {
        console.log(chalk.white("[TRACE] ") + template, ...args);
    }
}

function debug(template, ...args) {
    if (config.flag("debug")) {
        console.log(chalk.white("[DEBUG] ") + template, ...args);
    }
}

function info(template, ...args) {
    console.log(chalk.cyan("[INFO] ")+template, ...args);
}

function warn(template, ...args) {
    console.log(chalk.yellow("[WARN] ")+template, ...args);
}

function error(template, ...args) {
    console.log(chalk.redBright("[ERROR] ")+template, ...args);
}

function fatal(template, ...args) {
    console.log(chalk.redBright("[ERROR] ")+template, ...args);
    process.exit(255);
}

exports.trace = trace;
exports.debug = debug;
exports.info = info;
exports.warn = warn;
exports.error = error;
exports.fatal = fatal;
