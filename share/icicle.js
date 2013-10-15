/*
 * icicle.js: implements icicle visualization for stacks
 */

/* Configuration */
var svSvgWidth = null;		/* image width (null to auto-compute) */
var svSvgHeight = null;		/* image height (null to auto-compute) */
var svAxisLabelWidth = 45;	/* width of axis labels */
var svChartWidth = null;	/* width of chart part of image */
var svChartHeight = null;	/* height of chart part of image */
var svGrowDown = false;		/* if true, stacks are drawn growing down */
var svTransitionTime = 3000;	/* time for transition */
var svCornerPixels = 3;		/* radius of rounded corners */
var svTextPaddingLeft = 5;	/* padding-left on rectangle labels */
var svTextPaddingRight = 10;	/* pading-right on rectangle labels */
var svTextPaddingTop = '1.2em';	/* padding-top on rectangle labels */
var svColorMode = 'mono';	/* coloring mode */

var svMaxDepth = 0;		/* maximum depth of data object */
var svMaxUnique = 0;		/* maximum unique contribution of any block */
var svDepthSamples = [];	/* # of samples at each depth */

/* DOM nodes */
var svSvg;			/* actual flame graph SVG object */
var svInfo;			/* status box */

/* d3 objects */
var svXScale;			/* x-axis scale */
var svYScale;			/* y-axis scale */
var svColorScale;		/* color scale */
var svPartition;		/* partition layout */
var svData;			/* raw data, processed through layout */
var svDataTree;			/* tree version of raw data */
var svRects;			/* all rectangles (d3 selection) */
var svClips;			/* clip paths (d3 selection) */
var svText;			/* labels (d3 selection) */

/* d3 value functions */
var svId;			/* clipping path node id */
var svColor;			/* rectangle fill color */
var svHeight;			/* height (rectangles and clip paths) */
var svRectWidth;		/* rectangle width */
var svTextWidth;		/* clip path width */
var svX;			/* X-coordinate (rectangles and clip paths) */
var svY;			/* Y-coordinate (rectangles and clip paths) */

window.onload = svInit;

