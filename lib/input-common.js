/*
 * lib/input-common.js: common routines for importing stacks
 */

function StackSet()
{
	this.ss_counts = {};	/* maps serialized stack -> count */
	this.ss_stacks = {};	/* maps serialized stack -> stack */
}

StackSet.prototype.addStack = function (stack, count)
{
	var key = stack.join(',');

	if (!this.ss_counts.hasOwnProperty(key)) {
		this.ss_counts[key] = 0;
		this.ss_stacks[key] = stack;
	}

	this.ss_counts[key] += count;
};

StackSet.prototype.eachStackSorted = function (callback)
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

exports.collapseStacks = function (reader, callback)
{
	var stacks = new StackSet();

	reader.on('stack', function (stack, count) {
		stacks.addStack(stack, count);
	});

	reader.on('end', function () { callback(null, stacks); });
};
