/*
 * lib/input-instana.js: reads IBM Instana traces
 */

var mod_util = require('util');
var mod_events = require('events');

exports.reader = InstanaStreamReader;

function aggregateValues(reader, arr) {
    const valueMap = new Map();

    arr.forEach(obj => {
        if (valueMap.has(obj.stack)) {
            valueMap.set(obj.stack, valueMap.get(obj.stack) + obj.duration);
        } else {
            valueMap.set(obj.stack, obj.duration);
        }
    });

    valueMap.forEach((sum, stack) => {
        reader.emit('stack', stack, sum);
    });
}

function collapseTrace(reader, trace) {
    const spanMap = new Map();
    trace.items.forEach((span) => {
        spanMap.set(span.id, getSpanInfo(span));
    });

    spanMap.forEach((span) => {
        if (span.parentId !== null) {
            let parent = spanMap.get(span.parentId);
            if (typeof parent !== "undefined") {
                parent.children.push(span);
                spanMap.set(span.parentId, parent);
            }
        }
    });

    let queue = [];
    spanMap.forEach((span) => {
        if (span.parentId === null) {
            queue.push({
                span: span,
                prefix: []
            });
        }
    });

    let result = [];
    while (queue.length > 0) {
        let current = queue.shift();
        result.push({
            stack: current.prefix.concat(current.span).map((e) => { return getSpanLabel(e) }),
            duration: current.span.duration
        });
        current.span.children.forEach((c) => {
            queue.push({
                span: c,
                prefix: current.prefix.concat(current.span)
            })
        });
    }

    aggregateValues(reader, result)
}

function getSpanInfo(span) {
    return {
        id: span.id,
        parentId: span.parentId,
        name: span.name,
        duration: span.duration,
        children: [],
    };
}

function getSpanLabel(span) {
    if (Object.hasOwn(span, "name")) {
        return span.name.replace(/ /g, "_");
    } else {
        return span.id;
    }
}

function InstanaStreamReader(input, log) {
    var reader = this;

    const chunks = [];

    input.on("data", function(chunk) {
        chunks.push(chunk);
    });

    input.on("end", function() {
        const trace = JSON.parse(Buffer.concat(chunks));
        collapseTrace(reader, trace);
        reader.emit('end');
    });
}

mod_util.inherits(InstanaStreamReader, mod_events.EventEmitter);
