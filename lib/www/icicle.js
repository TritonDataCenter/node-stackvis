/*
 * icicle.js: implements icicle visualization for stacks
 */

window.onload = svInit;

var svWidth = 800;
var svHeight = 500;
var xScale, yScale, colorScale;
var svData, svRects, svText;
var svInfo;

function svInit()
{
	xScale = d3.scale.linear().range([0, svWidth]);
	yScale = d3.scale.linear().range([0, svHeight]);
	colorScale = d3.scale.category20c();

	svInfo = d3.select('#info')[0][0].firstChild;
	console.log(svInfo.nodeValue);
	
	var vis = d3.select("#chart").append("svg:svg").
	    attr("width", svWidth).
	    attr("height", svHeight);
	
	var partition = d3.layout.partition().children(function (d) {
		return (isNaN(d.value) ? d3.entries(d.value) : null);
	    }).value(function (d) { return (d.value); });
	
	d3.json("sample.json", function (json) {
	    svData = partition(d3.entries(json)[0]);
	    svRects = vis.selectAll("rect").data(svData)
	    .enter().append("svg:rect")
	      .attr("x", function (d) { return (xScale(d.x)); })
	      .attr("y", function (d) { return (yScale(d.y)); })
	      .attr("rx", 5)
	      .attr("ry", 5)
	      .attr("width", function (d) { return (xScale(d.dx)); })
	      .attr("height", function (d) { return (yScale(d.dy)); })
	      .attr("fill", function (d) {
		return (colorScale((d.children ? d : d.parent).data.key));
	      })
	      .on("click", svClick)
	      .on("mouseover", svStatus);
	    svText = vis.selectAll("text").data(svData)
	    .enter().append("text")
	    .attr("x", function (d) { return (xScale(d.x)); })
	    .attr("y", function (d) { return (yScale(d.y)); })
	    .attr("dx", 5)
	    .attr("dy", "1.2em")
	    .attr("text-anchor", "start")
	    .text(function (d) { return (d.data.key); })
	});
}

function svClick(d)
{
	xScale.domain([d.x, d.x + d.dx]);
	yScale.domain([d.y, 1]).range([d.y ? 20 : 0, svHeight]);

	svRects.transition()
	  .duration(400)
	  .attr("x", function (d) { return (xScale(d.x)); })
	  .attr("y", function (d) { return (yScale(d.y)); })
	  .attr("width", function (d) {
		return (xScale(d.x + d.dx) - xScale(d.x));
	   })
	  .attr("height", function (d) {
		return (yScale(d.y + d.dy) - yScale(d.y));
	   });

	svText.transition()
	  .duration(400)
	  .attr("x", function (d) { return (xScale(d.x)); })
	  .attr("y", function (d) { return (yScale(d.y)); })
	  .attr("width", function (d) {
		return (xScale(d.x + d.dx) - xScale(d.x));
	   })
	  .attr("height", function (d) {
		return (yScale(d.y + d.dy) - yScale(d.y));
	   });
}

function svStatus(d)
{
	svInfo.nodeValue = d.data.key + ': '  + d.value;
}
