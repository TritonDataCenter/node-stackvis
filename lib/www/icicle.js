/*
 * icicle.js: implements icicle visualization for stacks
 */

/* Configuration */
var svSvgWidth = null;		/* image width (null to auto-compute) */
var svSvgHeight = 600;		/* image height */
var svGrowDown = false;		/* if true, stacks are drawn growing down */
var svTransitionTime = 750;	/* time for transition */
var svCornerPixels = 5;		/* radius of rounded corners */
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
	if (svSvgWidth === null)
		svSvgWidth = parseInt(d3.select('#chart').style('width'), 10);

	svXScale = d3.scale.linear().range([0, svSvgWidth]);
	svYScale = d3.scale.linear().range([0, svSvgHeight]);

	svInfo = d3.select('#info').append('div').attr('class', 'svTooltip');
	svSvg = d3.select('#chart').append('svg:svg')
	    .attr('width', svSvgWidth)
	    .attr('height', svSvgHeight);
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
		return (d.data.key + '@' + svYScale(d.y) + '@' + svXScale(d.x));
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

	svAnnotateDepth(sampledata, 0);
	svData = svPartition(d3.entries(sampledata)[0]);
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
		return ('url(#' + svId(d) + ')');
	    })
	    .on('click', svClick)
	    .text(function (d) { return (d.data.key); });
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
	}, 500);
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

