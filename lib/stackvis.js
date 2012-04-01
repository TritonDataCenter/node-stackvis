/*
 * lib/stackvis.js: Stackvis library interface
 */

var mod_assert = require('assert');

exports.readerLookup = readerLookup;
exports.writerLookup = writerLookup;
exports.pipeStacks = pipeStacks;

function moduleLookup(type, name)
{
	var filename = './' + type + '-' + name;
	return (require(filename));
}

function readerLookup(name)
{
	return (moduleLookup('input', name).reader);
}

function writerLookup(name)
{
	return (moduleLookup('output', name));
}

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

StackSet.prototype.eachStackByStack = function (callback)
{
	var set = this;
	var keys = Object.keys(this.ss_stacks);

	keys.sort().forEach(function (key) {
		callback(set.ss_stacks[key], set.ss_counts[key]);
	});
};

function collapseStacks(reader, callback)
{
	var stacks = new StackSet();

	reader.on('stack', function (stack, count) {
		stacks.addStack(stack, count);
	});

	reader.on('end', function () { callback(null, stacks); });
}

/*
 * This is *not* a stable interface yet. This will be changed in the future to
 * support multiple stage pipelines.
 */
/* XXX use args for argument. */
function pipeStacks(log, instream, readercons, writer, outstream, callback)
{
	var reader = new readercons(instream, log);

	collapseStacks(reader, function (err, stacks) {
		if (err) {
			log.error(err);
			return;
		}

		writer.emit({
			'stacks': stacks,
			'output': outstream,
			'log': log
		}, callback);
	});
}
