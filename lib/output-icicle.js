/*
 * lib/output-icicle.js: emits StackSets as JSON suitable for use in a D3 icicle
 * layout.  See lib/stackvis.js for interface details.
 */

var mod_assert = require('assert');

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

	output.write(JSON.stringify(tree, null, '\t'));
	callback();
};
