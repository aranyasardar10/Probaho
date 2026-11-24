# Probaho language reference · প্রবাহ ভাষার নির্দেশিকা

## Basics

Statements end at a newline or `;`; blocks use `{ ... }`; comments begin with `#`. Strings use double quotes and support `\n`, `\t`, `\"` and `\\`. Numbers and identifiers may use Bangla script, and English keyword aliases are available.

## Keywords

| Bangla | English alias | Meaning |
|---|---|---|
| `ধরি` | `let` | declare a variable |
| `যদি` / `নাহলে` | `if` / `else` | conditional |
| `যতক্ষণ` | `while` | loop |
| `ফাংশন` / `ফেরত` | `fn` / `return` | functions |
| `ছাপো` | `print` | output |
| `সত্য` / `মিথ্যা` | `true` / `false` | booleans |
| `এবং` / `অথবা` / `না` | `and` / `or` / `not` | logic |
| `থামো` / `পরেরটা` | `break` / `continue` | loop control |
| `শ্রেণি` | `class` | declare a class |
| `গোপন` | `private` | private field or method |
| `এই` | `this` | current object inside a method |
| `নতুন` | `new` | create a class instance |

## Values and operators

Probaho supports numbers, strings, booleans, lists, functions, classes, objects and `শূন্য` (nothing). `+`, `-`, `*`, `/`, `%`, comparisons, equality, `এবং`, `অথবা` and `না` work as in the main README. Lists and strings use zero-based indexing.

## Classes and objects

A class contains field declarations and methods. Every instance gets its own fields; field initializers are evaluated for each new instance. Omitted field initializers default to `শূন্য`. Use a method named `শুরু` (or `init` in English) as the constructor. Methods use `এই`/`this` to access their receiver. Fields and methods marked `গোপন`/`private` can only be accessed from methods of the same class.

```text
শ্রেণি হিসাব {
  ধরি মালিক = ""
  গোপন ধরি ব্যালেন্স = ০

  ফাংশন শুরু(নাম, প্রাথমিক) {
    এই.মালিক = নাম
    এই.ব্যালেন্স = প্রাথমিক
  }

  ফাংশন জমা(টাকা) {
    যদি টাকা <= ০ { ফেরত মিথ্যা }
    এই.ব্যালেন্স = এই.ব্যালেন্স + টাকা
    ফেরত সত্য
  }

  ফাংশন দেখাও() { ছাপো এই.মালিক, এই.ব্যালেন্স }
}
ধরি রহিম = নতুন হিসাব("রহিম", ১০০)
রহিম.জমা(৫০)
রহিম.দেখাও()
```

A method can be saved in a variable and called later; it retains its object receiver. Classes must be instantiated with `নতুন`/`new`. Assigning to undeclared fields and reassigning methods are errors. There is no inheritance yet.

## Built-ins

`দৈর্ঘ্য(x)` / `len`, `যোগ(list, x)` / `append`, `সংখ্যা(x)` / `number`, and `লেখা(x)` / `str`.

## Limits

The interpreter guards against excessively long programs and deep recursion. Run the test suite with `npm test`; run a program with `node run.js examples/hello.pb`.
