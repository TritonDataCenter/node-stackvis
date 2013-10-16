/*
 * lib/output-flamegraph-d3.js: emits a D3-based HTML page for the flame graph.
 * See lib/stackvis.js for interface details.
 */

var mod_assert = require('assert');
var mod_fs = require('fs');
var mod_path = require('path');

var mod_hogan = require('hogan.js');
var mod_vasync = require('vasync');
var mod_verror = require('verror');

var VError = mod_verror.VError;

exports.emit = function emitIcicleData(args, callback)
{
	mod_assert.ok(args.stacks && args.stacks.constructor &&
	    args.stacks.constructor.name == 'StackSet',
	    'required "stacks" argument must be a StackSet');
	mod_assert.ok(args.output && args.output.write &&
	    typeof (args.output.write) == 'function',
	    'required "output" argument must be a function');
	mod_assert.ok(args.log, 'required "log" argument must be a logger');

	var stacks = args.stacks;
	var output = args.output;
	var tree = {};
	var filecontents = {};

	stacks.eachStackByStack(function (frames, count) {
		var subtree = tree;
		var node, i;

		for (i = 0; i < frames.length; i++) {
			if (!subtree.hasOwnProperty(frames[i]))
				subtree[frames[i]] = {
				    svUnique: 0,
				    svTotal: 0,
				    svChildren: {}
				};

			node = subtree[frames[i]];
			node.svTotal += count;
			subtree = node.svChildren;
		}

		node.svUnique += count;
	});

	tree = {
	    '': {
		svUnique: 0,
		svTotal: Object.keys(tree).reduce(
		    function (p, c) { return (p + tree[c].svTotal); }, 0),
		svChildren: tree
	    }
	};

	mod_vasync.forEachParallel({
	    'inputs': [ 'icicle.css', 'icicle.js', 'icicle.htm', 'd3.v2.js' ],
	    'func': function (filename, stepcb) {
		var path = mod_path.join(__dirname, '../share', filename);
		var key = filename.replace(/\./g, '_');
		mod_fs.readFile(path, function (err, contents) {
			if (err)
				err = new VError(err, 'failed to load "%s"',
				    filename);
			else
				filecontents[key] = contents.toString('utf8');
			stepcb(err);
		});
	    }
	}, function (err) {
		if (err) {
			callback(err);
			return;
		}

		var compiled, rendered;

		filecontents['title'] = 'Flame graph';
		filecontents['rawdata'] = JSON.stringify(tree, null, '\t');
		compiled = mod_hogan.compile(filecontents['icicle_htm']);
		rendered = compiled.render(filecontents);
		output.write(rendered);
		callback();
	});
};
