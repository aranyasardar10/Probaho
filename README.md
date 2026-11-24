# প্রবাহ · Probaho

**A small programming language you write in Bangla.** Keywords, numbers, variable names and error messages work in Bangla, with English aliases if you prefer. Run programs in the browser playground or with the Node.js command-line runner.

## Features

- Bangla and English keywords, Bangla digits and identifiers
- Variables, conditionals, loops, functions, closures, recursion, lists and strings
- Classes, object instances, constructors, methods, and private fields/methods
- Interactive playground with syntax highlighting, shareable links and bilingual errors
- Loop and recursion limits to keep programs from running away
- Pure JavaScript, no runtime dependencies; Node.js 18+

## Run it

```bash
npm test
node run.js examples/fizzbuzz.pb
npm start
```

The playground is served at `http://localhost:8000`. Set `PORT` to use another port. Do not open `index.html` directly; it uses ES modules.

See [docs/LANGUAGE.md](docs/LANGUAGE.md) for the language syntax and classes guide. Programs in `examples/` have matching `.expected` output fixtures, checked by the test suite.
