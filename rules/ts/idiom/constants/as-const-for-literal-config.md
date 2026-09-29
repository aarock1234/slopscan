---
severity: minor
detect: ast
ast:
  rule:
    pattern: const $NAME = $OBJ
    inside:
      any:
        - kind: program
        - kind: export_statement
  constraints:
    NAME:
      regex: '^[A-Z]'
    OBJ:
      kind: object
      has:
        kind: pair
      not:
        has:
          kind: pair
          has:
            field: value
            not:
              any:
                - kind: string
                - kind: number
guide:
  - ts.constants
  - ts.readonly
---

## Why

A PascalCase const object of literal values is meant to act as an enum, but without `as const` every value widens to `string` or `number`, so `typeof Status[keyof typeof Status]` is just `string` and the compiler cannot check a switch over it. Adding `as const` freezes the values to their literals, makes the derived union real, and marks the object as readonly at the type level. It is the difference between a named constant set and a bag of strings.

## Message

literal const object without `as const`; its values widen to `string`

## Bad

```ts
// BAD: Status.PENDING is typed as string, not 'pending'
const Status = {
	PENDING: 'pending',
	ACTIVE: 'active',
};

type Status = (typeof Status)[keyof typeof Status];
```

## Good

```ts
const Status = {
	PENDING: 'pending',
	ACTIVE: 'active',
} as const;

type Status = (typeof Status)[keyof typeof Status];
```

```ts
const defaults = {
	timeout: 5000,
	retries: 3,
};
```
