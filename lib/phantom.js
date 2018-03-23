var page = require('webpage').create();
var system = require('system');
var fs = require('fs');
var process = require("child_process");
var execFile = process.execFile;

var d = new Date()
var fileName = hashCode(parseInt(d.getUTCMilliseconds()).toString());
var css = [];

function hashCode(s){
    return s.split("").reduce(function(a,b){a=((a<<5)-a)+b.charCodeAt(0);return a&a},0);
}
var css = [];
page.open(system.args[1], function() {
    fs.write('fsp/'+ fileName +'.html', page.content, 'w');
    console.log(css)
    phantom.exit();
});
page.onResourceRequested = function (req, netReq) {
    if(req.url.indexOf('.css') >0){
        req.url = req.url.split('?')[0]
        css.push(req.url);

    }
}
