function parse(zd) {
    var newoutputs = {};
    for (var index in zd["outputs"]) {
        newoutputs[zd["outputs"][index]["display_name"]] = JSON.parse(
            JSON.stringify(zd["outputs"][index])
        );
    }
    zd["outputs"] = JSON.parse(JSON.stringify(newoutputs));

    return zd;
}

exports.parse = parse;
