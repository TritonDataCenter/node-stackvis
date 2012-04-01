/*
 * lib/color.js: color utility functions
 */

var mod_assert = require('assert');

/*
 * Convert from HSV to RGB.  Ported from the Java implementation by Eugene
 * Vishnevsky:
 *
 *   http://www.cs.rit.edu/~ncs/color/t_convert.html
 */
exports.convertHsvToRgb = function convertHsvToRgb(h, s, v)
{
	var r, g, b;
	var i;
	var f, p, q, t;

	mod_assert.ok(h >= 0 && h <= 360, 'hue (' + h + ') out of range');
	mod_assert.ok(s >= 0 && s <= 1, 'saturation (' + s + ') out of range');
	mod_assert.ok(v >= 0 && v <= 1, 'value (' + v + ') out of range');

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
};
