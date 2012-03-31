# node-stackvis

Stackvis is a JavaScript library for visualizing call stacks.  For an example
of the kind of data we're talking about, see:

    http://www.cs.brown.edu/~dap/agg-flamegraph.svg

but this was not generated using this library.  This is based heavily on
Brendan Gregg's work on
[FlameGraph](http://github.com/brendangregg/FlameGraph/)

The intended workflow is:

- collect data (currently using DTrace, but support for other tools can be added too)
- parse data into an intermediate format that allows for relatively simple
  transformations
- emit visualizations for given representations.
