/*
 * icicle.js: implements icicle visualization for stacks
 */

/* Configuration */
var svSvgWidth = 1000;		/* image width */
var svSvgHeight = 650;		/* image height */
var svGrowDown = false;		/* if true, stacks are drawn growing down */
var svTransitionTime = 400;	/* time for transition */
var svCornerPixels = 5;		/* radius of rounded corners */
var svTextPaddingLeft = 5;	/* padding-left on rectangle labels */
var svTextPaddingRight = 10;	/* pading-right on rectangle labels */
var svTextPaddingTop = '1.2em';	/* padding-top on rectangle labels */
var svColorMode = 'bymodule';	/* coloring mode */

var svMaxDepth = 0;		/* maximum depth of data object */
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
	svXScale = d3.scale.linear().range([0, svSvgWidth]);
	svYScale = d3.scale.linear().range([0, svSvgHeight]);

	svInfo = d3.select('#info')[0][0].firstChild;

	svSvg = d3.select('#chart').append('svg:svg')
	    .attr('width', svSvgWidth)
	    .attr('height', svSvgHeight);

	svPartition = d3.layout.partition().children(function (d) {
		var rv = d3.entries(d.value.svChildren);
		return (rv);
	})
	    .value(function (d) { return (d.value.svTotal); })
	    .sort(function (d1, d2) {
		if (d1.data.key < d2.data.key)
			return (-1);
		if (d1.data.key > d2.data.key)
			return (1);
		return (0);
	    });

	if (svColorMode == 'random') {
		svColorScale = d3.scale.category20c();
		svColor = function (d) { return (svColorScale(d.data.key)); };
	} else {
		svColor = svColorFlame;
	}

	svId = function (d) {
		return (d.data.key + '@' + svYScale(d.y) +
		    '@' + svXScale(d.x));
	};
	svHeight = function (d) { return (svYScale(d.dy)); };
	svRectWidth = function (d) { return (svXScale(d.dx)); };
	svTextWidth = function (d) {
		return (Math.max(0, svRectWidth(d) - svTextPaddingRight));
	};
	svX = function (d) { return (svXScale(d.x)); };

	if (svGrowDown)
		svY = function (d) { return (svYScale(d.y)); };
	else
		svY = function (d) {
		    return (svSvgHeight - svYScale(d.y) - svHeight(d)); };

	d3.json('sample2.json', function (json) {
		svAnnotateDepth(json, 0);

		svData = svPartition(d3.entries(json)[0]);

		svRects = svSvg.selectAll('rect').data(svData)
		    .enter().append('svg:rect')
		    .attr('x', svX)
		    .attr('y', svY)
		    .attr('rx', svCornerPixels)
		    .attr('ry', svCornerPixels)
		    .attr('height', svHeight)
		    .attr('width', svRectWidth)
		    .attr('fill', svColor)
		    .on('click', svClick)
		    .on('mouseover', svStatus);

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
		    .attr('x', svX)
		    .attr('y', svY)
		    .attr('dx', svTextPaddingLeft)
		    .attr('dy', svTextPaddingTop)
		    .attr('clip-path', function (d) {
			return ('url(#' + svId(d) + ')');
		    })
		    .text(function (d) { return (d.data.key); });
	});
}

function svZoomSet(cd)
{
	svXScale.domain([cd.x, cd.x + cd.dx]);
	svYScale.domain([cd.y, 1]).range([cd.y ? 20 : 0, svSvgHeight]);

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

function svStatus(d)
{
	svInfo.nodeValue = d.data.key + ': '  + d.value;
}

function svAnnotateDepth(json, depth)
{
	var key;

	if (depth > svMaxDepth)
		svMaxDepth = depth;

	if (depth >= svDepthSamples.length)
		svDepthSamples[depth] = 0;

	for (key in json) {
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
