/*
 * lib/stackvis.js: Stackvis library interface
 */

var mod_assert = require('assert');
var mod_jsprim = require('jsprim');

exports.readerLookup = readerLookup;
exports.writerLookup = writerLookup;
exports.pipeStacks = pipeStacks;

/*
 * Readers read stacktraces stored in specific formats and emit them in a common
 * form.  Consumers don't use readers directly, but rather pass them to
 * pipeStacks().
 *
 * Each reader is defined in its own module.  It's expected to export a single
 * field called "reader" that's a constructor function, which we return here.
 * Reader constructors should be invoked as new constructor(ReadableStream,
 * BunyanLog).  The object itself should then emit "stack" and "end" events.
 * The "stack" event includes an array of frames and a count for the number of
 * times that stack was seen in the input:
 *
 *    reader.on('stack', function (frames, count) {
 *            console.log(count + ' ' + frames.join(', '));
 *    });
 *
 * Readers may emit the same stack more than once, which isn't what most
 * consumers want.  That's why the main API is pipeStacks, which collapses
 * common stacks.
 */
function readerLookup(name)
{
	return (moduleLookup('input', name).reader);
}

/*
 * Writers take stacktraces stored in our common form and emit them in some
 * other specific format like a data file or a SVG visualization.  Like readers,
 * each writer is defined in its own module, and callers use them via
 * pipeStacks() rather than directly.
 *
 * Since writers do not emit events, they're not constructors.  Each writer just
 * defines a single field called "emit", invoked as emit(args, callback).
 * "args" must contain these fields:
 *
 *    stacks	StackSet		Stacks to visualize, as produced by
 *    					collapseStacks.
 *
 *    output	WritableStream		Output file
 *
 *    log	Bunyan Logger		Logger
 *
 * as well as any other module-specific parameters.
 */
function writerLookup(name)
{
	return (moduleLookup('output', name));
}

function moduleLookup(type, name)
{
	var filename = './' + type + '-' + name;
	return (require(filename));
}

/*
 * Reads stacks from "instream" (a ReadableStream) using a new "readercons"
 * Reader object, collapses the stacks, and emits them to "outstream" using the
 * given writer.  This is the main way to convert stacks from one representation
 * (e.g., DTrace output) to another (e.g., a flamegraph).
 *
 * This is the primary interface for consumers, though it's *not* a stable
 * interface yet.
 */
function pipeStacks(log, instream, readercons, writer, outstream, args,
    callback)
{
	if (typeof (args) === 'function') {
		callback = args;
		args = {};
	}
	args = args || {};

	var reader = new readercons(instream, log);

	collapseStacks(reader, function (err, stacks) {
		if (err) {
			log.error(err);
			return;
		}

		var _args = mod_jsprim.deepCopy(args);
		_args.stacks = stacks;
		_args.output = outstream;
		_args.log = log;
		writer.emit(_args, function (err2) {
			/*
			 * It's stupid that we need to check whether we're
			 * writing to stdout, but this is the same thing Node's
			 * stream.pipe() method does, because for some reason
			 * you can't "end" the stdout stream.
			 */
			if (!err2 && !outstream._isStdio)
				outstream.end();

			callback(err2);
		});
	});
}

/*
 * Collects "stack" events from the given reader, collapses common stacks, and
 * returns them asynchronously via "callback".  This could reasonably be a
 * public interface, but for now we assume that the only consumers would be
 * translators which would use the slightly higher-level pipeStacks() instead.
 */
function collapseStacks(reader, callback)
{
	var stacks = new StackSet();

	reader.on('stack', function (stack, count) {
		stacks.addStack(stack, count);
	});

	reader.on('end', function () { callback(null, stacks); });
}

/*
 * Internal representation for a collapsed set of stacks.
 */
function StackSet()
{
	this.ss_counts = {};	/* maps serialized stack -> count */
	this.ss_stacks = {};	/* maps serialized stack -> stack */
}

StackSet.prototype.addStack = function (stack, count)
{
	mod_assert.ok(Array.isArray(stack));
	mod_assert.equal(typeof (count), 'number');

	var key = stack.join(',');

	if (!this.ss_counts.hasOwnProperty(key)) {
		this.ss_counts[key] = 0;
		this.ss_stacks[key] = stack;
	}

	this.ss_counts[key] += count;
};

/*
 * Iterates all stacks in order of decreasing count.  The callback function is
 * invoked as callback(frames, count) for each unique stack.
 */
StackSet.prototype.eachStackByCount = function (callback)
{
	var set = this;
	var keys = Object.keys(this.ss_stacks);

	keys.sort(function (a, b) {
		return (set.ss_counts[b] - set.ss_counts[a]);
	});

	keys.forEach(function (key) {
		callback(set.ss_stacks[key], set.ss_counts[key]);
	});
};

/*
 * Iterates all stacks in alphabetical order by full stack.
 */
StackSet.prototype.eachStackByStack = function (callback)
{
	var set = this;
	var keys = Object.keys(this.ss_stacks);

	keys.sort().forEach(function (key) {
		callback(set.ss_stacks[key], set.ss_counts[key]);
	});
};
