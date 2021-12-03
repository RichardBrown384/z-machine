# Z-Machine

A Z-Machine Version 3 implementation in JavaScript.

## About

An implementation of the Version 3 Z-Machine written over a long weekend.
It's a little rough around the edges and missing a few features.

Usage

```bash
npm install
npm run z-machine storyfile.z3
```

## Notes

### Unimplemented opcodes

A small number of opcodes aren't implemented

 - not
 - pop
 - save
 - restore
 - restart
 - showStatus
 - splitWindow
 - setWindow
 - outputStream
 - inputStream
 - soundEffect

As a consequence, it isn't possible to save, load or restart a game.

### Random numbers

The random number implementation is definitely lacking and doesn't behave correctly.

## References

1. [The Z-Machine standard][standard]

---

[standard]: http://inform-fiction.org/zmachine/standards/z1point1/index.html
