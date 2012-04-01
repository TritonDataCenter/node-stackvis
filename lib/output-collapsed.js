/*
 * lib/output-collapsed.js: emits StackSets in collapsed format, compatible with
 * Brendan Gregg's FlameGraph tool.
 */

var mod_assert = require('assert');

/*
 * Arguments:
 *
 *    stacks	StackSet		Stacks to visualize
 *
 *    output	WritableStream		Output file
 */
exports.emit = function emitCollapsed(args, callback)
{
	mod_assert.ok(args.stacks && args.stacks.constructor &&
	    args.stacks.constructor.name == 'StackSet',
	    'required "stacks" argument must be a StackSet');
	mod_assert.ok(args.output && args.output.write &&
	    typeof (args.output.write) == 'function',
	    'required "output" argument must be a function');

	args.stacks.eachStackByCount(function (frames, count) {
		process.stdout.write(frames.join(',') + ' ' + count + '\n');
	});
};
