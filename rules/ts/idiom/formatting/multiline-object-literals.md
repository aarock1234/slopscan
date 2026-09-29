---
severity: info
detect: ast
ignore:
  - '**/*.test.ts'
  - '**/*.test.tsx'
  - '**/*.spec.ts'
ast:
  rule:
    kind: object
    has:
      nthChild: 2
    regex: '^[^\n]*$'
guide:
  - ts.object-literals
---

## Why

An object literal with two or more properties squeezed onto one line hides the key/value pairs in a wall of punctuation and turns every added property into a diff on the same line. One property per line lets the reader scan keys down the left edge and makes each change a one-line diff. Single-property objects such as `{ id }` are fine inline. Tests are excluded: a fixture object written on one line is read as a value, not as a shape being designed.

## Message

object with several properties on one line; put one property per line

## Bad

```ts
// BAD: two properties squeezed onto one line
const options = { timeout: 5000, retries: 3 };
```

```ts
// BAD: inline argument object with several properties
await db.user.update({ where: { id }, data: input });
```

## Good

```ts
const options = {
	timeout: 5000,
	retries: 3,
};
```

```ts
await db.user.update({
	where: { id },
	data: input,
});
```
