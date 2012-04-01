# node-stackvis

Stackvis is a JavaScript library for visualizing call stacks.  For an example
of the kind of data we're talking about, see:

    http://www.cs.brown.edu/~dap/redis-flamegraph.svg

This library is based heavily on Brendan Gregg's
[FlameGraph](http://github.com/brendangregg/FlameGraph/) tools.

The intended workflow is:

- collect data (currently using DTrace, but support for other tools can be added too)
- parse data into an intermediate format that allows for relatively simple
  transformations
- emit visualizations for given representations.

## TODO

- Flesh out this README with descriptions of commands and modules.
- See about dealing with multiple "silos" of a single flame graph that are
  essentially the same, but differ in exactly one frame.
- Experiment with flame graph coloring.  Current options include random,
  gradient, and time-based.  Another possibility is to use hue to denote the
  module and saturation to denote the size of a frame relative to others at the
  same level of depth.
- Tweak saturation for the existing time-based coloring: currently, the
  saturation is determined by looking at (nsamples in frame) / (total samples),
  but it would be better if it were (nsamples in frame) / (nsamples in row), as
  this would cause different entries in the same row to stand out better.
- Experiment with more interactive visualizations, such as:

    http://bl.ocks.org/1005873
