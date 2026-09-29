---
severity: major
detect: ast
ast:
  rule:
    kind: predefined_type
    regex: ^any$
guide:
  - ts.json-boundaries
  - ts.type-preferences
  - ts.typed-values
---

## Why

`any` switches the type checker off for everything it touches, and the hole spreads through every call site. Prefer a real type, then a generic, then `Record<string, T>`, then `unknown` narrowed at the point of use. `any` is the last resort, and it needs a comment saying why.

## Message

`any` disables type checking; use a real type, a generic, or `unknown`

## Bad

```ts
// BAD: any hides the shape of the payload
function handle(payload: any) {
	return payload.user.id;
}
```

```ts
// BAD: Record<string, any> is any with extra steps
const cache: Record<string, any> = {};
```

## Good

```ts
// GOOD: unknown forces narrowing before use
function handle(payload: unknown) {
	const parsed = payloadSchema.parse(payload);

	return parsed.user.id;
}
```

```ts
// GOOD: a generic keeps the caller's type
function first<T>(items: readonly T[]): T | undefined {
	return items[0];
}
```
