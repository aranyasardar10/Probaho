// A scope: a table of variables plus a link to the enclosing scope.
export class Environment {
  constructor(parent = null, { readonly = false } = {}) {
    this.vars = new Map();
    this.parent = parent;
    this.readonly = readonly;
    // Class access is lexical: nested functions in a method inherit it, while
    // unrelated functions called by that method do not.
    this.classContext = parent?.classContext ?? null;
  }
  has(name) { return this.vars.has(name); }
  define(name, value) { this.vars.set(name, value); }
  set(name, value) { this.vars.set(name, value); }
  lookup(name) {
    for (let e = this; e; e = e.parent) if (e.vars.has(name)) return e;
    return null;
  }
  get(name) {
    const owner = this.lookup(name);
    return owner ? owner.vars.get(name) : undefined;
  }
}
