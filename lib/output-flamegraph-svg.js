/*
 * lib/output-flamegraph-svg.js: emits StackSets as Flame Graphs in SVG format.
 * This is a pretty direct port of Brendan Gregg's FlameGraph tool.
 */

var mod_assert = require('assert');
var mod_color = require('./color');
var mod_xml = require('./xml');

exports.emit = function emitFlameGraph(args, callback)
{
	var emitter = new FlameGraphEmitter(args);
	emitter.run(callback);
};

/*
 * Arguments:
 *
 *    stacks		StackSet	Stacks to visualize
 *
 *    output		WritableStream	Output file
 *
 *    log		Bunyan Logger	Logger
 *
 *    font_face		String		Font face for text
 *    ["Verdana"]
 *
 *    font_size 	Integer		Font size for text
 *    [12]
 *
 *    title		String		Title of graph
 *    ["Flame Graph"]
 *
 *    width		Integer		Width of graph, in pixels
 *    [1200]
 *
 *    frame_height	Integer		Height of each frame, in pixels
 *    [16]
 *
 *    min_width		Number		Minimum width of each frame, in pixels
 *    [0.1]
 *
 *    coloring		String		Defines how to color each box.  Options
 *    ["time-based"]			currently include:
 *
 *	    "random"		Each box gets a random flame-like color.
 *
 *	    "gradient"		Each row gets the same color.  The colors from
 *				bottom to top form a gradient from dark red to
 *				yellow.
 *
 *	    "time-based"	Each row gets the same hue.  Saturation varies
 *				within each row according to size (width).
 */
function FlameGraphEmitter(args)
{
	mod_assert.ok(args.stacks && args.stacks.constructor &&
	    args.stacks.constructor.name == 'StackSet',
	    'required "stacks" argument must be a StackSet');
	mod_assert.ok(args.output && args.output.write &&
	    typeof (args.output.write) == 'function',
	    'required "output" argument must be a function');
	mod_assert.ok(args.log, 'required "log" argument must be a logger');

	if (args.coloring)
		mod_assert.ok(args.coloring == 'random' ||
		    args.coloring == 'gradient' ||
		    args.coloring == 'time-based',
		    '"coloring" must be "random", "gradient", or "time-based"');

	this.fge_stacks = args.stacks;
	this.fge_output = args.output;
	this.fge_log = args.log;

	this.fge_params = {
	    'coloring': args.coloring || 'time-based',
	    'font_face': args.font_face || 'Verdana',
	    'font_size': Math.floor(args.font_size) || 12,
	    'frame_height': Math.floor(args.frame_height) || 16,
	    'min_width': parseFloat(args.min_width) || 0.1,
	    'title': args.title || 'Flame Graph',
	    'width': Math.floor(args.width) || 1200
	};
}

FlameGraphEmitter.prototype.run = function (callback)
{
	/*
	 * Because the input data comes from a profiler rather than measurements
	 * at each function entry and exit, the x-axis of our flame graph is not
	 * meaningful.  We know that a given function (at depth D) invoked
	 * several other functions (at depth D+1), and we know how long was
	 * spent in each of these functions, but we don't know in what order
	 * they were called.  We have to pick an order to present them, so we do
	 * it alphabetically.  Having done this, one can think of the data as
	 * though we invoked the alphabetically first function first, then the
	 * second function next, and so on.  Using this mental model, we say
	 * that a given frame starts at a given "time" (in samples) and lasts
	 * for a certain "time" (also a number of samples).  It's important to
	 * remember that this doesn't have anything to do with real time, but
	 * rather the way we're presenting the profiling data.
	 *
	 * With this in mind, we process the stacks in order of the above notion
	 * of time, which is left-to-right in the final flame graph.  The final
	 * output is fge_boxes, which maps a (frame, depth, end) tuple (which
	 * uniquely identifies a particular box in the flame graph) to an
	 * integer indicating when that invocation of that frame started (i.e.
	 * how wide the box is).  As part of constructing this, we also maintain
	 * fge_starts, which maps a (frame, depth) tuple to an integer
	 * indicating the start time for the most recent invocation of this
	 * frame at this depth.
	 */
	var flow = this.flow.bind(this);

	this.fge_boxes = {};
	this.fge_starts = {};
	this.fge_last = [];
	this.fge_time = 0;
	this.fge_maxdepth = 0;

	/*
	 * We keep track of the number of samples at each level of depth for
	 * coloring purposes.
	 */
	this.fge_depthsamples = [];

	this.fge_stacks.eachStackByStack(flow);
	flow([], 0);

	this.draw(callback);
};

