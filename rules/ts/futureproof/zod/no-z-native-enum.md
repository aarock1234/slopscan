---
severity: minor
detect: ast
ast:
  rule:
    pattern: z.nativeEnum($X)
guide:
  - ts.zod
  - ts.zod-enums
---

## Why

`z.nativeEnum` exists to wrap a TypeScript `enum`, and it is deprecated in Zod v4, so it ties the schema to a construct the codebase avoids and to an API that will be removed. A const object with `as const` plus `z.enum` over its values gives the same runtime check with a plain object that is grep-friendly, tree-shakeable, and stays valid across Zod upgrades. The type comes from the same object, so there is still one source of truth.

## Message

`z.nativeEnum` is deprecated; use `z.enum` over the values of a const object

## Bad

```ts
// BAD: deprecated in Zod v4 and tied to a TypeScript enum
const prioritySchema = z.nativeEnum(Priority);
```

## Good

```ts
const Priority = {
	LOW: 'low',
	HIGH: 'high',
} as const;

type Priority = (typeof Priority)[keyof typeof Priority];

const priorityValues = Object.values(Priority) as [Priority, ...Priority[]];
const prioritySchema = z.enum(priorityValues);
```
