---
severity: minor
detect: judge
falsePositives:
  - 're-exports of values such as functions, classes, const objects, or schemas'
  - >-
    a `type` or `interface` declared inline with `export type` or `export
    interface`
  - >-
    re-exports that mix types and values and already mark the types with an
    inline `type` modifier
jev:
  threshold: 0.31
guide:
  - ts.exports
---

## Why

Re-exporting a type through a plain `export { X } from` keeps a runtime edge to the module even though nothing from it survives compilation. `export type { X } from` is erased, keeps `isolatedModules` builds happy, and tells the reader that the module contributes only types. It mirrors `import type` so the two read the same way.

## Message

re-export is a type; use `export type`

## Bad

```ts
// BAD: User is a type, but the re-export keeps a runtime edge to ./user
export { User } from './user';
```

## Good

```ts
export type { User } from './user';
export { createUser } from './user';
```

```ts
export { type User, createUser } from './user';
```
