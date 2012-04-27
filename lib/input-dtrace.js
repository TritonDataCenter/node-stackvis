/*
 * lib/input-dtrace.js: reads output from a DTrace profiling script, which emits
 * stanzas that look like this:
 *
 *            prog`foo+0x8
 *            prog`main+0x21
 *            prog`_start+0x80
 *             14
 *
 * This examples shows that that particular stacktrace was seen 14 times.  You
 * can generate such output with:
 *
 *   # dtrace -o stacks.out \
 *     -n 'profile-97/execname == "myprogram"/{ @[ustack()] = count(); }'
 */

var mod_util = require('util');
var mod_events = require('events');

var mod_carrier = require('carrier');

/* We always ignore the first 3 lines. */
var NHEADERLINES = 3;

exports.reader = DTraceStreamReader;

function DTraceStreamReader(input, log)
{
	this.dsr_log = log;
	this.dsr_linenum = 0;
	this.dsr_stack = [];
	this.dsr_carrier = mod_carrier.carry(input);
	this.dsr_carrier.on('line', this.onLine.bind(this));
	this.dsr_carrier.on('end', this.onEnd.bind(this));

	mod_events.EventEmitter.call(this);
}

mod_util.inherits(DTraceStreamReader, mod_events.EventEmitter);

DTraceStreamReader.prototype.onLine = function (line)
{
	/* The first three lines are always ignored. */
	if (++this.dsr_linenum <= NHEADERLINES)
		return;

	var match = /^\s+(\d+)\s*$/.exec(line);
	if (match) {
		if (this.dsr_stack.length === 0) {
			this.dsr_log.warn('line ' + this.dsr_linenum +
			    ': found count with no stack');
			return;
		}

		this.emit('stack', this.dsr_stack, parseInt(match[1], 10));
		this.dsr_stack = [];
		return;
	}

	/*
	 * In general, lines may have leading or trailing whitespace and the
	 * following components:
	 *
	 *	module`function+offset
	 *
	 * We try to avoid assuming too much about the form in order to support
	 * various annotations provided by ustack helpers, but we want to strip
	 * off the offset.
	 */
	var frame = line;
	frame = frame.replace(/^\s+/, '');
	frame = frame.replace(/\s+$/, '');
	/* JSSTYLED */
	frame = frame.replace(/\+.*/, '');

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

	this.dsr_stack.unshift(frame);
};

DTraceStreamReader.prototype.onEnd = function ()
{
	if (this.dsr_stack.length !== 0)
		this.dsr_log.warn('line ' + this.dsr_linenum +
		    ': unexpected end of stream');

	this.emit('end');
};
