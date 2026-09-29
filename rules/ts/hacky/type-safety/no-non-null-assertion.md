---
severity: major
detect: ast
ignore:
  - '**/*.test.ts'
  - '**/*.test.tsx'
ast:
  rule:
    kind: non_null_expression
guide:
  - ts.indexed-access
  - ts.non-null-assertions
---

## Why

The `!` operator tells the compiler to trust you and turns a compile-time question into a runtime crash. Narrow with a guard, use optional chaining with a default, or throw an error that says what was missing. Tests are excluded because a failing assertion there is the intended outcome.

## Message

non-null assertion trades a compile-time check for a runtime crash; narrow or throw

## Bad

```ts
// BAD: crashes with a bare TypeError when the user is missing
const name = users.find(user => user.id === id)!.name;
```

## Good

```ts
// GOOD: the missing case has a name and a message
const user = users.find(candidate => candidate.id === id);

if (user === undefined) {
	throw new NotFoundError(`user ${id}`);
}

const name = user.name;
```

```ts
// GOOD: optional chaining with a default when absence is fine
const name = users.find(user => user.id === id)?.name ?? 'anonymous';
```
