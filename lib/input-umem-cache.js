/*
 * lib/input-umem-cache.js: reads output from an mdb ::bufctl -v, which emits
 * stanzas that look like this:
 *
 *        ffeca50         10001000   401f50b1339a6a                1
 *                         8f73010                0                0
 *                libumem.so.1`umem_cache_alloc_debug+0x144
 *                libumem.so.1`umem_cache_alloc+0x19a
 *                libumem.so.1`umem_alloc+0xcd
 *                libumem.so.1`malloc+0x2a
 *                libstdc++.so.6.0.17`_Znwj+0x29
 *                libstdc++.so.6.0.17`_Znaj+0x1d
 *                _ZN2v88internal11HandleScope6ExtendEv+0xdf
 *                _ZN2v88internal8JSObject20SetPropertyForResultEPNS0_12LookupResultEPNS0_6StringEPNS0_6ObjectE18PropertyAttributesNS0_14StrictModeFlagENS0_10JSReceiver14StoreFromKeyedE+0x5f8
 *                _ZN2v88internal10JSReceiver11SetPropertyEPNS0_6StringEPNS0_6ObjectE18PropertyAttributesNS0_14StrictModeFlagENS1_14StoreFromKeyedE+0x8d
 *                _ZN2v88internal7StoreIC5StoreENS0_16InlineCacheStateENS0_14StrictModeFlagENS0_6HandleINS0_6ObjectEEENS4_INS0_6StringEEES6_+0x359
 *                _ZN2v88internal12StoreIC_MissENS0_9ArgumentsEPNS0_7IsolateE+0x139
 *                0xa3c0a376
 *                0xbf54e125
 *                0xbf573d62
 *                0xbf573c93
 *
 * You can generate such output with:
 *
 *	> ::walk bufctl | ::bufctl -v ! cat > stacks.out
 */


var mod_util = require('util');
var mod_events = require('events');

var mod_carrier = require('carrier');

/* We always ignore the first 2 lines. */
var NHEADERLINES = 2;

exports.reader = UmemStreamReader;

function UmemStreamReader(input, log)
{
	this.dsr_log = log;
	this.dsr_linenum = 0;
	this.dsr_sline = 0;
	this.dsr_stack = [];
	this.dsr_carrier = mod_carrier.carry(input);
	this.dsr_carrier.on('line', this.onLine.bind(this));
	this.dsr_carrier.on('end', this.onEnd.bind(this));

	mod_events.EventEmitter.call(this);
}

mod_util.inherits(UmemStreamReader, mod_events.EventEmitter);

UmemStreamReader.prototype.onLine = function (line)
{
	/* The first two lines are always ignored. */
	if (++this.dsr_linenum <= NHEADERLINES)
		return;

	/* ignore ADDR, BUFADDR, TIMESTAMP, THREAD, CACHE, LASTLOG, CONTENTS */
	if (++this.dsr_sline <= NHEADERLINES)
		return;

	if (!line.trim()) {
		if (this.dsr_stack.length === 0) {
			this.dsr_log.warn('line ' + this.dsr_linenum +
			    ': found count with no stack');
			return;
		}

		this.emit('stack', this.dsr_stack, 1);
		this.dsr_stack = [];
		this.dsr_sline = 0;
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

	/* maybe configurable? */
	frame = frame.replace(/^0x[a-f0-9]{8}$/, '<unknown>');

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

UmemStreamReader.prototype.onEnd = function ()
{
	if (this.dsr_stack.length !== 0)
		this.dsr_log.warn('line ' + this.dsr_linenum +
		    ': unexpected end of stream');

	this.emit('end');
};
