---
severity: minor
detect: judge
falsePositives:
  - >-
    a `let` that is assigned in more than one branch or reassigned later in its
    scope, including inside a loop body or a try block
  - >-
    a `let` declared without an initializer and assigned exactly once further
    down, when merging it into a `const` would need a nested ternary or an IIFE
  - loop counters in a classic `for` statement
jev:
  threshold: 0.49
---

## Why

`const` tells the reader that a binding never changes, which removes one question from every later line that uses it. A `let` that is never reassigned makes the reader scan the rest of the scope looking for the mutation that is not there. Declare with `const` and switch to `let` only when there is a real second assignment.

## Message

`let` is never reassigned; declare it with `const`

## Bad

```ts
// BAD: total is assigned once and never changes
let total = items.reduce((sum, item) => sum + item.price, 0);

return formatCurrency(total);
```

## Good

```ts
const total = items.reduce((sum, item) => sum + item.price, 0);

return formatCurrency(total);
```

```ts
let attempts = 0;

while (attempts < MAX_RETRIES) {
	attempts += 1;
}
```
