/*
 * lib/xml.js: XML utility routines
 */

var mod_assert = require('assert');

exports.XmlEmitter = XmlEmitter;

/*
 * Basic interface for emitting well-formed XML. This isn't bulletproof, but it
 * does escape values (not tags or keys) and checks for basic errors.
 */
function XmlEmitter(stream)
{
	this.xe_stream = stream;
	this.xe_stack = [];
}

XmlEmitter.prototype.emitDoctype = function (name, type, path)
{
	this.xe_stream.write('<?xml version="1.0"?>\n');
	this.xe_stream.write('<!DOCTYPE ' + name + ' ' + type + ' "' +
	    path + '">\n');
};

XmlEmitter.prototype.escape = function (str)
{
	/* BEGIN JSSTYLED */
	return (str.toString().replace(/&/g, '&amp;').
	    replace(/</g, '&lt;').
	    replace(/>/g, '&gt;').
	    replace(/"/g, '&quot;'));
	/* END JSSTYLED */
};

XmlEmitter.prototype.emitIndent = function ()
{
	var str = '';
	var i;

	for (i = 0; i < this.xe_stack.length; i++)
		str += '    ';

	this.xe_stream.write(str);
};

XmlEmitter.prototype.emitEmpty = function (name, attrs)
{
	this.emitIndent();
	this.xe_stream.write('<' + name + ' ');
	this.emitAttrs(attrs);
	this.xe_stream.write('/>\n');
};

XmlEmitter.prototype.emitAttrs = function (attrs)
{
	var key;

	if (!attrs)
		return;

	for (key in attrs)
		this.xe_stream.write(key + '=\"' +
		    this.escape(attrs[key]) + '\" ');
};

XmlEmitter.prototype.emitStart = function (name, attrs, opts)
{
	this.emitIndent();
	this.xe_stack.push(name);

	this.xe_stream.write('<' + name + ' ');
	this.emitAttrs(attrs);
	this.xe_stream.write('>');

	if (!opts || !opts['bare'])
		this.xe_stream.write('\n');
};

XmlEmitter.prototype.emitEnd = function (name, opts)
{
	var check = this.xe_stack.pop();

	mod_assert.equal(name, check);

	if (!opts || !opts['bare'])
		this.emitIndent();

	this.xe_stream.write('</' + name + '>\n');
};

XmlEmitter.prototype.emitCData = function (data)
{
	this.xe_stream.write(this.escape(data));
};

XmlEmitter.prototype.emitComment = function (content)
{
	this.xe_stream.write('<!-- ' + content + ' -->\n');
};
