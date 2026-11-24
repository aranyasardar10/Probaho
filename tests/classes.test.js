import { test } from 'node:test';
import assert from 'node:assert/strict';
import { run, runProgram, ProbahoError } from '../src/index.js';
import { tokenize } from '../src/lexer.js';
import { parse } from '../src/parser.js';

const out = (src) => {
  const r = runProgram(src);
  assert.equal(r.error, null, r.error ?? '');
  return r.output.join('\n');
};
const errorOf = (src) => {
  try { run(src, { print: () => {} }); } catch (e) {
    assert.ok(e instanceof ProbahoError, String(e));
    return e;
  }
  return assert.fail('expected an error');
};

// ----- lexer and parser -----

test('dot is a token, decimals still work', () => {
  assert.deepEqual(tokenize('এই.মান').map((t) => t.type), ['THIS', '.', 'IDENT', 'NEWLINE', 'EOF']);
  assert.equal(tokenize('১.৫')[0].value, 1.5);
});

test('class declaration parses into fields and methods', () => {
  const c = parse(tokenize('শ্রেণি A {\n গোপন ধরি x = ১\n ধরি y\n ফাংশন f() { }\n}')).body[0];
  assert.equal(c.type, 'Class');
  assert.deepEqual(c.fields.map((f) => [f.name, f.private]), [['x', true], ['y', false]]);
  assert.equal(c.fields[1].value.type, 'Nothing');
  assert.equal(c.methods[0].name, 'f');
});

test('member access and member assignment parse', () => {
  assert.equal(parse(tokenize('a.b')).body[0].expr.type, 'Member');
  assert.equal(parse(tokenize('a.b = ১')).body[0].target.type, 'Member');
  assert.equal(parse(tokenize('নতুন A(১).f()')).body[0].expr.type, 'Call');
});

test('only fields and methods are allowed in a class body', () => {
  assert.throws(() => parse(tokenize('শ্রেণি A { ছাপো ১ }')), ProbahoError);
});

// ----- classes and objects -----

test('constructor, fields and methods', () => {
  const src = `শ্রেণি বিন্দু {
  ধরি x = ০
  ধরি y = ০
  ফাংশন শুরু(a, b) {
    এই.x = a
    এই.y = b
  }
  ফাংশন যোগফল() { ফেরত এই.x + এই.y }
}
ধরি p = নতুন বিন্দু(৩, ৪)
ছাপো p.x, p.y, p.যোগফল()`;
  assert.equal(out(src), '3 4 7');
});

test('fields have default values when there is no constructor', () => {
  assert.equal(out('শ্রেণি A { ধরি x = ৫\n ধরি y }\nধরি a = নতুন A()\nছাপো a.x, a.y'), '5 শূন্য');
});

test('every object has its own state, even for list fields', () => {
  const src = `শ্রেণি A { ধরি তালিকা = [] }
ধরি a = নতুন A()
ধরি b = নতুন A()
যোগ(a.তালিকা, ১)
ছাপো দৈর্ঘ্য(a.তালিকা), দৈর্ঘ্য(b.তালিকা)`;
  assert.equal(out(src), '1 0');
});

test('methods can be chained on a new object and stored in variables', () => {
  assert.equal(out('শ্রেণি A { ফাংশন f() { ফেরত ৯ } }\nছাপো নতুন A().f()'), '9');
  const src = `শ্রেণি A {
  ধরি n = ৭
  ফাংশন পাও() { ফেরত এই.n }
}
ধরি a = নতুন A()
ধরি f = a.পাও
ছাপো f()`;
  assert.equal(out(src), '7');
});

test('English keywords work the same', () => {
  const src = `class Acc {
  private let bal = 0
  fn init(x) { this.bal = x }
  fn get() { return this.bal }
}
let a = new Acc(5)
print a.get()`;
  assert.equal(out(src), '5');
});

// ----- encapsulation -----

test('private field cannot be read from outside', () => {
  const e = errorOf('শ্রেণি A { গোপন ধরি x = ১ }\nধরি a = নতুন A()\nছাপো a.x');
  assert.equal(e.line, 3);
  assert.match(e.messageEn, /private/);
});

test('private field cannot be changed from outside', () => {
  const e = errorOf('শ্রেণি A { গোপন ধরি x = ১ }\nধরি a = নতুন A()\na.x = ২');
  assert.match(e.messageEn, /private/);
});

test('private field works inside the class methods', () => {
  const src = `শ্রেণি A {
  গোপন ধরি x = ১
  ফাংশন বাড়াও() { এই.x = এই.x + ১ }
  ফাংশন পাও() { ফেরত এই.x }
}
ধরি a = নতুন A()
a.বাড়াও()
ছাপো a.পাও()`;
  assert.equal(out(src), '2');
});

