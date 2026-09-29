---
severity: minor
detect: ast
ignore:
  - '**/*.config.ts'
  - '**/app/**'
  - '**/pages/**'
ast:
  rule:
    pattern: export default $X
guide:
  - ts.exports
---

## Why

A default export has no name of its own, so every importer invents one and the same function ends up with three names across the codebase. Named exports keep one name, refactor safely, and autocomplete. Framework files that require a default export, such as config files and route modules, are excluded.

## Message

default export has no name of its own; use a named export

## Bad

```ts
// BAD: importers will call this anything they like
export default function createUser(input: CreateUserInput): Promise<User> {
	return repository.insert(input);
}
```

## Good

```ts
// GOOD: one name everywhere
export function createUser(input: CreateUserInput): Promise<User> {
	return repository.insert(input);
}
```
