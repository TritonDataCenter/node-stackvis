/*
 * lib/input-stap.js: reads output from a stap profiling script, which emits
 * stanzas that look like this:
 *
 * ubt["bar+0x32 [foo]
 * foo+0x57 [foo]
 * main+0x48 [foo]
 * __libc_start_main+0xed [libc-2.15.so]
 * _start+0x29 [foo]"]=0x77
 *
 * You can generate such output with:
 *
 *   # stap \
 *       -e "global ubt; \
 *           probe timer.profile { ubt[sprint_ubacktrace()] += 1 }; \
 *           probe timer.s(30) { exit() }" \
 *       -o stap.out
 *
 * If stap warns about missing unwind data for a module, and stap
 * suggests adding '-d /lib/libquux.so', which you know to be a shared
 * library used by the 'foo' binary, add the following to the above
 * command:
 *
 *       -d /path/to/foo $(ldd /path/to/foo | awk 'NF==4 { print "-d", $3 }')
 *
 * to deal with all warnings related to shared libraries used by 'foo',
 * all at once.
 */

var mod_util = require('util');
var mod_events = require('events');

var mod_carrier = require('carrier');

exports.reader = PerfStreamReader;

function PerfStreamReader(input, log)
{
	this.dsr_log = log;
	this.dsr_linenum = 0;
	this.dsr_addingframes = false;
	this.dsr_prefixes = [];
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

	var match;
	if (!this.dsr_addingframes) {
		/* Skip array name */
		line.replace(/^\w+\[/, '');

		/* Find and add prefixes */
		while (true) {
			/* JSSTYLED */
			match = /(?:"([^"]*)",)(.*$)/.exec(line);
			if (!match)
				break;
			this.dsr_prefixes.push(match[1]);
			line = match[2];
		}

		/* Find first frame */
		/* JSSTYLED */
		match = /(?:"(.*$))/.exec(line);
		if (!match) {
			this.dsr_log.warn('line ' + this.dsr_linenum +
			    ': no first frame found');
			return;
		}
		line = match[1];
		this.dsr_addingframes = true;
	}

	/* Look for count */
	var count;
	/* JSSTYLED */
	match = /(^.*)"\]=(\w+$)/.exec(line);
	if (match) {
		line = match[1];
		count = parseInt(match[2], 16);
		this.dsr_addingframes = false;
	}

	/*
	 * In general, frames have one of the following sets of components:
	 *
	 *	address
	 *	address [module+offset]
	 *	function+offset [module]
	 *
	 * We try to avoid assuming too much about the form in order to support
	 * various annotations provided by ustack helpers.
	 */
	var frame = line;
	frame = frame.replace(/ \[(\S+)\]$/, '');
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

	/* Add prefixes */
	if (this.dsr_prefixes.length > 0) {
		frame = this.dsr_prefixes.join('`') + '`' + frame;
	}

	this.dsr_stack.unshift(frame);

	if (!this.dsr_addingframes) {
		this.emit('stack', this.dsr_stack, count);
		this.dsr_prefixes = [];
		this.dsr_stack = [];
	}
};

PerfStreamReader.prototype.onEnd = function ()
{
	if (this.dsr_stack.length !== 0)
		this.dsr_log.warn('line ' + this.dsr_linenum +
		    ': unexpected end of stream');

	this.emit('end');
};
