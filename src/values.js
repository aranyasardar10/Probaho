// Helpers for working with Probaho runtime values.
const BN_DIGITS = '০১২৩৪৫৬৭৮৯';
export const bn = (n) => String(n).replace(/\d/g, (d) => BN_DIGITS[d]);
const segmenter = new Intl.Segmenter('bn', { granularity: 'grapheme' });
export const graphemes = (s) => Array.from(segmenter.segment(s), (x) => x.segment);
export function formatNumber(n, bnDigits = false) {
  const text = Number.isInteger(n) ? String(n) : String(Number(n.toPrecision(12)));
  return bnDigits ? bn(text) : text;
}
export function format(v, nested = false, bnDigits = false) {
  if (v === null) return 'শূন্য';
  if (typeof v === 'number') return formatNumber(v, bnDigits);
  if (typeof v === 'boolean') return v ? 'সত্য' : 'মিথ্যা';
  if (typeof v === 'string') return nested ? `"${v}"` : v;
  if (Array.isArray(v)) return '[' + v.map((x) => format(x, true, bnDigits)).join(', ') + ']';
  if (v?.kind === 'function' || v?.kind === 'builtin') return `<ফাংশন ${v.name}>`;
  if (v?.kind === 'class') return `<শ্রেণি ${v.name}>`;
  if (v?.kind === 'instance') return `<${v.klass.name} বস্তু>`;
  return String(v);
}
export const isTruthy = (v) => !(v === false || v === null || v === 0);
export function equals(a, b) {
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => equals(x, b[i]));
  return a === b;
}
export function typeName(v) {
  if (v === null) return ['শূন্য', 'nothing'];
  if (typeof v === 'number') return ['সংখ্যা', 'number'];
  if (typeof v === 'string') return ['লেখা', 'string'];
  if (typeof v === 'boolean') return ['সত্য/মিথ্যা', 'boolean'];
  if (Array.isArray(v)) return ['তালিকা', 'list'];
  if (v?.kind === 'class') return ['শ্রেণি', 'class'];
  if (v?.kind === 'instance') return ['বস্তু', 'object'];
  return ['ফাংশন', 'function'];
}
