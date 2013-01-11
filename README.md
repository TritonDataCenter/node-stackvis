# node-stackvis

Stackvis is a JavaScript library for visualizing call stacks.  For an example
of the kind of data we're talking about, see:

    http://www.cs.brown.edu/~dap/redis-flamegraph.svg

This library is based heavily on Brendan Gregg's
[FlameGraph](http://github.com/brendangregg/FlameGraph/) tools.


## Command-line tools

This module provides "stackcollapse", and "flamegraph", which are essentially
direct ports of the original FlameGraph tools.  You can use them by first
collecting data:

    # dtrace -o dtrace.out -n 'profile-97{ @[ustack()] = count(); }' \
                           -n 'tick-30s{ exit(0); }'

then collapse common stacks:

    # stackcollapse < dtrace.out > collapsed.out

then create a flame graph:

    # flamegraph < collapsed.out > graph.svg

See the above link for an example.


## API

The command-line tools are thin wrappers around the API, which is built upon a
simple internal representation of stack traces and a bunch of Readers
(lib/input-\*.json) and Writers (lib/output-\*.json) for various intermediate
formats:

- input-dtrace.js: reads stacks from the output of a DTrace profiling script
- input-collapsed.js: reads data in the form used by the "stackcollapse" tool,
  where function offsets are stripped out, common stacks are collapsed, and
  there's one stack per line.
- output-collapsed.js: writes stacks in above "collapsed" form
- output-flamegraph-svg.js: writes stacks as a flame graph SVG

Client code shouldn't load these directly.  Instead, require 'stackvis' and use
lookupReader and lookupWriter:
```javascript
    var mod_stackvis = require('stackvis');
    var dtrace_reader = mod_stackvis.lookupReader('dtrace')
    var collapsed_writer = mod_stackvis.lookupWriter('collapsed');
```
The main operation is translating from one representation to another (e.g.,
DTrace output to a flame graph) using pipeStacks() (which requires a Bunyan
logger):
```javascript
    var mod_bunyan = require('bunyan');
    var log = new mod_bunyan({ 'name': 'mytool', 'stream': process.stderr });
    mod_stackvis.pipeStacks(log, process.stdin, dtrace_reader, collapsed_writer,
        process.stdout, function () { console.error('translation finished'); });
```
This example instantiates a new dtrace_reader to read DTrace output from
process.stdin and then emits the result in collapsed form to process.stdout
through the collapsed_writer.

## Adding new readers and writers

It's easy to add new readers (for new input sources) and writers (for new types
of visualizations).  See lib/stackvis.js for an overview of how these interfaces
work.

## TODO

- See about dealing with multiple "silos" of a single flame graph that are
  essentially the same, but differ in exactly one frame.
- Experiment with flame graph coloring.  Current options include random,
  gradient, and time-based.  Another possibility is to use hue to denote the
  module and saturation to denote the size of a frame relative to others at the
  same level of depth.
- Experiment with more interactive visualizations, like
  http://bl.ocks.org/1005873
