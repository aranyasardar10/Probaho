import { ProbahoError } from './errors.js';

function describe(tok) {
  if (tok.type === 'EOF') return ['ফাইলের শেষ', 'end of file'];
  if (tok.type === 'NEWLINE') return ['নতুন লাইন', 'end of line'];
  return [`'${tok.value}'`, `'${tok.value}'`];
}

export function parse(tokens) {
  let p = 0;
  const peek = () => tokens[p];
  const next = () => tokens[p++];
  const check = (type) => peek().type === type;
  const match = (...types) => types.includes(peek().type) ? next() : null;
  const skipNewlines = () => { while (check('NEWLINE')) p++; };
  const node = (type, tok, props = {}) => ({ type, ...props, line: tok.line, col: tok.col });
  function fail(bn, en, tok = peek()) { throw new ProbahoError(bn, en, tok.line, tok.col); }
  function expect(type, bn, en) {
    if (check(type)) return next();
    const [fbn, fen] = describe(peek());
    fail(`${bn} চাই, কিন্তু ${fbn} পাওয়া গেছে`, `expected ${en}, found ${fen}`);
  }
  function endStatement() {
    if (match('NEWLINE')) return;
    if (check('}') || check('EOF')) return;
    const [fbn, fen] = describe(peek());
    fail(`এখানে ${fbn} আশা করা হয়নি`, `unexpected ${fen}`);
  }
  function parameters() {
    expect('(', "'('", "'('");
    const params = [];
    if (!check(')')) do { params.push(expect('IDENT', 'প্যারামিটারের নাম', 'a parameter name').value); } while (match(','));
    expect(')', "')'", "')'");
    return params;
  }
  function block() {
    const open = expect('{', "'{'", "'{'");
    const body = [];
    skipNewlines();
    while (!check('}') && !check('EOF')) { body.push(statement()); skipNewlines(); }
    expect('}', "'}'", "'}'");
    return node('Block', open, { body });
  }
  function program() {
    const first = peek(), body = [];
    skipNewlines();
    while (!check('EOF')) { body.push(statement()); skipNewlines(); }
    return node('Program', first, { body });
  }
  function classDeclaration() {
    const t = next();
    const name = expect('IDENT', 'শ্রেণির নাম', 'a class name');
    expect('{', "'{'", "'{'");
    const fields = [], methods = [];
    skipNewlines();
    while (!check('}') && !check('EOF')) {
      const privateMember = Boolean(match('PRIVATE'));
      if (check('LET')) {
        const fieldToken = next();
        const fieldName = expect('IDENT', 'ক্ষেত্রের নাম', 'a field name');
        let value;
        if (match('=')) value = expression();
        else value = node('Nothing', fieldName, { value: null });
        endStatement();
        fields.push({ name: fieldName.value, private: privateMember, value, line: fieldToken.line, col: fieldToken.col });
      } else if (check('FN')) {
        const methodToken = next();
        const methodName = expect('IDENT', 'মেথডের নাম', 'a method name');
        const params = parameters();
        const body = block();
        methods.push({ name: methodName.value, private: privateMember, params, body, line: methodToken.line, col: methodToken.col });
      } else {
        const [fbn, fen] = describe(peek());
        fail(`শ্রেণির ভেতরে ক্ষেত্র বা ফাংশন চাই, কিন্তু ${fbn} পাওয়া গেছে`, `expected a field or method in class, found ${fen}`);
      }
      skipNewlines();
    }
    expect('}', "'}'", "'}'");
    return node('Class', t, { name: name.value, fields, methods });
  }
  function statement() {
    const t = peek();
    switch (t.type) {
      case 'CLASS': return classDeclaration();
      case 'LET': {
        next(); const name = expect('IDENT', 'ভেরিয়েবলের নাম', 'a variable name');
        expect('=', "'='", "'='"); const value = expression(); endStatement();
        return node('Let', t, { name: name.value, value });
      }
      case 'IF': return ifStatement();
      case 'WHILE': {
        next(); const test = expression(); const body = block();
        return node('While', t, { test, body });
      }
      case 'FN': {
        next(); const name = expect('IDENT', 'ফাংশনের নাম', 'a function name');
        const params = parameters(), body = block();
        return node('Function', t, { name: name.value, params, body });
      }
      case 'RETURN': {
        next(); const value = (check('NEWLINE') || check('}') || check('EOF')) ? null : expression();
        endStatement(); return node('Return', t, { value });
      }
      case 'PRINT': {
        next(); const args = [expression()];
        while (match(',')) args.push(expression());
        endStatement(); return node('Print', t, { args });
      }
      case 'BREAK': next(); endStatement(); return node('Break', t);
      case 'CONTINUE': next(); endStatement(); return node('Continue', t);
      default: return expressionOrAssignment();
    }
  }
  function ifStatement() {
    const t = expect('IF', 'যদি', 'if'), test = expression(), then = block();
    let otherwise = null; const save = p; skipNewlines();
    if (match('ELSE')) otherwise = check('IF') ? ifStatement() : block();
    else p = save;
    return node('If', t, { test, then, otherwise });
  }
  function expressionOrAssignment() {
    const start = peek(), expr = expression();
    if (match('=')) {
      if (!['Identifier', 'Index', 'Member'].includes(expr.type)) {
        fail('এখানে মান বসানো যায় না, বাম পাশে ভেরিয়েবল, তালিকার ঘর বা সদস্য দিন',
             'cannot assign to this, the left side must be a variable, list item, or member', start);
      }
      const value = expression(); endStatement();
      return node('Assign', start, { target: expr, value });
    }
    endStatement(); return node('ExprStmt', start, { expr });
  }
  function expression() { return or(); }
  function or() {
    let left = and();
    while (check('OR')) { const op = next(); left = node('Logical', op, { op: 'or', left, right: and() }); }
    return left;
  }
  function and() {
    let left = equality();
    while (check('AND')) { const op = next(); left = node('Logical', op, { op: 'and', left, right: equality() }); }
    return left;
  }
  function binaryLevel(sub, ops) {
    return () => { let left = sub(); while (ops.includes(peek().type)) { const op = next(); left = node('Binary', op, { op: op.type, left, right: sub() }); } return left; };
  }
  const equality = () => binaryLevel(comparison, ['==', '!='])();
  const comparison = () => binaryLevel(term, ['<', '>', '<=', '>='])();
  const term = () => binaryLevel(factor, ['+', '-'])();
  const factor = () => binaryLevel(unary, ['*', '/', '%'])();
  function unary() {
    if (check('NOT') || check('-')) { const op = next(); return node('Unary', op, { op: op.type === 'NOT' ? 'not' : '-', arg: unary() }); }
    return call();
  }
  function argList(close) {
    const args = []; skipNewlines();
    while (!check(close)) {
      args.push(expression()); skipNewlines();
      if (!match(',')) break;
      skipNewlines();
    }
    expect(close, `'${close}'`, `'${close}'`); return args;
  }
  function call() {
    let expr = primary();
    while (true) {
      if (check('(')) { const open = next(); expr = node('Call', open, { callee: expr, args: argList(')') }); }
      else if (check('[')) { const open = next(), index = expression(); expect(']', "']'", "']'"); expr = node('Index', open, { object: expr, index }); }
      else if (match('.')) { const dot = tokens[p - 1], name = expect('IDENT', 'সদস্যের নাম', 'a member name'); expr = node('Member', dot, { object: expr, name: name.value }); }
      else break;
    }
    return expr;
  }
  function primary() {
    const t = peek();
    switch (t.type) {
      case 'NUMBER': next(); return node('Number', t, { value: t.value });
      case 'STRING': next(); return node('String', t, { value: t.value });
      case 'TRUE': next(); return node('Bool', t, { value: true });
      case 'FALSE': next(); return node('Bool', t, { value: false });
      case 'THIS': next(); return node('This', t);
      case 'NEW': {
        next(); const name = expect('IDENT', 'শ্রেণির নাম', 'a class name');
        const args = check('(') ? (next(), argList(')')) : [];
        return node('New', t, { name: name.value, args });
      }
      case 'IDENT': next(); return node('Identifier', t, { name: t.value });
      case '(': { next(); const inner = expression(); expect(')', "')'", "')'"); return inner; }
      case '[': { next(); return node('List', t, { elements: argList(']') }); }
      default: {
        const [fbn, fen] = describe(t);
        fail(`এখানে একটি মান চাই, কিন্তু ${fbn} পাওয়া গেছে`, `expected a value, found ${fen}`);
      }
    }
  }
  return program();
}
