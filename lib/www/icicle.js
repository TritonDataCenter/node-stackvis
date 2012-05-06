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
	svColorScale = d3.scale.category20c();

	svInfo = d3.select('#info')[0][0].firstChild;

	svSvg = d3.select('#chart').append('svg:svg')
	    .attr('width', svSvgWidth)
	    .attr('height', svSvgHeight);

	svPartition = d3.layout.partition().children(function (d) {
		var rv = d3.entries(d.value.svChildren);
		return (rv);
	}).value(function (d) { return (d.value.svTotal); });

	svId = function (d) {
		return (d.data.key + '@' + svYScale(d.y) +
		    '@' + svXScale(d.x));
	};
	svColor = function (d) { return (svColorScale(d.data.key)); };
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

	d3.json('sample.json', function (json) {
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

function svClick(cd)
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