/* sample JSON data. */
/* BEGIN JSSTYLED */
var sampledata = {
	"redis-server`_start": {
		"svUnique": 0,
		"svTotal": 1782,
		"svChildren": {
			"redis-server`main": {
				"svUnique": 0,
				"svTotal": 1782,
				"svChildren": {
					"redis-server`aeMain": {
						"svUnique": 1,
						"svTotal": 1780,
						"svChildren": {
							"redis-server`aeGetTime": {
								"svUnique": 1,
								"svTotal": 1,
								"svChildren": {}
							},
							"redis-server`aeProcessEvents": {
								"svUnique": 40,
								"svTotal": 1774,
								"svChildren": {
									"libc.so.1`close": {
										"svUnique": 1,
										"svTotal": 1,
										"svChildren": {}
									},
									"libc.so.1`free": {
										"svUnique": 0,
										"svTotal": 1,
										"svChildren": {
											"libc.so.1`mutex_unlock": {
												"svUnique": 0,
												"svTotal": 1,
												"svChildren": {
													"libc.so.1`clear_lockbyte": {
														"svUnique": 1,
														"svTotal": 1,
														"svChildren": {}
													}
												}
											}
										}
									},
									"libc.so.1`gettimeofday": {
										"svUnique": 17,
										"svTotal": 17,
										"svChildren": {}
									},
									"libc.so.1`port_getn": {
										"svUnique": 1,
										"svTotal": 1,
										"svChildren": {}
									},
									"libc.so.1`read": {
										"svUnique": 1,
										"svTotal": 1,
										"svChildren": {}
									},
									"libc.so.1`time": {
										"svUnique": 1,
										"svTotal": 1,
										"svChildren": {}
									},
									"redis-server`0x425dc0": {
										"svUnique": 1,
										"svTotal": 1,
										"svChildren": {}
									},
									"redis-server`acceptCommonHandler": {
										"svUnique": 2,
										"svTotal": 2,
										"svChildren": {}
									},
									"redis-server`acceptTcpHandler": {
										"svUnique": 0,
										"svTotal": 111,
										"svChildren": {
											"libc.so.1`strcpy": {
												"svUnique": 2,
												"svTotal": 2,
												"svChildren": {}
											},
											"libnsl.so.1`inet_ntoa": {
												"svUnique": 2,
												"svTotal": 2,
												"svChildren": {}
											},
											"redis-server`acceptCommonHandler": {
												"svUnique": 0,
												"svTotal": 84,
												"svChildren": {
													"libc.so.1`time": {
														"svUnique": 4,
														"svTotal": 4,
														"svChildren": {}
													},
													"redis-server`anetTcpNoDelay": {
														"svUnique": 1,
														"svTotal": 1,
														"svChildren": {}
													},
													"redis-server`createClient": {
														"svUnique": 2,
														"svTotal": 76,
														"svChildren": {
															"libc.so.1`__time": {
																"svUnique": 2,
																"svTotal": 2,
																"svChildren": {}
															},
															"libc.so.1`malloc": {
																"svUnique": 1,
																"svTotal": 1,
																"svChildren": {}
															},
															"redis-server`aeCreateFileEvent": {
																"svUnique": 2,
																"svTotal": 2,
																"svChildren": {}
															},
															"redis-server`anetNonBlock": {
																"svUnique": 0,
																"svTotal": 6,
																"svChildren": {
																	"libc.so.1`__fcntl": {
																		"svUnique": 1,
																		"svTotal": 1,
																		"svChildren": {}
																	},
																	"libc.so.1`fcntl": {
																		"svUnique": 3,
																		"svTotal": 5,
																		"svChildren": {
																			"libc.so.1`__fcntl_syscall": {
																				"svUnique": 2,
																				"svTotal": 2,
																				"svChildren": {}
																			}
																		}
																	}
																}
															},
															"redis-server`anetTcpNoDelay": {
																"svUnique": 0,
																"svTotal": 1,
																"svChildren": {
																	"libc.so.1`_so_setsockopt": {
																		"svUnique": 1,
																		"svTotal": 1,
																		"svChildren": {}
																	}
																}
															},
															"redis-server`dictCreate": {
																"svUnique": 0,
																"svTotal": 8,
																"svChildren": {
																	"redis-server`zmalloc": {
																		"svUnique": 0,
																		"svTotal": 8,
																		"svChildren": {
																			"libc.so.1`malloc": {
																				"svUnique": 1,
																				"svTotal": 8,
																				"svChildren": {
																					"libc.so.1`_malloc_unlocked": {
																						"svUnique": 2,
																						"svTotal": 3,
																						"svChildren": {
																							"libc.so.1`t_delete": {
																								"svUnique": 0,
																								"svTotal": 1,
																								"svChildren": {
																									"libc.so.1`t_splay": {
																										"svUnique": 1,
																										"svTotal": 1,
																										"svChildren": {}
																									}
																								}
																							}
																						}
																					},
																					"libc.so.1`mutex_lock": {
																						"svUnique": 0,
																						"svTotal": 1,
																						"svChildren": {
																							"libc.so.1`mutex_lock_impl": {
																								"svUnique": 1,
																								"svTotal": 1,
																								"svChildren": {}
																							}
																						}
																					},
																					"libc.so.1`mutex_unlock": {
																						"svUnique": 0,
																						"svTotal": 2,
																						"svChildren": {
																							"libc.so.1`mutex_unlock_queue": {
																								"svUnique": 0,
																								"svTotal": 2,
																								"svChildren": {
																									"libc.so.1`clear_lockbyte": {
																										"svUnique": 2,
																										"svTotal": 2,
																										"svChildren": {}
																									}
																								}
																							}
																						}
																					},
																					"libc.so.1`t_delete": {
																						"svUnique": 1,
																						"svTotal": 1,
																						"svChildren": {}
																					}
																				}
																			}
																		}
																	}
																}
															},
															"redis-server`listAddNodeTail": {
																"svUnique": 0,
																"svTotal": 6,
																"svChildren": {
																	"redis-server`zmalloc": {
																		"svUnique": 0,
																		"svTotal": 6,
																		"svChildren": {
																			"libc.so.1`malloc": {
																				"svUnique": 1,
																				"svTotal": 6,
																				"svChildren": {
																					"libc.so.1`_malloc_unlocked": {
																						"svUnique": 1,
																						"svTotal": 4,
																						"svChildren": {
																							"libc.so.1`_smalloc": {
																								"svUnique": 2,
																								"svTotal": 2,
																								"svChildren": {}
																							},
																							"libc.so.1`cleanfree": {
																								"svUnique": 1,
																								"svTotal": 1,
																								"svChildren": {}
																							}
																						}
																					},
																					"libc.so.1`mutex_lock": {
																						"svUnique": 0,
																						"svTotal": 1,
																						"svChildren": {
																							"libc.so.1`mutex_lock_impl": {
																								"svUnique": 1,
																								"svTotal": 1,
																								"svChildren": {}
																							}
																						}
																					}
																				}
																			}
																		}
																	}
																}
															},
															"redis-server`listCreate": {
																"svUnique": 0,
																"svTotal": 22,
																"svChildren": {
																	"redis-server`zmalloc": {
																		"svUnique": 2,
																		"svTotal": 22,
																		"svChildren": {
																			"libc.so.1`malloc": {
																				"svUnique": 0,
																				"svTotal": 20,
																				"svChildren": {
																					"libc.so.1`_malloc_unlocked": {
																						"svUnique": 0,
																						"svTotal": 11,
																						"svChildren": {
																							"libc.so.1`_smalloc": {
																								"svUnique": 11,
																								"svTotal": 11,
																								"svChildren": {}
																							}
																						}
																					},
																					"libc.so.1`mutex_lock": {
																						"svUnique": 0,
																						"svTotal": 5,
																						"svChildren": {
																							"libc.so.1`mutex_lock_impl": {
																								"svUnique": 4,
																								"svTotal": 5,
																								"svChildren": {
																									"libc.so.1`sigon": {
																										"svUnique": 1,
																										"svTotal": 1,
																										"svChildren": {}
																									}
																								}
																							}
																						}
																					},
																					"libc.so.1`mutex_unlock": {
																						"svUnique": 0,
																						"svTotal": 4,
																						"svChildren": {
																							"libc.so.1`mutex_unlock_queue": {
																								"svUnique": 0,
																								"svTotal": 4,
																								"svChildren": {
																									"libc.so.1`clear_lockbyte": {
																										"svUnique": 4,
																										"svTotal": 4,
																										"svChildren": {}
																									}
																								}
																							}
																						}
																					}
																				}
																			}
																		}
																	}
																}
															},
															"redis-server`sdsnewlen": {
																"svUnique": 0,
																"svTotal": 8,
																"svChildren": {
																	"redis-server`zmalloc": {
																		"svUnique": 1,
																		"svTotal": 8,
																		"svChildren": {
																			"libc.so.1`malloc": {
																				"svUnique": 0,
																				"svTotal": 7,
																				"svChildren": {
																					"libc.so.1`_malloc_unlocked": {
																						"svUnique": 0,
																						"svTotal": 3,
																						"svChildren": {
																							"libc.so.1`_smalloc": {
																								"svUnique": 3,
																								"svTotal": 3,
																								"svChildren": {}
																							}
																						}
																					},
																					"libc.so.1`mutex_lock": {
																						"svUnique": 0,
																						"svTotal": 4,
																						"svChildren": {
																							"libc.so.1`mutex_lock_impl": {
																								"svUnique": 4,
																								"svTotal": 4,
																								"svChildren": {}
																							}
																						}
																					}
																				}
																			}
																		}
																	}
																}
															},
															"redis-server`zmalloc": {
																"svUnique": 1,
																"svTotal": 18,
																"svChildren": {
																	"libc.so.1`malloc": {
																		"svUnique": 2,
																		"svTotal": 17,
																		"svChildren": {
																			"libc.so.1`_malloc_unlocked": {
																				"svUnique": 5,
																				"svTotal": 5,
																				"svChildren": {}
																			},
																			"libc.so.1`cleanfree": {
																				"svUnique": 1,
																				"svTotal": 1,
																				"svChildren": {}
																			},
																			"libc.so.1`mutex_lock": {
																				"svUnique": 0,
																				"svTotal": 2,
																				"svChildren": {
																					"libc.so.1`mutex_lock_impl": {
																						"svUnique": 1,
																						"svTotal": 1,
																						"svChildren": {}
																					},
																					"libc.so.1`sigon": {
																						"svUnique": 1,
																						"svTotal": 1,
																						"svChildren": {}
																					}
																				}
																			},
																			"libc.so.1`mutex_lock_impl": {
																				"svUnique": 2,
																				"svTotal": 2,
																				"svChildren": {}
																			},
																			"libc.so.1`mutex_unlock": {
																				"svUnique": 1,
																				"svTotal": 3,
																				"svChildren": {
																					"libc.so.1`clear_lockbyte": {
																						"svUnique": 2,
																						"svTotal": 2,
																						"svChildren": {}
																					}
																				}
																			},
																			"libc.so.1`mutex_unlock_queue": {
																				"svUnique": 2,
																				"svTotal": 2,
																				"svChildren": {}
																			}
																		}
																	}
																}
															}
														}
													},
													"redis-server`dictCreate": {
														"svUnique": 1,
														"svTotal": 1,
														"svChildren": {}
													},
													"redis-server`sdsempty": {
														"svUnique": 2,
														"svTotal": 2,
														"svChildren": {}
													}
												}
											},
											"redis-server`anetTcpAccept": {
												"svUnique": 1,
												"svTotal": 22,
												"svChildren": {
													"libnsl.so.1`inet_ntoa": {
														"svUnique": 0,
														"svTotal": 13,
														"svChildren": {
															"libc.so.1`sprintf": {
																"svUnique": 1,
																"svTotal": 1,
																"svChildren": {}
															},
															"libnsl.so.1`inet_ntoa_r": {
																"svUnique": 0,
																"svTotal": 12,
																"svChildren": {
																	"libc.so.1`_ndoprnt": {
																		"svUnique": 1,
																		"svTotal": 1,
																		"svChildren": {}
																	},
																	"libc.so.1`sprintf": {
																		"svUnique": 1,
																		"svTotal": 11,
																		"svChildren": {
																			"libc.so.1`_ndoprnt": {
																				"svUnique": 9,
																				"svTotal": 9,
																				"svChildren": {}
																			},
																			"libc.so.1`ferror": {
																				"svUnique": 1,
																				"svTotal": 1,
																				"svChildren": {}
																			}
																		}
																	}
																}
															}
														}
													},
													"libnsl.so.1`inet_ntoa_r": {
														"svUnique": 1,
														"svTotal": 1,
														"svChildren": {}
													},
													"libsocket.so.1`accept": {
														"svUnique": 2,
														"svTotal": 2,
														"svChildren": {}
													},
													"redis-server`anetGenericAccept": {
														"svUnique": 0,
														"svTotal": 5,
														"svChildren": {
															"libc.so.1`_so_accept": {
																"svUnique": 1,
																"svTotal": 1,
																"svChildren": {}
															},
															"libsocket.so.1`accept": {
																"svUnique": 0,
																"svTotal": 4,
																"svChildren": {
																	"libc.so.1`__so_accept": {
																		"svUnique": 3,
																		"svTotal": 3,
																		"svChildren": {}
																	},
																	"libc.so.1`_so_accept": {
																		"svUnique": 1,
																		"svTotal": 1,
																		"svChildren": {}
																	}
																}
															}
														}
													}
												}
											},
											"redis-server`redisLog": {
												"svUnique": 1,
												"svTotal": 1,
												"svChildren": {}
											}
										}
									},
									"redis-server`aeApiAssociate": {
										"svUnique": 1,
										"svTotal": 1,
										"svChildren": {}
									},
									"redis-server`aeApiPoll.clone.1": {
										"svUnique": 21,
										"svTotal": 79,
										"svChildren": {
											"libc.so.1`_portfs": {
												"svUnique": 10,
												"svTotal": 10,
												"svChildren": {}
											},
											"libc.so.1`port_associate": {
												"svUnique": 2,
												"svTotal": 2,
												"svChildren": {}
											},
											"redis-server`0x425dd0": {
												"svUnique": 2,
												"svTotal": 2,
												"svChildren": {}
											},
											"redis-server`aeApiAssociate": {
												"svUnique": 5,
												"svTotal": 44,
												"svChildren": {
													"libc.so.1`_portfs": {
														"svUnique": 28,
														"svTotal": 28,
														"svChildren": {}
													},
													"libc.so.1`port_associate": {
														"svUnique": 11,
														"svTotal": 11,
														"svChildren": {}
													}
												}
											}
										}
									},
									"redis-server`aeGetTime": {
										"svUnique": 2,
										"svTotal": 2,
										"svChildren": {}
									},
									"redis-server`anetTcpAccept": {
										"svUnique": 1,
										"svTotal": 1,
										"svChildren": {}
									},
									"redis-server`freeClient": {
										"svUnique": 6,
										"svTotal": 107,
										"svChildren": {
											"libc.so.1`__close": {
												"svUnique": 3,
												"svTotal": 3,
												"svChildren": {}
											},
											"libc.so.1`close": {
												"svUnique": 1,
												"svTotal": 3,
												"svChildren": {
													"libc.so.1`_aio_close": {
														"svUnique": 2,
														"svTotal": 2,
														"svChildren": {}
													}
												}
											},
											"libc.so.1`free": {
												"svUnique": 0,
												"svTotal": 15,
												"svChildren": {
													"libc.so.1`_free_unlocked": {
														"svUnique": 3,
														"svTotal": 3,
														"svChildren": {}
													},
													"libc.so.1`mutex_lock": {
														"svUnique": 0,
														"svTotal": 7,
														"svChildren": {
															"libc.so.1`mutex_lock_impl": {
																"svUnique": 6,
																"svTotal": 7,
																"svChildren": {
																	"libc.so.1`sigon": {
																		"svUnique": 1,
																		"svTotal": 1,
																		"svChildren": {}
																	}
																}
															}
														}
													},
													"libc.so.1`mutex_lock_impl": {
														"svUnique": 1,
														"svTotal": 1,
														"svChildren": {}
													},
													"libc.so.1`mutex_unlock": {
														"svUnique": 0,
														"svTotal": 3,
														"svChildren": {
															"libc.so.1`clear_lockbyte": {
																"svUnique": 1,
																"svTotal": 1,
																"svChildren": {}
															},
															"libc.so.1`mutex_unlock_queue": {
																"svUnique": 1,
																"svTotal": 2,
																"svChildren": {
																	"libc.so.1`clear_lockbyte": {
																		"svUnique": 1,
																		"svTotal": 1,
																		"svChildren": {}
																	}
																}
															}
														}
													},
													"libc.so.1`mutex_unlock_queue": {
														"svUnique": 1,
														"svTotal": 1,
														"svChildren": {}
													}
												}
											},
											"libc.so.1`mutex_unlock": {
												"svUnique": 1,
												"svTotal": 1,
												"svChildren": {}
											},
											"redis-server`_dictClear": {
												"svUnique": 1,
												"svTotal": 1,
												"svChildren": {}
											},
											"redis-server`aeDeleteFileEvent": {
												"svUnique": 2,
												"svTotal": 2,
												"svChildren": {}
											},
											"redis-server`dictGetSafeIterator": {
												"svUnique": 1,
												"svTotal": 1,
												"svChildren": {}
											},
											"redis-server`dictNext": {
												"svUnique": 2,
												"svTotal": 2,
												"svChildren": {}
											},
											"redis-server`dictReleaseIterator": {
												"svUnique": 1,
												"svTotal": 1,
												"svChildren": {}
											},
											"redis-server`freeClientMultiState": {
												"svUnique": 1,
												"svTotal": 1,
												"svChildren": {}
											},
											"redis-server`listDelNode": {
												"svUnique": 0,
												"svTotal": 1,
												"svChildren": {
													"libc.so.1`free": {
														"svUnique": 0,
														"svTotal": 1,
														"svChildren": {
															"libc.so.1`_free_unlocked": {
																"svUnique": 1,
																"svTotal": 1,
																"svChildren": {}
															}
														}
													}
												}
											},
											"redis-server`listRelease": {
												"svUnique": 8,
												"svTotal": 8,
												"svChildren": {}
											},
											"redis-server`listRewind": {
												"svUnique": 4,
												"svTotal": 4,
												"svChildren": {}
											},
											"redis-server`listSearchKey": {
												"svUnique": 29,
												"svTotal": 39,
												"svChildren": {
													"libc.so.1`free": {
														"svUnique": 0,
														"svTotal": 1,
														"svChildren": {
															"libc.so.1`mutex_lock": {
																"svUnique": 0,
																"svTotal": 1,
																"svChildren": {
																	"libc.so.1`mutex_lock_impl": {
																		"svUnique": 1,
																		"svTotal": 1,
																		"svChildren": {}
																	}
																}
															}
														}
													},
													"redis-server`listGetIterator": {
														"svUnique": 0,
														"svTotal": 8,
														"svChildren": {
															"redis-server`zmalloc": {
																"svUnique": 0,
																"svTotal": 8,
																"svChildren": {
																	"libc.so.1`malloc": {
																		"svUnique": 2,
																		"svTotal": 8,
																		"svChildren": {
																			"libc.so.1`_malloc_unlocked": {
																				"svUnique": 0,
																				"svTotal": 3,
																				"svChildren": {
																					"libc.so.1`_smalloc": {
																						"svUnique": 1,
																						"svTotal": 1,
																						"svChildren": {}
																					},
																					"libc.so.1`cleanfree": {
																						"svUnique": 0,
																						"svTotal": 2,
																						"svChildren": {
																							"libc.so.1`realfree": {
																								"svUnique": 1,
																								"svTotal": 2,
																								"svChildren": {
																									"libc.so.1`t_delete": {
																										"svUnique": 0,
																										"svTotal": 1,
																										"svChildren": {
																											"libc.so.1`t_splay": {
																												"svUnique": 1,
																												"svTotal": 1,
																												"svChildren": {}
																											}
																										}
																									}
																								}
																							}
																						}
																					}
																				}
																			},
																			"libc.so.1`mutex_lock": {
																				"svUnique": 0,
																				"svTotal": 2,
																				"svChildren": {
																					"libc.so.1`mutex_lock_impl": {
																						"svUnique": 2,
																						"svTotal": 2,
																						"svChildren": {}
																					}
																				}
																			},
																			"libc.so.1`mutex_unlock": {
																				"svUnique": 0,
																				"svTotal": 1,
																				"svChildren": {
																					"libc.so.1`mutex_unlock_queue": {
																						"svUnique": 1,
																						"svTotal": 1,
																						"svChildren": {}
																					}
																				}
																			}
																		}
																	}
																}
															}
														}
													},
													"redis-server`zmalloc": {
														"svUnique": 1,
														"svTotal": 1,
														"svChildren": {}
													}
												}
											},
											"redis-server`pubsubUnsubscribeAllChannels": {
												"svUnique": 0,
												"svTotal": 15,
												"svChildren": {
													"libc.so.1`free": {
														"svUnique": 0,
														"svTotal": 1,
														"svChildren": {
															"libc.so.1`_free_unlocked": {
																"svUnique": 1,
																"svTotal": 1,
																"svChildren": {}
															}
														}
													},
													"redis-server`dictGetIterator": {
														"svUnique": 1,
														"svTotal": 1,
														"svChildren": {}
													},
													"redis-server`dictGetSafeIterator": {
														"svUnique": 0,
														"svTotal": 13,
														"svChildren": {
															"redis-server`dictGetIterator": {
																"svUnique": 0,
																"svTotal": 11,
																"svChildren": {
																	"libc.so.1`malloc": {
																		"svUnique": 1,
																		"svTotal": 1,
																		"svChildren": {}
																	},
																	"redis-server`zmalloc": {
																		"svUnique": 0,
																		"svTotal": 10,
																		"svChildren": {
																			"libc.so.1`malloc": {
																				"svUnique": 0,
																				"svTotal": 10,
																				"svChildren": {
																					"libc.so.1`_malloc_unlocked": {
																						"svUnique": 0,
																						"svTotal": 9,
																						"svChildren": {
																							"libc.so.1`cleanfree": {
																								"svUnique": 0,
																								"svTotal": 9,
																								"svChildren": {
																									"libc.so.1`realfree": {
																										"svUnique": 5,
																										"svTotal": 9,
																										"svChildren": {
																											"libc.so.1`t_delete": {
																												"svUnique": 1,
																												"svTotal": 4,
																												"svChildren": {
																													"libc.so.1`t_splay": {
																														"svUnique": 3,
																														"svTotal": 3,
																														"svChildren": {}
																													}
																												}
																											}
																										}
																									}
																								}
																							}
																						}
																					},
																					"libc.so.1`mutex_lock": {
																						"svUnique": 0,
																						"svTotal": 1,
																						"svChildren": {
																							"libc.so.1`mutex_lock_impl": {
																								"svUnique": 1,
																								"svTotal": 1,
																								"svChildren": {}
																							}
																						}
																					}
																				}
																			}
																		}
																	}
																}
															},
															"redis-server`zmalloc": {
																"svUnique": 2,
																"svTotal": 2,
																"svChildren": {}
															}
														}
													}
												}
											},
											"redis-server`pubsubUnsubscribeAllPatterns": {
												"svUnique": 2,
												"svTotal": 2,
												"svChildren": {}
											},
											"redis-server`unwatchAllKeys": {
												"svUnique": 2,
												"svTotal": 2,
												"svChildren": {}
											}
										}
									},
									"redis-server`freeClientMultiState": {
										"svUnique": 1,
										"svTotal": 1,
										"svChildren": {}
									},
									"redis-server`processInputBuffer": {
										"svUnique": 1,
										"svTotal": 1,
										"svChildren": {}
									},
									"redis-server`readQueryFromClient": {
										"svUnique": 83,
										"svTotal": 1173,
										"svChildren": {
											"libc.so.1`__read": {
												"svUnique": 9,
												"svTotal": 9,
												"svChildren": {}
											},
											"libc.so.1`__time": {
												"svUnique": 16,
												"svTotal": 16,
												"svChildren": {}
											},
											"libc.so.1`read": {
												"svUnique": 3,
												"svTotal": 3,
												"svChildren": {}
											},
											"libc.so.1`time": {
												"svUnique": 5,
												"svTotal": 5,
												"svChildren": {}
											},
											"redis-server`processCommand": {
												"svUnique": 1,
												"svTotal": 1,
												"svChildren": {}
											},
											"redis-server`processInputBuffer": {
												"svUnique": 11,
												"svTotal": 1041,
												"svChildren": {
													"libc.so.1`free": {
														"svUnique": 2,
														"svTotal": 2,
														"svChildren": {}
													},
													"libc.so.1`strstr": {
														"svUnique": 2,
														"svTotal": 2,
														"svChildren": {}
													},
													"redis-server`call": {
														"svUnique": 1,
														"svTotal": 1,
														"svChildren": {}
													},
													"redis-server`createObject": {
														"svUnique": 1,
														"svTotal": 1,
														"svChildren": {}
													},
													"redis-server`decrRefCount": {
														"svUnique": 2,
														"svTotal": 2,
														"svChildren": {}
													},
													"redis-server`dictFetchValue": {
														"svUnique": 4,
														"svTotal": 4,
														"svChildren": {}
													},
													"redis-server`lookupCommand": {
														"svUnique": 4,
														"svTotal": 4,
														"svChildren": {}
													},
													"redis-server`processCommand": {
														"svUnique": 63,
														"svTotal": 586,
														"svChildren": {
															"libc.so.1`strcasecmp": {
																"svUnique": 1,
																"svTotal": 1,
																"svChildren": {}
															},
															"redis-server`call": {
																"svUnique": 16,
																"svTotal": 471,
																"svChildren": {
																	"libc.so.1`gettimeofday": {
																		"svUnique": 306,
																		"svTotal": 306,
																		"svChildren": {}
																	},
																	"redis-server`0x425dc0": {
																		"svUnique": 4,
																		"svTotal": 4,
																		"svChildren": {}
																	},
																	"redis-server`_addReplyToBuffer": {
																		"svUnique": 2,
																		"svTotal": 2,
																		"svChildren": {}
																	},
																	"redis-server`addReply": {
																		"svUnique": 3,
																		"svTotal": 136,
																		"svChildren": {
																			"libc.so.1`memcpy": {
																				"svUnique": 8,
																				"svTotal": 8,
																				"svChildren": {}
																			},
																			"redis-server`0x426220": {
																				"svUnique": 1,
																				"svTotal": 1,
																				"svChildren": {}
																			},
																			"redis-server`_addReplyToBuffer": {
																				"svUnique": 4,
																				"svTotal": 4,
																				"svChildren": {}
																			},
																			"redis-server`prepareClientToWrite": {
																				"svUnique": 26,
																				"svTotal": 120,
																				"svChildren": {
																					"redis-server`aeCreateFileEvent": {
																						"svUnique": 94,
																						"svTotal": 94,
																						"svChildren": {}
																					}
																				}
																			}
																		}
																	},
																	"redis-server`prepareClientToWrite": {
																		"svUnique": 1,
																		"svTotal": 1,
																		"svChildren": {}
																	},
																	"redis-server`slowlogPushEntryIfNeeded": {
																		"svUnique": 2,
																		"svTotal": 2,
																		"svChildren": {}
																	},
																	"redis-server`ustime": {
																		"svUnique": 4,
																		"svTotal": 4,
																		"svChildren": {}
																	}
																}
															},
															"redis-server`dictFetchValue": {
																"svUnique": 1,
																"svTotal": 44,
																"svChildren": {
																	"redis-server`dictFind": {
																		"svUnique": 13,
																		"svTotal": 38,
																		"svChildren": {
																			"libc.so.1`strcasecmp": {
																				"svUnique": 2,
																				"svTotal": 2,
																				"svChildren": {}
																			},
																			"libc.so.1`tolower": {
																				"svUnique": 1,
																				"svTotal": 1,
																				"svChildren": {}
																			},
																			"redis-server`0x425fe0": {
																				"svUnique": 3,
																				"svTotal": 3,
																				"svChildren": {}
																			},
																			"redis-server`0x426010": {
																				"svUnique": 2,
																				"svTotal": 2,
																				"svChildren": {}
																			},
																			"redis-server`dictGenCaseHashFunction": {
																				"svUnique": 5,
																				"svTotal": 7,
																				"svChildren": {
																					"libc.so.1`tolower": {
																						"svUnique": 2,
																						"svTotal": 2,
																						"svChildren": {}
																					}
																				}
																			},
																			"redis-server`dictSdsKeyCaseCompare": {
																				"svUnique": 1,
																				"svTotal": 10,
																				"svChildren": {
																					"libc.so.1`strcasecmp": {
																						"svUnique": 9,
																						"svTotal": 9,
																						"svChildren": {}
																					}
																				}
																			}
																		}
																	},
																	"redis-server`dictGenCaseHashFunction": {
																		"svUnique": 2,
																		"svTotal": 2,
																		"svChildren": {}
																	},
																	"redis-server`dictSdsCaseHash": {
																		"svUnique": 1,
																		"svTotal": 1,
																		"svChildren": {}
																	},
																	"redis-server`dictSdsKeyCaseCompare": {
																		"svUnique": 2,
																		"svTotal": 2,
																		"svChildren": {}
																	}
																}
															},
															"redis-server`dictFind": {
																"svUnique": 2,
																"svTotal": 2,
																"svChildren": {}
															},
															"redis-server`slowlogPushEntryIfNeeded": {
																"svUnique": 3,
																"svTotal": 3,
																"svChildren": {}
															},
															"redis-server`ustime": {
																"svUnique": 2,
																"svTotal": 2,
																"svChildren": {}
															}
														}
													},
													"redis-server`processInlineBuffer": {
														"svUnique": 8,
														"svTotal": 335,
														"svChildren": {
															"libc.so.1`_free_unlocked": {
																"svUnique": 3,
																"svTotal": 3,
																"svChildren": {}
															},
															"libc.so.1`free": {
																"svUnique": 2,
																"svTotal": 40,
																"svChildren": {
																	"libc.so.1`_free_unlocked": {
																		"svUnique": 7,
																		"svTotal": 7,
																		"svChildren": {}
																	},
																	"libc.so.1`mutex_lock": {
																		"svUnique": 3,
																		"svTotal": 14,
																		"svChildren": {
																			"libc.so.1`mutex_lock_impl": {
																				"svUnique": 11,
																				"svTotal": 11,
																				"svChildren": {}
																			}
																		}
																	},
																	"libc.so.1`mutex_lock_impl": {
																		"svUnique": 1,
																		"svTotal": 1,
																		"svChildren": {}
																	},
																	"libc.so.1`mutex_unlock": {
																		"svUnique": 3,
																		"svTotal": 15,
																		"svChildren": {
																			"libc.so.1`clear_lockbyte": {
																				"svUnique": 1,
																				"svTotal": 1,
																				"svChildren": {}
																			},
																			"libc.so.1`mutex_unlock_queue": {
																				"svUnique": 3,
																				"svTotal": 11,
																				"svChildren": {
																					"libc.so.1`clear_lockbyte": {
																						"svUnique": 7,
																						"svTotal": 7,
																						"svChildren": {}
																					},
																					"libc.so.1`sigon": {
																						"svUnique": 1,
																						"svTotal": 1,
																						"svChildren": {}
																					}
																				}
																			}
																		}
																	},
																	"libc.so.1`mutex_unlock_queue": {
																		"svUnique": 1,
																		"svTotal": 1,
																		"svChildren": {}
																	}
																}
															},
															"libc.so.1`mutex_lock": {
																"svUnique": 1,
																"svTotal": 1,
																"svChildren": {}
															},
															"libc.so.1`mutex_unlock": {
																"svUnique": 1,
																"svTotal": 1,
																"svChildren": {}
															},
															"libc.so.1`strstr": {
																"svUnique": 6,
																"svTotal": 6,
																"svChildren": {}
															},
															"redis-server`createObject": {
																"svUnique": 3,
																"svTotal": 49,
																"svChildren": {
																	"libc.so.1`malloc": {
																		"svUnique": 1,
																		"svTotal": 1,
																		"svChildren": {}
																	},
																	"redis-server`0x426270": {
																		"svUnique": 1,
																		"svTotal": 1,
																		"svChildren": {}
																	},
																	"redis-server`zmalloc": {
																		"svUnique": 3,
																		"svTotal": 44,
																		"svChildren": {
																			"libc.so.1`malloc": {
																				"svUnique": 2,
																				"svTotal": 41,
																				"svChildren": {
																					"libc.so.1`_malloc_unlocked": {
																						"svUnique": 1,
																						"svTotal": 8,
																						"svChildren": {
																							"libc.so.1`_smalloc": {
																								"svUnique": 4,
																								"svTotal": 4,
																								"svChildren": {}
																							},
																							"libc.so.1`cleanfree": {
																								"svUnique": 3,
																								"svTotal": 3,
																								"svChildren": {}
																							}
																						}
																					},
																					"libc.so.1`_smalloc": {
																						"svUnique": 2,
																						"svTotal": 2,
																						"svChildren": {}
																					},
																					"libc.so.1`cleanfree": {
																						"svUnique": 1,
																						"svTotal": 1,
																						"svChildren": {}
																					},
																					"libc.so.1`mutex_lock": {
																						"svUnique": 1,
																						"svTotal": 15,
																						"svChildren": {
																							"libc.so.1`mutex_lock_impl": {
																								"svUnique": 13,
																								"svTotal": 14,
																								"svChildren": {
																									"libc.so.1`sigon": {
																										"svUnique": 1,
																										"svTotal": 1,
																										"svChildren": {}
																									}
																								}
																							}
																						}
																					},
																					"libc.so.1`mutex_lock_impl": {
																						"svUnique": 1,
																						"svTotal": 1,
																						"svChildren": {}
																					},
																					"libc.so.1`mutex_unlock": {
																						"svUnique": 2,
																						"svTotal": 11,
																						"svChildren": {
																							"libc.so.1`mutex_unlock_queue": {
																								"svUnique": 0,
																								"svTotal": 8,
																								"svChildren": {
																									"libc.so.1`clear_lockbyte": {
																										"svUnique": 8,
																										"svTotal": 8,
																										"svChildren": {}
																									}
																								}
																							},
																							"libc.so.1`sigon": {
																								"svUnique": 1,
																								"svTotal": 1,
																								"svChildren": {}
																							}
																						}
																					},
																					"libc.so.1`mutex_unlock_queue": {
																						"svUnique": 1,
																						"svTotal": 1,
																						"svChildren": {}
																					}
																				}
																			}
																		}
																	}
																}
															},
															"redis-server`sdsrange": {
																"svUnique": 2,
																"svTotal": 2,
																"svChildren": {}
															},
															"redis-server`sdssplitlen": {
																"svUnique": 58,
																"svTotal": 186,
																"svChildren": {
																	"libc.so.1`malloc": {
																		"svUnique": 1,
																		"svTotal": 1,
																		"svChildren": {}
																	},
																	"libc.so.1`memcpy": {
																		"svUnique": 9,
																		"svTotal": 9,
																		"svChildren": {}
																	},
																	"redis-server`0x426270": {
																		"svUnique": 1,
																		"svTotal": 1,
																		"svChildren": {}
																	},
																	"redis-server`sdsnewlen": {
																		"svUnique": 6,
																		"svTotal": 47,
																		"svChildren": {
																			"redis-server`0x426270": {
																				"svUnique": 2,
																				"svTotal": 2,
																				"svChildren": {}
																			},
																			"redis-server`zmalloc": {
																				"svUnique": 4,
																				"svTotal": 39,
																				"svChildren": {
																					"libc.so.1`malloc": {
																						"svUnique": 4,
																						"svTotal": 34,
																						"svChildren": {
																							"libc.so.1`_malloc_unlocked": {
																								"svUnique": 1,
																								"svTotal": 9,
																								"svChildren": {
																									"libc.so.1`_smalloc": {
																										"svUnique": 4,
																										"svTotal": 4,
																										"svChildren": {}
																									},
																									"libc.so.1`cleanfree": {
																										"svUnique": 4,
																										"svTotal": 4,
																										"svChildren": {}
																									}
																								}
																							},
																							"libc.so.1`mutex_lock": {
																								"svUnique": 1,
																								"svTotal": 7,
																								"svChildren": {
																									"libc.so.1`mutex_lock_impl": {
																										"svUnique": 6,
																										"svTotal": 6,
																										"svChildren": {}
																									}
																								}
																							},
																							"libc.so.1`mutex_unlock": {
																								"svUnique": 4,
																								"svTotal": 13,
																								"svChildren": {
																									"libc.so.1`mutex_unlock_queue": {
																										"svUnique": 1,
																										"svTotal": 9,
																										"svChildren": {
																											"libc.so.1`clear_lockbyte": {
																												"svUnique": 7,
																												"svTotal": 7,
																												"svChildren": {}
																											},
																											"libc.so.1`sigon": {
																												"svUnique": 1,
																												"svTotal": 1,
																												"svChildren": {}
																											}
																										}
																									}
																								}
																							},
																							"libc.so.1`mutex_unlock_queue": {
																								"svUnique": 1,
																								"svTotal": 1,
																								"svChildren": {}
																							}
																						}
																					},
																					"libc.so.1`mutex_unlock": {
																						"svUnique": 1,
																						"svTotal": 1,
																						"svChildren": {}
																					}
																				}
																			}
																		}
																	},
																	"redis-server`zmalloc": {
																		"svUnique": 10,
																		"svTotal": 70,
																		"svChildren": {
																			"libc.so.1`malloc": {
																				"svUnique": 6,
																				"svTotal": 58,
																				"svChildren": {
																					"libc.so.1`_malloc_unlocked": {
																						"svUnique": 6,
																						"svTotal": 25,
																						"svChildren": {
																							"libc.so.1`_smalloc": {
																								"svUnique": 5,
																								"svTotal": 5,
																								"svChildren": {}
																							},
																							"libc.so.1`cleanfree": {
																								"svUnique": 3,
																								"svTotal": 12,
																								"svChildren": {
																									"libc.so.1`realfree": {
																										"svUnique": 9,
																										"svTotal": 9,
																										"svChildren": {}
																									}
																								}
																							},
																							"libc.so.1`realfree": {
																								"svUnique": 2,
																								"svTotal": 2,
																								"svChildren": {}
																							}
																						}
																					},
																					"libc.so.1`cleanfree": {
																						"svUnique": 1,
																						"svTotal": 1,
																						"svChildren": {}
																					},
																					"libc.so.1`mutex_lock": {
																						"svUnique": 0,
																						"svTotal": 10,
																						"svChildren": {
																							"libc.so.1`mutex_lock_impl": {
																								"svUnique": 10,
																								"svTotal": 10,
																								"svChildren": {}
																							}
																						}
																					},
																					"libc.so.1`mutex_lock_impl": {
																						"svUnique": 2,
																						"svTotal": 2,
																						"svChildren": {}
																					},
																					"libc.so.1`mutex_unlock": {
																						"svUnique": 3,
																						"svTotal": 13,
																						"svChildren": {
																							"libc.so.1`clear_lockbyte": {
																								"svUnique": 3,
																								"svTotal": 3,
																								"svChildren": {}
																							},
																							"libc.so.1`mutex_unlock_queue": {
																								"svUnique": 4,
																								"svTotal": 7,
																								"svChildren": {
																									"libc.so.1`clear_lockbyte": {
																										"svUnique": 3,
																										"svTotal": 3,
																										"svChildren": {}
																									}
																								}
																							}
																						}
																					},
																					"libc.so.1`mutex_unlock_queue": {
																						"svUnique": 1,
																						"svTotal": 1,
																						"svChildren": {}
																					}
																				}
																			},
																			"libc.so.1`mutex_lock": {
																				"svUnique": 1,
																				"svTotal": 1,
																				"svChildren": {}
																			},
																			"libc.so.1`mutex_unlock": {
																				"svUnique": 1,
																				"svTotal": 1,
																				"svChildren": {}
																			}
																		}
																	}
																}
															},
															"redis-server`zmalloc": {
																"svUnique": 14,
																"svTotal": 39,
																"svChildren": {
																	"libc.so.1`_malloc_unlocked": {
																		"svUnique": 1,
																		"svTotal": 1,
																		"svChildren": {}
																	},
																	"libc.so.1`malloc": {
																		"svUnique": 1,
																		"svTotal": 23,
																		"svChildren": {
																			"libc.so.1`_malloc_unlocked": {
																				"svUnique": 1,
																				"svTotal": 4,
																				"svChildren": {
																					"libc.so.1`_smalloc": {
																						"svUnique": 3,
																						"svTotal": 3,
																						"svChildren": {}
																					}
																				}
																			},
																			"libc.so.1`mutex_lock": {
																				"svUnique": 1,
																				"svTotal": 10,
																				"svChildren": {
																					"libc.so.1`mutex_lock_impl": {
																						"svUnique": 8,
																						"svTotal": 9,
																						"svChildren": {
																							"libc.so.1`sigon": {
																								"svUnique": 1,
																								"svTotal": 1,
																								"svChildren": {}
																							}
																						}
																					}
																				}
																			},
																			"libc.so.1`mutex_unlock": {
																				"svUnique": 0,
																				"svTotal": 8,
																				"svChildren": {
																					"libc.so.1`mutex_unlock_queue": {
																						"svUnique": 4,
																						"svTotal": 8,
																						"svChildren": {
																							"libc.so.1`clear_lockbyte": {
																								"svUnique": 3,
																								"svTotal": 3,
																								"svChildren": {}
																							},
																							"libc.so.1`sigon": {
																								"svUnique": 1,
																								"svTotal": 1,
																								"svChildren": {}
																							}
																						}
																					}
																				}
																			}
																		}
																	},
																	"libc.so.1`mutex_unlock": {
																		"svUnique": 1,
																		"svTotal": 1,
																		"svChildren": {}
																	}
																}
															}
														}
													},
													"redis-server`resetClient": {
														"svUnique": 4,
														"svTotal": 64,
														"svChildren": {
															"libc.so.1`_free_unlocked": {
																"svUnique": 1,
																"svTotal": 1,
																"svChildren": {}
															},
															"libc.so.1`free": {
																"svUnique": 0,
																"svTotal": 16,
																"svChildren": {
																	"libc.so.1`_free_unlocked": {
																		"svUnique": 1,
																		"svTotal": 1,
																		"svChildren": {}
																	},
																	"libc.so.1`mutex_lock": {
																		"svUnique": 0,
																		"svTotal": 2,
																		"svChildren": {
																			"libc.so.1`mutex_lock_impl": {
																				"svUnique": 2,
																				"svTotal": 2,
																				"svChildren": {}
																			}
																		}
																	},
																	"libc.so.1`mutex_unlock": {
																		"svUnique": 3,
																		"svTotal": 13,
																		"svChildren": {
																			"libc.so.1`mutex_unlock_queue": {
																				"svUnique": 3,
																				"svTotal": 10,
																				"svChildren": {
																					"libc.so.1`clear_lockbyte": {
																						"svUnique": 6,
																						"svTotal": 6,
																						"svChildren": {}
																					},
																					"libc.so.1`sigon": {
																						"svUnique": 1,
																						"svTotal": 1,
																						"svChildren": {}
																					}
																				}
																			}
																		}
																	}
																}
															},
															"libc.so.1`mutex_unlock": {
																"svUnique": 2,
																"svTotal": 2,
																"svChildren": {}
															},
															"redis-server`decrRefCount": {
																"svUnique": 3,
																"svTotal": 27,
																"svChildren": {
																	"libc.so.1`free": {
																		"svUnique": 4,
																		"svTotal": 23,
																		"svChildren": {
																			"libc.so.1`mutex_lock": {
																				"svUnique": 1,
																				"svTotal": 9,
																				"svChildren": {
																					"libc.so.1`mutex_lock_impl": {
																						"svUnique": 7,
																						"svTotal": 8,
																						"svChildren": {
																							"libc.so.1`sigon": {
																								"svUnique": 1,
																								"svTotal": 1,
																								"svChildren": {}
																							}
																						}
																					}
																				}
																			},
																			"libc.so.1`mutex_lock_impl": {
																				"svUnique": 1,
																				"svTotal": 1,
																				"svChildren": {}
																			},
																			"libc.so.1`mutex_unlock": {
																				"svUnique": 3,
																				"svTotal": 8,
																				"svChildren": {
																					"libc.so.1`mutex_unlock_queue": {
																						"svUnique": 2,
																						"svTotal": 5,
																						"svChildren": {
																							"libc.so.1`clear_lockbyte": {
																								"svUnique": 2,
																								"svTotal": 2,
																								"svChildren": {}
																							},
																							"libc.so.1`sigon": {
																								"svUnique": 1,
																								"svTotal": 1,
																								"svChildren": {}
																							}
																						}
																					}
																				}
																			},
																			"libc.so.1`mutex_unlock_queue": {
																				"svUnique": 1,
																				"svTotal": 1,
																				"svChildren": {}
																			}
																		}
																	},
																	"libc.so.1`mutex_unlock": {
																		"svUnique": 1,
																		"svTotal": 1,
																		"svChildren": {}
																	}
																}
															},
															"redis-server`freeStringObject": {
																"svUnique": 3,
																"svTotal": 3,
																"svChildren": {}
															},
															"redis-server`sdsfree": {
																"svUnique": 1,
																"svTotal": 1,
																"svChildren": {}
															},
															"redis-server`zfree": {
																"svUnique": 10,
																"svTotal": 10,
																"svChildren": {}
															}
														}
													},
													"redis-server`sdssplitlen": {
														"svUnique": 2,
														"svTotal": 2,
														"svChildren": {}
													},
													"redis-server`zfree": {
														"svUnique": 25,
														"svTotal": 25,
														"svChildren": {}
													},
													"redis-server`zmalloc": {
														"svUnique": 2,
														"svTotal": 2,
														"svChildren": {}
													}
												}
											},
											"redis-server`resetClient": {
												"svUnique": 2,
												"svTotal": 2,
												"svChildren": {}
											},
											"redis-server`sdsMakeRoomFor": {
												"svUnique": 1,
												"svTotal": 13,
												"svChildren": {
													"redis-server`zrealloc": {
														"svUnique": 0,
														"svTotal": 12,
														"svChildren": {
															"libc.so.1`realloc": {
																"svUnique": 1,
																"svTotal": 12,
																"svChildren": {
																	"libc.so.1`_free_unlocked": {
																		"svUnique": 1,
																		"svTotal": 1,
																		"svChildren": {}
																	},
																	"libc.so.1`_malloc_unlocked": {
																		"svUnique": 4,
																		"svTotal": 6,
																		"svChildren": {
																			"libc.so.1`cleanfree": {
																				"svUnique": 1,
																				"svTotal": 1,
																				"svChildren": {}
																			},
																			"libc.so.1`realfree": {
																				"svUnique": 1,
																				"svTotal": 1,
																				"svChildren": {}
																			}
																		}
																	},
																	"libc.so.1`cleanfree": {
																		"svUnique": 0,
																		"svTotal": 1,
																		"svChildren": {
																			"libc.so.1`realfree": {
																				"svUnique": 1,
																				"svTotal": 1,
																				"svChildren": {}
																			}
																		}
																	},
																	"libc.so.1`mutex_unlock": {
																		"svUnique": 1,
																		"svTotal": 3,
																		"svChildren": {
																			"libc.so.1`mutex_unlock_queue": {
																				"svUnique": 1,
																				"svTotal": 2,
																				"svChildren": {
																					"libc.so.1`clear_lockbyte": {
																						"svUnique": 1,
																						"svTotal": 1,
																						"svChildren": {}
																					}
																				}
																			}
																		}
																	}
																}
															}
														}
													}
												}
											}
										}
									},
									"redis-server`redisLog": {
										"svUnique": 2,
										"svTotal": 2,
										"svChildren": {}
									},
									"redis-server`sdsIncrLen": {
										"svUnique": 1,
										"svTotal": 1,
										"svChildren": {}
									},
									"redis-server`sdsfree": {
										"svUnique": 1,
										"svTotal": 1,
										"svChildren": {}
									},
									"redis-server`sendReplyToClient": {
										"svUnique": 72,
										"svTotal": 218,
										"svChildren": {
											"libc.so.1`__time": {
												"svUnique": 9,
												"svTotal": 9,
												"svChildren": {}
											},
											"libc.so.1`__write": {
												"svUnique": 14,
												"svTotal": 14,
												"svChildren": {}
											},
											"libc.so.1`time": {
												"svUnique": 1,
												"svTotal": 1,
												"svChildren": {}
											},
											"libc.so.1`write": {
												"svUnique": 12,
												"svTotal": 12,
												"svChildren": {}
											},
											"redis-server`aeDeleteFileEvent": {
												"svUnique": 110,
												"svTotal": 110,
												"svChildren": {}
											}
										}
									},
									"redis-server`serverCron": {
										"svUnique": 0,
										"svTotal": 8,
										"svChildren": {
											"redis-server`activeExpireCycle": {
												"svUnique": 0,
												"svTotal": 4,
												"svChildren": {
													"redis-server`mstime": {
														"svUnique": 0,
														"svTotal": 4,
														"svChildren": {
															"libc.so.1`gettimeofday": {
																"svUnique": 4,
																"svTotal": 4,
																"svChildren": {}
															}
														}
													}
												}
											},
											"redis-server`clientsCron": {
												"svUnique": 0,
												"svTotal": 4,
												"svChildren": {
													"redis-server`clientsCronResizeQueryBuffer": {
														"svUnique": 1,
														"svTotal": 2,
														"svChildren": {
															"redis-server`sdsRemoveFreeSpace": {
																"svUnique": 0,
																"svTotal": 1,
																"svChildren": {
																	"redis-server`zrealloc": {
																		"svUnique": 0,
																		"svTotal": 1,
																		"svChildren": {
																			"libc.so.1`realloc": {
																				"svUnique": 0,
																				"svTotal": 1,
																				"svChildren": {
																					"libc.so.1`_malloc_unlocked": {
																						"svUnique": 0,
																						"svTotal": 1,
																						"svChildren": {
																							"libc.so.1`_smalloc": {
																								"svUnique": 1,
																								"svTotal": 1,
																								"svChildren": {}
																							}
																						}
																					}
																				}
																			}
																		}
																	}
																}
															}
														}
													},
													"redis-server`sdsAllocSize": {
														"svUnique": 2,
														"svTotal": 2,
														"svChildren": {}
													}
												}
											}
										}
									},
									"redis-server`zfree": {
										"svUnique": 3,
										"svTotal": 3,
										"svChildren": {}
									}
								}
							},
							"redis-server`beforeSleep": {
								"svUnique": 1,
								"svTotal": 1,
								"svChildren": {}
							},
							"redis-server`flushAppendOnlyFile": {
								"svUnique": 1,
								"svTotal": 1,
								"svChildren": {}
							},
							"redis-server`freeClient": {
								"svUnique": 1,
								"svTotal": 1,
								"svChildren": {}
							},
							"redis-server`readQueryFromClient": {
								"svUnique": 1,
								"svTotal": 1,
								"svChildren": {}
							}
						}
					},
					"redis-server`flushAppendOnlyFile": {
						"svUnique": 2,
						"svTotal": 2,
						"svChildren": {}
					}
				}
			}
		}
	}
};
/* END JSSTYLED */
