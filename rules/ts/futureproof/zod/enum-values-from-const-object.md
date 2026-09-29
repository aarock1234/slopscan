---
severity: minor
detect: ast
ast:
  rule:
    pattern: 'z.enum([$$$VALUES])'
    has:
      stopBy: end
      kind: string
      pattern: $LIT
    inside:
      kind: program
      stopBy: end
      has:
        stopBy: end
        kind: as_expression
        pattern: $OBJ as const
        has:
          stopBy: end
          kind: pair
          has:
            field: value
            pattern: $LIT
guide:
  - ts.zod-enums
---

## Why

A string array passed to `z.enum` next to a const object holding the same values is a second copy: adding a variant means finding every literal list and hoping none is missed. Zod v4 accepts the const object directly, `z.enum(Status)`, so one definition feeds the schema, the type, and every `Status.PENDING` reference, and the schema cannot drift from the constants it validates. An inline array is fine when only the schema needs the values and no constant refers to them.

## Message

`z.enum` repeats the values of a const object in this file; pass the const object to `z.enum`

## Bad

```ts
const Status = {
	PENDING: 'pending',
	ACTIVE: 'active',
	COMPLETED: 'completed',
} as const;

// BAD: the same values typed out again, so the schema can drift from the constants
const statusSchema = z.enum(['pending', 'active', 'completed']);
```

## Good

```ts
const Status = {
	PENDING: 'pending',
	ACTIVE: 'active',
	COMPLETED: 'completed',
} as const;

type Status = (typeof Status)[keyof typeof Status];

const statusSchema = z.enum(Status);
```

```ts
// only the schema needs these values
const sortSchema = z.object({
	direction: z.enum(['asc', 'desc']),
});
```