function svInit()
{
	svDataTree = {
	    '': {
	        'svUnique': 0,
		'svTotal': Object.keys(sampledata).reduce(
		    function (p, c) { return (p + sampledata[c].svTotal); }, 0),
		'svChildren': sampledata
	    }
	};
	svAnnotateDepth(svDataTree, 0);

	if (svSvgWidth === null)
		svSvgWidth = parseInt(d3.select('#chart').style('width'), 10);

	if (svSvgHeight === null)
		svSvgHeight = 25 * svMaxDepth;

	svChartWidth = svSvgWidth - svAxisLabelWidth;
	svChartHeight = svSvgHeight - svAxisLabelWidth;

	svXScale = d3.scale.linear().range([0, svChartWidth]);
	svYScale = d3.scale.linear().range([0, svChartHeight]);

	svInfo = d3.select('#info').append('div').attr('class', 'svTooltip');
	svSvg = d3.select('#chart').insert('svg:svg', ':first-child')
	    .attr('width', svSvgWidth)
	    .attr('height', svSvgHeight);
	svSvg.append('svg:rect')
	    .attr('class', 'svBackground')
	    .attr('width', svSvgWidth)
	    .attr('height', svSvgHeight)
	    .attr('fill', '#ffffff')
	    .on('click', svZoomReset);
	svPartition = d3.layout.partition().children(function (d) {
		var rv = d3.entries(d.value.svChildren);
		return (rv);
	}).
	    value(function (d) { return (d.value.svTotal); }).
	    sort(function (d1, d2) {
		if (d1.data.key < d2.data.key)
			return (-1);
		if (d1.data.key > d2.data.key)
			return (1);
		return (0);
	    });

	if (svColorMode == 'random') {
		svColorScale = d3.scale.category20c();
		svColor = function (d) { return (svColorScale(d.data.key)); };
	} else if (svColorMode == 'mono') {
		svColor = svColorMono;
	} else {
		svColor = svColorFlame;
	}

	svId = function (d) {
		return (encodeURIComponent(
		    d.data.key + '@' + svYScale(d.y) + '@' + svXScale(d.x)));
	};
	svHeight = function (d) { return (svYScale(d.dy)); };
	svRectWidth = function (d) { return (svXScale(d.dx)); };
	svTextWidth = function (d) {
		return (Math.max(0, svRectWidth(d) - svTextPaddingRight));
	};
	svX = function (d) { return (svXScale(d.x) + svAxisLabelWidth); };

	if (svGrowDown)
		svY = function (d) {
		    return (svYScale(d.y) - svAxisLabelWidth); };
	else
		svY = function (d) {
		    return (svChartHeight - svYScale(d.y) - svHeight(d)); };

	svData = svPartition(d3.entries(svDataTree)[0]);
	svRects = svSvg.selectAll('rect').data(svData)
	    .enter().append('svg:rect')
	    .attr('class', 'svBox')
	    .attr('x', svX)
	    .attr('y', svY)
	    .attr('rx', svCornerPixels)
	    .attr('ry', svCornerPixels)
	    .attr('height', svHeight)
	    .attr('width', svRectWidth)
	    .attr('fill', svColor)
	    .on('click', svClick)
	    .on('mouseover', svStatusUpdate)
	    .on('mouseout', svStatusHide);
	svClips = svSvg.selectAll('clipPath').data(svData)
	    .enter().append('svg:clipPath')
	    .attr('id', svId)
	    .append('svg:rect')
	    .attr('x', svX)
	    .attr('y', svY)
	    .attr('width', svTextWidth)
	    .attr('height', svHeight);
	svText = svSvg.selectAll('text').data(svData)
	    .enter().append('text')
	    .attr('class', 'svBoxLabel')
	    .attr('x', svX)
	    .attr('y', svY)
	    .attr('dx', svTextPaddingLeft)
	    .attr('dy', svTextPaddingTop)
	    .attr('clip-path', function (d) {
		return ('url("#' + svId(d) + '")');
	    })
	    .on('click', svClick)
	    .text(function (d) { return (d.data.key); });

	svSvg.append("text")
	    .attr('x', -svSvgHeight)
	    .attr('dx', '8em')
	    .attr('y', '30px')
	    .attr('class', 'svYAxisLabel')
	    .text('Call Stacks')
	    .attr('transform', 'rotate(-90)' );

	svSvg.append('text')
	    .attr('id', 'dap')
	    .attr('x', '30px')
	    .attr('dx', '8em')
	    .attr('y', svSvgHeight - 30)
	    .attr('class', 'svXAxisLabel')
	    .attr('width', svSvgWidth - 30)
	    .text('Percentage of Samples')
}

function svZoomSet(cd)
{
	svXScale.domain([cd.x, cd.x + cd.dx]);
	svHeight = function (d) {
		return (svYScale(d.y + d.dy) - svYScale(d.y));
	};
	svRectWidth = function (d) {
		return (svXScale(d.x + d.dx) - svXScale(d.x));
	};
	svTextWidth = function (d) {
		return (Math.max(0, svXScale(d.x + d.dx) -
		    svXScale(d.x) - svTextPaddingRight));
	};
	svRects.transition()
	    .duration(svTransitionTime)
	    .attr('x', svX)
	    .attr('y', svY)
	    .attr('width', svRectWidth)
	    .attr('height', svHeight);
	svClips.transition()
	    .duration(svTransitionTime)
	    .attr('x', svX)
	    .attr('y', svY)
	    .attr('width', svTextWidth)
	    .attr('height', svHeight);
	svText.transition()
	    .duration(svTransitionTime)
	    .attr('x', svX)
	    .attr('y', svY);
}

var svTooltipTimeout;