test('private method: allowed inside, blocked outside', () => {
  const cls = `শ্রেণি A {
  গোপন ফাংশন ভেতরে() { ফেরত ৭ }
  ফাংশন বাইরে() { ফেরত এই.ভেতরে() * ২ }
}
ধরি a = নতুন A()
`;
  assert.equal(out(cls + 'ছাপো a.বাইরে()'), '14');
  assert.match(errorOf(cls + 'ছাপো a.ভেতরে()').messageEn, /private/);
});

test('a nested function inside a method keeps access to private members', () => {
  const src = `শ্রেণি A {
  গোপন ধরি x = ৫
  ফাংশন পাও() {
    ফাংশন ভেতর() { ফেরত এই.x }
    ফেরত ভেতর()
  }
}
ছাপো নতুন A().পাও()`;
  assert.equal(out(src), '5');
});

test('privacy is per class: another object of the same class is accessible inside a method', () => {
  const src = `শ্রেণি P {
  গোপন ধরি v = ০
  ফাংশন শুরু(n) { এই.v = n }
  ফাংশন সমান(অন্য) { ফেরত এই.v == অন্য.v }
}
ছাপো নতুন P(১).সমান(নতুন P(১)), নতুন P(১).সমান(নতুন P(২))`;
  assert.equal(out(src), 'সত্য মিথ্যা');
});

test('a function outside the class cannot use private members, even if called by a method', () => {
  const src = `ফাংশন চুরি(o) { ফেরত o.x }
শ্রেণি A {
  গোপন ধরি x = ১
  ফাংশন দাও() { ফেরত চুরি(এই) }
}
ছাপো নতুন A().দাও()`;
  assert.match(errorOf(src).messageEn, /private/);
});

test('fields must be declared before they are used', () => {
  const e = errorOf('শ্রেণি A { ধরি x = ১ }\nধরি a = নতুন A()\na.y = ২');
  assert.match(e.messageEn, /no field 'y'/);
});

test('methods cannot be reassigned', () => {
  assert.match(errorOf('শ্রেণি A { ফাংশন f() { } }\nধরি a = নতুন A()\na.f = ১').messageEn, /method/);
});

// ----- errors -----

test('this outside a class is an error', () => {
  assert.match(errorOf('ছাপো এই').messageEn, /this/);
});

test('unknown class, calling a class without new, and non-objects', () => {
  assert.match(errorOf('ধরি a = নতুন Z()').messageEn, /not defined/);
  assert.match(errorOf('শ্রেণি A { }\nA()').messageEn, /new A/);
  assert.match(errorOf('ধরি x = ৫\nছাপো x.y').messageEn, /no members/);
  assert.match(errorOf('ধরি x = ৫\nধরি a = নতুন x()').messageEn, /not a class/);
});

test('unknown member', () => {
  assert.match(errorOf('শ্রেণি A { }\nছাপো নতুন A().z').messageEn, /no member 'z'/);
});

test('constructor argument count', () => {
  assert.throws(() => run('শ্রেণি A { ফাংশন শুরু(a) { } }\nনতুন A()', { print: () => {} }), ProbahoError);
  assert.match(errorOf('শ্রেণি A { }\nনতুন A(১)').messageEn, /no 'init'/);
});

test('duplicate member names are rejected', () => {
  assert.match(errorOf('শ্রেণি A {\n ধরি x = ১\n ফাংশন x() { }\n}').messageEn, /already a member/);
});

test('classes and objects print readably', () => {
  assert.equal(out('শ্রেণি A { }\nছাপো A, নতুন A()'), '<শ্রেণি A> <A বস্তু>');
});

test('spec example: bank account', () => {
  const src = `শ্রেণি হিসাব {
  গোপন ধরি ব্যালেন্স = ০
  ফাংশন শুরু(প্রাথমিক) { এই.ব্যালেন্স = প্রাথমিক }
  ফাংশন তোলো(টাকা) {
    যদি টাকা > এই.ব্যালেন্স { ফেরত মিথ্যা }
    এই.ব্যালেন্স = এই.ব্যালেন্স - টাকা
    ফেরত সত্য
  }
  ফাংশন দেখাও() { ফেরত এই.ব্যালেন্স }
}
ধরি h = নতুন হিসাব(১০০)
ছাপো h.তোলো(৩০), h.তোলো(৯০), h.দেখাও()`;
  assert.equal(out(src), 'সত্য মিথ্যা 70');
});
