---
severity: minor
detect: ast
ast:
  ts:
    rule:
      kind: comment
      regex: '^//\s*[-=*#]{4,}'
  go:
    rule:
      kind: comment
      regex: '^//\s*[-=*#]{4,}'
guide:
  - ts.comments
---

## Why

Banner comments and decorative separators are a sign the file has grown past one responsibility. They do not help navigation, editors fold on declarations rather than dashes, and they drift out of place as code moves. Split the file, or let the declarations speak for themselves.

## Message

banner comments signal a file doing too much; split it instead of decorating it

## Bad

```ts
// BAD: decorative separator
// ----------------------------------------
export function createUser(): void {}
```

```go
// BAD: decorative section header
// ==== Handlers ====
func handle() {}
```

## Good

```ts
// creates the user and returns its persisted form
export function createUser(): void {}
```

```go
// handle serves the health endpoint.
func handle() {}
```