function svStatusUpdate(d)
{
	/* Escape the key. */
	svInfo.text(d.data.key);
	var text = svInfo.html();
	var nsamples = d.data.value.svTotal;
	var nchildsamples = nsamples - d.data.value.svUnique;
	var pctTotal = (100 * nsamples / svDepthSamples[0]).toFixed(1);
	var left = d3.event.pageX + 'px';
	var tp = (d3.event.pageY - parseInt(svInfo.style('height'), 10)) +
	    'px';

	text += '<br />' + pctTotal + '% of all samples<br />' +
	    '(' + nsamples + ' samples, ' + nchildsamples + ' in children)';
	svInfo.html(text).
	    style('left', left).
	    style('top', tp);

	svTooltipTimeout = setTimeout(function () {
		svTooltipTimeout = null;
		svInfo.style('opacity', 0.9);
	}, 200);
}

function svStatusHide(d)
{
	if (svTooltipTimeout)
		clearTimeout(svTooltipTimeout);
	svInfo.text('').style('opacity', null);
}

function svAnnotateDepth(json, depth)
{
	var key;

	if (depth > svMaxDepth)
		svMaxDepth = depth;

	if (depth >= svDepthSamples.length)
		svDepthSamples[depth] = 0;


	for (key in json) {
		if (json[key].svUnique > svMaxUnique)
			svMaxUnique = json[key].svUnique;
		svDepthSamples[depth] += json[key].svTotal;
		svAnnotateDepth(json[key].svChildren, depth + 1);
	}
}

function svColorFlame(d)
{
	var h = 0, hplus = 60;
	var s = 30, splus = 70;
	var v = 95, vplus = 5;

	var depth = d.depth;
	var hratio = depth / svMaxDepth;
	var sratio = d.value / svDepthSamples[depth];

	var rh = h + hratio * hplus;
	var rs = (s + sratio * splus) / 100;
	var rv = (v + hratio * vplus) / 100;
	var rgb = convertHsvToRgb(rh, rs, rv);

	return ('rgb(' + rgb.join(',') + ')');
}

function svColorMono(d)
{
	var s = 20, splus = 80;
	var sratio;

	/*
	 * The next code block colors the block based on its percentage
	 * contribution to its parent.  This highlights leafs, even those
	 * representing a small total contribution to the whole graph.
	 */
	// if (depth === 0)
	// 	sratio = d.data.value.svUnique / svDepthSamples[0];
	// else
	// 	sratio = d.data.value.svUnique / d.parent.data.value.svTotal;

	/*
	 * This version colors the block based on its percentage contribution of
	 * overall time.
	 */
	sratio = d.data.value.svUnique / svMaxUnique;

	var rh = 24;
	var rs = (s + sratio * splus) / 100;
	var rv = 0.95;
	var rgb = convertHsvToRgb(rh, rs, rv);
	return ('rgb(' + rgb.join(',') + ')');
}

function svZoomReset()
{
	svZoomSet({ 'x': 0, 'dx': 1, 'y': 0 });
}

function svClick(cd)
{
	svZoomSet(cd);
}

/*
 * This function is copied directly from lib/color.js.  It would be better if we
 * could share code between Node.js and web JS.
 */
function convertHsvToRgb(h, s, v)
{
	var r, g, b;
	var i;
	var f, p, q, t;

	if (s === 0) {
		/*
		 * A saturation of 0.0 is achromatic (grey).
		 */
		r = g = b = v;

		return ([ Math.round(r * 255), Math.round(g * 255),
		    Math.round(b * 255) ]);
	}

	h /= 60; // sector 0 to 5

	i = Math.floor(h);
	f = h - i; // fractional part of h
	p = v * (1 - s);
	q = v * (1 - s * f);
	t = v * (1 - s * (1 - f));

	switch (i) {
		case 0:
			r = v;
			g = t;
			b = p;
			break;

		case 1:
			r = q;
			g = v;
			b = p;
			break;

		case 2:
			r = p;
			g = v;
			b = t;
			break;

		case 3:
			r = p;
			g = q;
			b = v;
			break;

		case 4:
			r = t;
			g = p;
			b = v;
			break;

		default: // case 5:
			r = v;
			g = p;
			b = q;
			break;
	}

	return ([ Math.round(r * 255),
	    Math.round(g * 255), Math.round(b * 255) ]);
}
