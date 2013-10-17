# node-stackvis

Stackvis is a JavaScript library for visualizing call stacks.  For an example of
the kind of data we're talking about, see
http://us-east.manta.joyent.com/dap/public/stackvis/example.htm.  This approach
(and the code for the SVG-based flamegraph) is based heavily on Brendan Gregg's
[FlameGraph](http://github.com/brendangregg/FlameGraph/) tools.


## Command-line tools

The typical pattern is to profile some program with DTrace for, say, 30 seconds:

    # dtrace -n 'profile-97/pid == $YOURPID/{ @[ustack()] = count(); }' -c "sleep 30" > dtrace.out

If you're tracing something like Node.js that has a ustack helper, you'll want
to use jstack() instead:

    # dtrace -n 'profile-97/pid == $YOURPID/{ @[jstack(80, 8192)] = count(); }' -c "sleep 30" > dtrace.out

Then create a flamegraph file from the profile output, specifying "dtrace" as
the input format and the kind of flamegraph as the output.  This example uses a
D3-based visualization, which spits out a completely self-contained HTML file:

    # stackvis dtrace flamegraph-d3 < dtrace.out > flamegraph.htm

If you have a Joyent account, you can use "stackvis share" to upload the file to
Manta and get a permalink for sharing with other people:

    # stackvis share flamegraph.htm 
    https://us-east.manta.joyent.com/dap/public/stackvis/298c9ae2-aec8-4993-8bc9-d621dcdbeb71/index.htm

This just puts the object to a unique name in your public Manta directory.  You
can obviously remove it or rename it as you want.

### Other tools

This module also provides "stackcollapse", and "flamegraph", which are
essentially direct ports of the original FlameGraph tools.  You can use them by
first collecting data as above, then collapse common stacks:

    # stackcollapse < dtrace.out > collapsed.out

then create a flame graph:

    # flamegraph < collapsed.out > graph.svg

You can share these with "stackvis share" as well.  This approach is a little
more verbose, but lets you do things like filter out certain function names
(using grep).


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
- output-flamegraph-d3.js: writes stacks as a flame graph HTML file using D3

Client code shouldn't load these directly.  Instead, require 'stackvis' and use
lookupReader and lookupWriter:
```javascript
var mod_stackvis = require('stackvis');
var dtrace_reader = mod_stackvis.readerLookup('dtrace');
var collapsed_writer = mod_stackvis.writerLookup('collapsed');
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
