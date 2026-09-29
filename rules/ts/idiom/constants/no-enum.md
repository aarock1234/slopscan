---
severity: minor
detect: ast
ast:
  rule:
    kind: enum_declaration
guide:
  - ts.constants
---

## Why

TypeScript enums are a runtime construct with their own semantics: numeric enums accept any number, `const enum` behaves differently under isolated modules, and they do not compose with string literal unions or Zod. A const object with `as const` plus a derived union type gives the same ergonomics with plain objects and plain strings.

## Message

enum is a runtime construct; use a const object with `as const` and a derived union

## Bad

```ts
// BAD: a runtime enum with numeric holes
enum Status {
	Active,
	Inactive,
}
```

## Good

```ts
// GOOD: a const object and its derived union
export const Status = {
	ACTIVE: 'active',
	INACTIVE: 'inactive',
} as const;

export type Status = (typeof Status)[keyof typeof Status];
```