FlameGraphEmitter.prototype.flow = function (frames, count)
{
	var i, nsameframes, starts_key, ends_key;

	/*
	 * Prepend an empty frame to every real stack to represent the "all
	 * samples" synthetic frame.  The final invocation with frames == []
	 * does not correspond to a real stack, but rather causes us to compute
	 * data for the "all samples" frame.
	 */
	if (frames.length !== 0)
		frames = [''].concat(frames);

	if (frames.length - 1 > this.fge_maxdepth)
		this.fge_maxdepth = frames.length - 1;

	for (i = 0; i < this.fge_last.length && i < frames.length; i++) {
		if (this.fge_last[i] != frames[i])
			break;
	}

	nsameframes = i;

	for (i = this.fge_last.length - 1; i >= nsameframes; i--) {
		/*
		 * Each of these frames was present in the previous stack, but
		 * not this one, so we mark them having ended here.
		 */
		starts_key = [ this.fge_last[i], i ].join('--');
		ends_key = [ this.fge_last[i], i, this.fge_time ].join('--');
		this.fge_boxes[ends_key] = this.fge_starts[starts_key];
		this.fge_depthsamples[i] += this.fge_time -
		    this.fge_starts[starts_key];
		delete (this.fge_starts[starts_key]);
	}

	for (i = nsameframes; i < frames.length; i++) {
		/*
		 * Each of these frames was not present in the previous stack,
		 * so we mark them having started here.
		 */
		starts_key = [ frames[i], i ].join('--');
		this.fge_starts[starts_key] = this.fge_time;

		if (this.fge_depthsamples[i] === undefined)
			this.fge_depthsamples[i] = 0;
	}

	this.fge_time += count;
	this.fge_last = frames;
};

FlameGraphEmitter.prototype.color = function (depth, samples)
{
	var r = 205, rplus = 50;
	var g = 0, gplus = 230;
	var b = 0, bplus = 55;

	if (this.fge_params['coloring'] == 'random') {
		return ('rgb(' + [
		    r + Math.floor(Math.random() * rplus),
		    g + Math.floor(Math.random() * gplus),
		    b + Math.floor(Math.random() + bplus)
		].join(',') + ')');
	}

	if (this.fge_params['coloring'] == 'gradient') {
		var ratio = depth / this.fge_maxdepth;
		return ('rgb(' + [
		    r + Math.floor(ratio * rplus),
		    g + Math.floor(ratio * gplus),
		    b + Math.floor(ratio * bplus)
		].join(',') + ')');
	}

	var h = 0, hplus = 60;
	var s = 30, splus = 70;
	var v = 80, vplus = 20;

	var hratio = depth / this.fge_maxdepth;
	var sratio = samples / this.fge_depthsamples[depth];

	var rh = h + hratio * hplus;
	var rs = (s + sratio * splus) / 100;
	var rv = (v + hratio * vplus) / 100;
	var rgb = mod_color.convertHsvToRgb(rh, rs, rv);

	return ('rgb(' + rgb.join(',') + ')');
};

