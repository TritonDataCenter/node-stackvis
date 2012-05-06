/*
 * demo.js: static-file node HTTP server for demos
 *
 * Usage: node demo.js [port]
 *
 *    Sets up a web server on the given port (or port 80) serving static files
 *    out of the given path.  This demo is NOT secure and allows anyone with
 *    network access to this server to read any files on your system.
 */

var mod_fs = require('fs');
var mod_http = require('http');
var mod_path = require('path');
var mod_url = require('url');

var dd_index = 'index.htm';
var dd_cwd = process.cwd();
var dd_port = 80;

var i;

for (i = 2; i < process.argv.length; i++) {
	dd_port = parseInt(process.argv[i], 10);
	if (isNaN(dd_port)) {
		console.error('usage: node demo.js [port]');
		process.exit(1);
	}
}

mod_http.createServer(function (req, res) {
	var uri = mod_url.parse(req.url).pathname;
	var path;
	var filename;

	path = (uri == '/') ? dd_index : uri;

	filename = mod_path.join(dd_cwd, path);

	mod_fs.readFile(filename, function (err, file) {
		if (err) {
			res.writeHead(404);
			res.end();
			return;
		}

		res.writeHead(200);
		res.end(file);
	});
}).listen(dd_port, function () {
	console.log('HTTP server started on port ' + dd_port);
});
