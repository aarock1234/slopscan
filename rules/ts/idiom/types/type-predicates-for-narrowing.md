---
severity: minor
detect: judge
falsePositives:
  - >-
    boolean functions that answer a business question rather than a type
    question, such as `isActive(user)` or `hasPermission(user, action)`
  - 'a check that is used once, inline, and never followed by a cast'
  - functions that already declare `value is T` or `asserts value is T`
jev:
  threshold: 0.5
---

## Why

A function that returns `boolean` after checking a value's shape tells the caller yes or no, but the compiler learns nothing, so the caller follows the check with `as T` and the two drift apart. Declaring the return as `value is T` ties the check to the narrowing: inside the `if`, the value is `T` with no cast, and `filter` returns the narrowed array. Assertion functions with `asserts value is T` do the same for throw-on-failure checks.

## Message

type check returns a plain boolean; declare a type predicate so callers narrow without casting

## Bad

```ts
// BAD: callers learn nothing and cast right after the check
function isUser(value: unknown): boolean {
	return typeof value === 'object' && value !== null && 'id' in value;
}

function display(value: unknown): string {
	if (isUser(value)) {
		return (value as User).name;
	}

	return 'unknown';
}
```

## Good

```ts
function isUser(value: unknown): value is User {
	return typeof value === 'object' && value !== null && 'id' in value;
}

function display(value: unknown): string {
	if (isUser(value)) {
		return value.name;
	}

	return 'unknown';
}
```

```ts
const strings = mixed.filter((item): item is string => typeof item === 'string');
```
