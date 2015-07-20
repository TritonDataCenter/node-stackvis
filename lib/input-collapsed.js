/*
 * lib/input-collapsed.js: reads output from the "stackcollapse" script
 */

var mod_util = require('util');
var mod_events = require('events');

var mod_carrier = require('carrier');

exports.reader = CollapsedStreamReader;

function CollapsedStreamReader(input, log)
{
	var reader = this;

	this.csr_log = log;
	this.csr_linenum = 0;
	this.csr_carrier = mod_carrier.carry(input);
	this.csr_carrier.on('line', function (line) {
		reader.csr_linenum++;
		var match = /^(.*)\s+(\d+)$/.exec(line);
		if (!match) {
			log.warn('line ' + reader.csr_linenum + ': garbled');
			return;
		}

		reader.emit('stack', match[1].split(';'),
		    parseInt(match[2], 10));
	});
	this.csr_carrier.on('end', function () { reader.emit('end'); });
}

mod_util.inherits(CollapsedStreamReader, mod_events.EventEmitter);
