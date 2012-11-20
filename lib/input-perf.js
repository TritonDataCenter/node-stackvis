/*
 * lib/input-perf.js: reads output from a perf profiling script, which emits
 * stanzas that look like this:
 *
 * foo 15150 10062.190770: cycles:
 *                400675 bar (/tmp/stackvis/foo)
 *                400603 foo (/tmp/stackvis/foo)
 *                40071f main (/tmp/stackvis/foo)
 *          7fb3db1bf76d __libc_start_main (/lib/x86_64-linux-gnu/libc-2.15.so)
 *
 * You can generate such output with:
 *
 *   # perf record -F 997 -g ./myprogram
 *   # perf script > perf.out
 */

var mod_util = require('util');
var mod_events = require('events');

var mod_carrier = require('carrier');

exports.reader = PerfStreamReader;

function PerfStreamReader(input, log)
{
	this.dsr_log = log;
	this.dsr_linenum = 0;
	this.dsr_prefix = '';
	this.dsr_stack = [];
	this.dsr_carrier = mod_carrier.carry(input);
	this.dsr_carrier.on('line', this.onLine.bind(this));
	this.dsr_carrier.on('end', this.onEnd.bind(this));

	mod_events.EventEmitter.call(this);
}

mod_util.inherits(PerfStreamReader, mod_events.EventEmitter);

PerfStreamReader.prototype.onLine = function (line)
{
	++this.dsr_linenum;

	/* Lines beginning with # are always ignored. */
	if (/^#/.exec(line))
		return;

	/* Get process name from summary line, to use as prefix */
	var match = /(^\w+)\s+/.exec(line);
	if (match) {
		this.dsr_prefix = match[1];
		return;
	}

	/*
	 * In general, lines may have leading or trailing whitespace and the
	 * following components:
	 *
	 *	loc function (module)
	 *
	 * We try to avoid assuming too much about the form in order to support
	 * various annotations provided by ustack helpers.
	 */
	var frame = line;
	frame = frame.replace(/^\s+/, '');
	frame = frame.replace(/\s+$/, '');

	if (frame.length === 0) {
		if (this.dsr_stack.length === 0) {
			this.dsr_log.warn('line ' + this.dsr_linenum +
			    ': found empty line with no stack');
			return;
		}

		this.emit('stack', this.dsr_stack, 1);
		this.dsr_prefix = '';
		this.dsr_stack = [];
		return;
	}

	frame = frame.replace(/^\w+ /, '');
	frame = frame.replace(/ \(\S+\)$/, '');

	/*
	 * Remove both function and template parameters from demangled C++
	 * frames, but skip the first two characters because they're used by the
	 * Node.js ustack helper as separators.
	 */
	/* JSSTYLED */
	frame = frame.replace(/(..)[(<].*/, '$1');

	if (line.length === 0) {
		if (this.dsr_stack.length !== 0)
			this.dsr_log.warn('line ' + this.dsr_linenum +
			    ': unexpected blank line');
		return;
	}

	/* Add prefix */
	if (this.dsr_prefix.length > 0) {
		frame = this.dsr_prefix + '`' + frame;
	}

	this.dsr_stack.unshift(frame);
};

PerfStreamReader.prototype.onEnd = function ()
{
	if (this.dsr_stack.length !== 0)
		this.dsr_log.warn('line ' + this.dsr_linenum +
		    ': unexpected end of stream');

	this.emit('end');
};