FlameGraphEmitter.prototype.draw = function (callback)
{
	var xml = new mod_xml.XmlEmitter(this.fge_output);

	var fontface = this.fge_params['font_face'];
	var fontsize = this.fge_params['font_size'];

	var xpad = 10;
	var ypadtop = fontsize * 4 + fontsize * 2 + 10;
	var ypadbtm = fontsize * 2 + 10;

	var width = this.fge_params['width'];
	var widthpersample = (width - 2 * xpad) / this.fge_time;
	var height = this.fge_maxdepth * this.fge_params['frame_height'] +
	    ypadtop + ypadbtm;

	var black = 'rgb(0, 0, 0)';

	xml.emitDoctype('svg', 'PUBLIC "-//W3C//DTD SVG 1.1//EN"',
	    'http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd');

	xml.emitStart('svg', {
	    'version': '1.1',
	    'width': width,
	    'height': height,
	    'onload': 'init(evt)',
	    'viewBox': [ 0, 0, width, height ].join(' '),
	    'xmlns': 'http://www.w3.org/2000/svg'
	});

	xml.emitStart('defs');
	xml.emitStart('linearGradient', {
	    'id': 'background',
	    'y1': 0,
	    'y2': 1,
	    'x1': 0,
	    'x2': 0
	});
	xml.emitEmpty('stop', { 'stop-color': '#eeeeee', 'offset': '5%' });
	xml.emitEmpty('stop', { 'stop-color': '#eeeeb0', 'offset': '95%' });
	xml.emitEnd('linearGradient');
	xml.emitEnd('defs');

	xml.emitStart('style', { 'type': 'text/css' });
	xml.emitCData(
	    '	rect[rx]:hover { stroke:black; stroke-width:1; }\n' +
	    '	text:hover { stroke:black; stroke-width:1; ' +
		'stroke-opacity:0.35; }\n'
	);
	xml.emitEnd('style');

	xml.emitStart('script', { 'type': 'text/ecmascript' });
	xml.emitCData(
	    '	var details;\n' +
	    '	function init(evt) {\n' +
	    '		details = document.getElementById("details").\n' +
	    '		    firstChild;\n' +
	    '	}\n' +
	    '	function s(info) { details.nodeValue = info; }\n' +
	    '	function c() { details.nodeValue = " "; }\n'
	);
	xml.emitEnd('script');

	emitRectangle(xml, 0, 0, width, height, 'url(#background)', {});

	emitString(xml, black, fontface, fontsize + 5, Math.floor(width / 2),
	    fontsize * 2, this.fge_params['title'], 'middle', {});

	emitString(xml, black, fontface, fontsize, xpad,
	    ypadtop - ypadbtm, 'Function:', 'left', {});

	emitString(xml, black, fontface, fontsize, xpad + 60,
	    ypadtop - ypadbtm, ' ', 'left', { 'id': 'details' });

	for (var ident in this.fge_boxes) {
		var parts = ident.split('--');
		var func = parts[0];
		var depth = parseInt(parts[1], 10);
		var endtime = parseInt(parts[2], 10);

		var starttime = this.fge_boxes[ident];
		var nsamples = endtime - starttime;

		var x1 = xpad + starttime * widthpersample;
		var x2 = xpad + endtime * widthpersample;
		var boxwidth = x2 - x1;

		if (boxwidth < this.fge_params['min_width'])
			continue;

		var y1 = height - ypadbtm - (depth + 1) *
		    this.fge_params['frame_height'] + 1;
		var y2 = height - ypadbtm - depth *
		    this.fge_params['frame_height'];

		var info;
		if (func.length === 0 && depth === 0) {
			info = 'all samples (' + nsamples + ' samples, 100%)';
		} else {
			var pct = ((100 * nsamples) / this.fge_time).toFixed(2);
			info = func + ' (' + nsamples + ' samples, ' +
			    pct + '%)';
		}

		var color = this.color(depth, nsamples);

		emitRectangle(xml, x1, y1, x2, y2, color, {
		    'rx': 2,
		    'ry': 2,
		    'onmouseover': 's("' + info + '")',
		    'onmouseout': 'c()'
		});

		if (boxwidth > 50) {
			var nchars = Math.floor(boxwidth / (0.7 * fontsize));

			var text;
			if (nchars < func.length)
				text = func.substr(0, nchars) + '..';
			else
				text = func;

			emitString(xml, black, fontface, fontsize, x1 + 3,
			    3 + (y1 + y2) / 2, text, 'left', {
				'onmouseover': 's("' + info + '")',
				'onmouseout': 'c()'
			    });
		}
	}

	xml.emitEnd('svg');

	/*
	 * XXX It's a little disingenuous to invoke the callback now because we
	 * don't actually know whether our output has been successfully written
	 * or just buffered inside node.  We really should implement flow
	 * control here by keeping track of how many rectangles we've emitted,
	 * and if we find that our output has been buffered, we simply stop
	 * until the underlying stream emits "drain", at which point we pick up
	 * where we left off.
	 */
	callback();
};

function emitRectangle(xml, x1, y1, x2, y2, fill, extra)
{
	var attrs = {
	    'x': x1.toFixed(1),
	    'y': y1.toFixed(1),
	    'width': (x2 - x1).toFixed(1),
	    'height': (y2 - y1).toFixed(1),
	    'fill': fill
	};

	for (var key in extra)
		attrs[key] = extra[key];

	xml.emitEmpty('rect', attrs);
}

function emitString(xml, color, font, size, x, y, str, loc, extra)
{
	var attrs = {
	    'text-anchor': loc,
	    'x': x,
	    'y': y,
	    'font-size': size,
	    'font-family': font,
	    'fill': color
	};

	for (var key in extra)
		attrs[key] = extra[key];

	xml.emitStart('text', attrs, { 'bare': true });
	xml.emitCData(str);
	xml.emitEnd('text', { 'bare': true });
}
