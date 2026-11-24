import { ProbahoError } from './errors.js';
import { Environment } from './environment.js';
import { builtins } from './builtins.js';
import { format, isTruthy, equals, typeName, bn, graphemes } from './values.js';

class BreakSignal {}
class ContinueSignal {}
class ReturnSignal { constructor(value) { this.value = value; } }
const MAX_CALL_DEPTH = 1000;
const fail = (node, messageBn, messageEn) => { throw new ProbahoError(messageBn, messageEn, node.line, node.col); };
const isCallable = (v) => v !== null && typeof v === 'object' && !Array.isArray(v) && (v.kind === 'function' || v.kind === 'builtin');

export class Interpreter {
  constructor({ print = console.log, maxSteps = 1_000_000, banglaDigits = false } = {}) {
    this.print = print; this.banglaDigits = banglaDigits; this.maxSteps = maxSteps;
    this.steps = 0; this.callDepth = 0; this.loopDepth = 0; this.funcDepth = 0;
    this.root = new Environment(null, { readonly: true });
    for (const [name, fn] of Object.entries(builtins)) this.root.define(name, fn);
    this.globals = new Environment(this.root);
  }
  run(program) {
    try { for (const stmt of program.body) this.exec(stmt, this.globals); }
    catch (e) {
      if (e instanceof RangeError) throw new ProbahoError('রিকার্শন অনেক গভীর হয়ে গেছে', 'recursion went too deep', 1, 1);
      throw e;
    }
  }
  tick(node) {
    if (++this.steps > this.maxSteps) fail(node, 'প্রোগ্রাম অনেক বেশি সময় নিচ্ছে, অসীম লুপ নয় তো?', 'program ran too long, is there an infinite loop?');
  }
  execBlock(block, env) { const scope = new Environment(env); for (const stmt of block.body) this.exec(stmt, scope); }
  declare(node, env, name, value) {
    if (env.has(name)) fail(node, `'${name}' নামটি এই জায়গায় আগেই ব্যবহার করা হয়েছে`, `'${name}' is already defined in this scope`);
    env.define(name, value);
  }
  exec(node, env) {
    switch (node.type) {
      case 'ExprStmt': this.eval(node.expr, env); return;
      case 'Let': this.declare(node, env, node.name, this.eval(node.value, env)); return;
      case 'Class': this.defineClass(node, env); return;
      case 'Assign': {
        const value = this.eval(node.value, env), target = node.target;
        if (target.type === 'Identifier') {
          const owner = env.lookup(target.name);
          if (!owner) this.undefinedVariable(target);
          if (owner.readonly) fail(target, `'${target.name}' বিল্ট-ইন ফাংশন, এটি বদলানো যায় না`, `'${target.name}' is a built-in function and cannot be changed`);
          owner.set(target.name, value);
        } else if (target.type === 'Index') {
          const container = this.eval(target.object, env), index = this.eval(target.index, env);
          if (typeof container === 'string') fail(target, 'লেখার ভেতরের অক্ষর বদলানো যায় না', 'strings cannot be changed in place');
          this.checkIndex(target, container, index); container[index] = value;
        } else this.setMember(target, env, value);
        return;
      }
      case 'Print': this.print(node.args.map((a) => format(this.eval(a, env), false, this.banglaDigits)).join(' ')); return;
      case 'If':
        if (isTruthy(this.eval(node.test, env))) this.execBlock(node.then, env);
        else if (node.otherwise) node.otherwise.type === 'If' ? this.exec(node.otherwise, env) : this.execBlock(node.otherwise, env);
        return;
      case 'While':
        this.loopDepth++;
        try { while (isTruthy(this.eval(node.test, env))) {
          this.tick(node);
          try { this.execBlock(node.body, env); }
          catch (signal) { if (signal instanceof BreakSignal) break; if (signal instanceof ContinueSignal) continue; throw signal; }
        } } finally { this.loopDepth--; }
        return;
      case 'Function':
        this.declare(node, env, node.name, { kind: 'function', name: node.name, params: node.params, body: node.body, closure: env, classContext: env.classContext ?? null });
        return;
      case 'Return':
        if (this.funcDepth === 0) fail(node, "'ফেরত' শুধু ফাংশনের ভেতরে ব্যবহার করা যায়", "'return' can only be used inside a function");
        throw new ReturnSignal(node.value ? this.eval(node.value, env) : null);
      case 'Break': if (this.loopDepth === 0) fail(node, "'থামো' শুধু লুপের ভেতরে ব্যবহার করা যায়", "'break' can only be used inside a loop"); throw new BreakSignal();
      case 'Continue': if (this.loopDepth === 0) fail(node, "'পরেরটা' শুধু লুপের ভেতরে ব্যবহার করা যায়", "'continue' can only be used inside a loop"); throw new ContinueSignal();
      case 'Block': this.execBlock(node, env); return;
      default: fail(node, `অজানা স্টেটমেন্ট ${node.type}`, `unknown statement ${node.type}`);
    }
  }
  defineClass(node, env) {
    const members = new Set();
    for (const m of [...node.fields, ...node.methods]) {
      if (members.has(m.name)) fail(m, `'${m.name}' শ্রেণিতে আগেই সদস্য হিসেবে আছে`, `'${m.name}' is already a member of this class`);
      members.add(m.name);
    }
    const klass = { kind: 'class', name: node.name, fields: node.fields, methods: new Map(), closure: env };
    for (const m of node.methods) klass.methods.set(m.name, { kind: 'function', name: m.name, params: m.params, body: m.body, closure: env, classContext: klass, private: m.private });
    this.declare(node, env, node.name, klass);
  }
  undefinedVariable(node) { fail(node, `'${node.name}' নামে কোনো ভেরিয়েবল পাওয়া যায়নি`, `variable '${node.name}' is not defined`); }
  eval(node, env) {
    switch (node.type) {
      case 'Number': case 'String': case 'Bool': return node.value;
      case 'Nothing': return null;
      case 'Identifier': {
        const owner = env.lookup(node.name); if (!owner) this.undefinedVariable(node); return owner.vars.get(node.name);
      }
      case 'This': {
        const owner = env.lookup('this');
        if (!owner) fail(node, "'এই' শুধু শ্রেণির মেথডের ভেতরে ব্যবহার করা যায়", "'this' can only be used inside a class method");
        return owner.vars.get('this');
      }
      case 'List': return node.elements.map((e) => this.eval(e, env));
      case 'Unary': {
        const v = this.eval(node.arg, env);
        if (node.op === 'not') return !isTruthy(v);
        if (typeof v !== 'number') { const [tb, te] = typeName(v); fail(node, `${tb} এর আগে '-' বসানো যায় না`, `cannot negate a ${te}`); }
        return -v;
      }
      case 'Logical': {
        const left = this.eval(node.left, env);
        if (node.op === 'or') return isTruthy(left) ? left : this.eval(node.right, env);
        return !isTruthy(left) ? left : this.eval(node.right, env);
      }
      case 'Binary': return this.binary(node, this.eval(node.left, env), this.eval(node.right, env));
      case 'Index': {
        const container = this.eval(node.object, env), index = this.eval(node.index, env);
        this.checkIndex(node, container, index); return typeof container === 'string' ? graphemes(container)[index] : container[index];
      }
      case 'Member': return this.getMember(node, env);
      case 'New': return this.instantiate(node, env);
      case 'Call': {
        const callee = this.eval(node.callee, env), args = node.args.map((a) => this.eval(a, env));
        if (callee?.kind === 'class') fail(node, `শ্রেণি তৈরি করতে 'নতুন ${callee.name}' লিখুন`, `use 'new ${callee.name}' to create an instance`);
        if (!isCallable(callee)) { const [tb, te] = typeName(callee); fail(node, `${tb} কে ফাংশনের মতো ডাকা যায় না`, `a ${te} is not a function`); }
        return this.callFunction(callee, args, node);
      }
      default: fail(node, `অজানা এক্সপ্রেশন ${node.type}`, `unknown expression ${node.type}`);
    }
  }
  instantiate(node, env) {
    const owner = env.lookup(node.name);
    if (!owner) this.undefinedVariable({ ...node, name: node.name });
    const klass = owner.vars.get(node.name);
    if (klass?.kind !== 'class') fail(node, `'${node.name}' কোনো শ্রেণি নয়`, `'${node.name}' is not a class`);
    const instance = { kind: 'instance', klass, fields: new Map() };
    for (const field of klass.fields) instance.fields.set(field.name, null);
    const init = klass.methods.get('শুরু') ?? klass.methods.get('init');
    if (!init && node.args.length) fail(node, `এই শ্রেণিতে 'শুরু' মেথড নেই`, `class has no 'init' constructor`);
    const initScope = new Environment(klass.closure);
    initScope.classContext = klass;
    initScope.define('this', instance);
    for (const field of klass.fields) instance.fields.set(field.name, this.eval(field.value, initScope));
    if (init) this.callFunction({ ...init, boundThis: instance, classContext: klass }, node.args.map((a) => this.eval(a, env)), node);
    return instance;
  }
  getMember(node, env) {
    const object = this.eval(node.object, env);
    if (!object || object.kind !== 'instance') {
      const [tb, te] = typeName(object);
      fail(node, `${tb} এর কোনো সদস্য নেই`, `${te} has no members`);
    }
    const field = object.klass.fields.find((f) => f.name === node.name);
    if (field) {
      this.checkPrivate(node, object, field.private, env);
      return object.fields.get(node.name);
    }
    const method = object.klass.methods.get(node.name);
    if (method) {
      this.checkPrivate(node, object, method.private, env);
      return { ...method, boundThis: object, classContext: object.klass };
    }
    fail(node, `'${node.name}' নামে কোনো সদস্য নেই`, `no member '${node.name}'`);
  }
  setMember(node, env, value) {
    const object = this.eval(node.object, env);
    if (!object || object.kind !== 'instance') {
      const [tb, te] = typeName(object); fail(node, `${tb} এর কোনো সদস্য নেই`, `${te} has no members`);
    }
    const field = object.klass.fields.find((f) => f.name === node.name);
    if (field) { this.checkPrivate(node, object, field.private, env); object.fields.set(node.name, value); return; }
    if (object.klass.methods.has(node.name)) fail(node, 'মেথড বদলানো যায় না', 'a method cannot be reassigned');
    fail(node, `'${node.name}' নামে কোনো ক্ষেত্র নেই`, `no field '${node.name}'`);
  }
  checkPrivate(node, object, isPrivate, env) {
    if (isPrivate && env.classContext !== object.klass) fail(node, 'এই ব্যক্তিগত সদস্য শ্রেণির বাইরে ব্যবহার করা যায় না', 'cannot access a private member outside its class');
  }
  checkIndex(node, container, index) {
    if (!Array.isArray(container) && typeof container !== 'string') { const [tb, te] = typeName(container); fail(node, `${tb} এর ঘর ধরা যায় না, শুধু তালিকা বা লেখায় যায়`, `cannot index a ${te}`); }
    if (typeof index !== 'number' || !Number.isInteger(index)) fail(node, 'ঘরের নম্বর পূর্ণসংখ্যা হতে হবে', 'the index must be a whole number');
    const length = typeof container === 'string' ? graphemes(container).length : container.length;
    if (index < 0 || index >= length) fail(node, `ঘর নম্বর ${bn(index)} নেই, এখানে ${bn(length)}টি ঘর আছে (০ থেকে শুরু)`, `index ${index} is out of range, there are ${length} items (starting at 0)`);
  }
  binary(node, l, r) {
    const op = node.op, bothNumbers = typeof l === 'number' && typeof r === 'number', bothStrings = typeof l === 'string' && typeof r === 'string';
    const typeError = () => {
      const [lb, le] = typeName(l), [rb, re] = typeName(r);
      const hintBn = op === '+' && !bothStrings && (typeof l === 'string' || typeof r === 'string') ? ' (লেখা() দিয়ে বদলে নিন)' : '';
      const hintEn = hintBn ? ' (use লেখা(x) to convert to a string)' : '';
      fail(node, `${lb} আর ${rb} এর মধ্যে '${op}' চলে না${hintBn}`, `cannot use '${op}' on a ${le} and a ${re}${hintEn}`);
    };
    switch (op) {
      case '+': if (bothNumbers) return l + r; if (bothStrings) return l + r; if (Array.isArray(l) && Array.isArray(r)) return [...l, ...r]; return typeError();
      case '-': return bothNumbers ? l - r : typeError();
      case '*': return bothNumbers ? l * r : typeError();
      case '/': if (!bothNumbers) return typeError(); if (r === 0) fail(node, 'শূন্য দিয়ে ভাগ করা যায় না', 'division by zero'); return l / r;
      case '%': if (!bothNumbers) return typeError(); if (r === 0) fail(node, 'শূন্য দিয়ে ভাগ করা যায় না', 'division by zero'); return l % r;
      case '==': return equals(l, r);
      case '!=': return !equals(l, r);
      case '<': return bothNumbers || bothStrings ? l < r : typeError();
      case '>': return bothNumbers || bothStrings ? l > r : typeError();
      case '<=': return bothNumbers || bothStrings ? l <= r : typeError();
      case '>=': return bothNumbers || bothStrings ? l >= r : typeError();
      default: fail(node, `অজানা অপারেটর ${op}`, `unknown operator ${op}`);
    }
  }
  callFunction(fn, args, node) {
    this.tick(node);
    if (fn.kind === 'builtin') {
      if (args.length !== fn.arity) fail(node, `'${fn.name}' ${bn(fn.arity)}টি মান চায়, কিন্তু ${bn(args.length)}টি দেওয়া হয়েছে`, `'${fn.name}' takes ${fn.arity} argument(s), but ${args.length} given`);
      return fn.call(args, (messageBn, messageEn) => fail(node, messageBn, messageEn));
    }
    if (args.length !== fn.params.length) fail(node, `'${fn.name}' ${bn(fn.params.length)}টি মান চায়, কিন্তু ${bn(args.length)}টি দেওয়া হয়েছে`, `'${fn.name}' takes ${fn.params.length} argument(s), but ${args.length} given`);
    if (this.callDepth >= MAX_CALL_DEPTH) fail(node, `ফাংশন কল অনেক গভীর হয়ে গেছে (সীমা ${bn(MAX_CALL_DEPTH)}), রিকার্শন থামছে না?`, `calls nested too deeply (limit ${MAX_CALL_DEPTH}), does the recursion ever stop?`);
    const scope = new Environment(fn.closure);
    fn.params.forEach((p, i) => scope.define(p, args[i]));
    if (fn.boundThis) scope.define('this', fn.boundThis);
    scope.classContext = fn.classContext ?? fn.closure?.classContext ?? null;
    const savedLoopDepth = this.loopDepth; this.loopDepth = 0; this.funcDepth++; this.callDepth++;
    try { for (const stmt of fn.body.body) this.exec(stmt, scope); return null; }
    catch (signal) { if (signal instanceof ReturnSignal) return signal.value; throw signal; }
    finally { this.callDepth--; this.funcDepth--; this.loopDepth = savedLoopDepth; }
  }
}
