---
severity: minor
detect: ast
ast:
  rule:
    kind: variable_declaration
guide:
  - ts.variables
---

## Why

`var` is function-scoped and hoisted, so a variable declared inside a loop or an `if` leaks into the whole function and can be read before its assignment. `const` and `let` are block-scoped, fail loudly when used early, and tell the reader whether the binding changes. There is no situation in modern TypeScript where `var` is the right choice.

## Message

`var` is function-scoped and hoisted; use `const` or `let`

## Bad

```ts
// BAD: var leaks out of the block it was declared in
var total = 0;

for (var i = 0; i < items.length; i += 1) {
	total += items[i];
}
```

## Good

```ts
let total = 0;

for (const item of items) {
	total += item;
}
```
