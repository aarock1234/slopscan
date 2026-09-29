---
severity: minor
detect: ast
ast:
  rule:
    kind: binary_expression
    all:
      - has:
          field: operator
          regex: ^\|\|$
      - has:
          field: right
          any:
            - kind: string
            - kind: number
            - kind: object
            - kind: array
            - kind: template_string
guide:
  - ts.absence
  - ts.options
---

## Why

`value || fallback` replaces every falsy value, so a legitimate `0`, empty string, or `false` is silently swapped for the default and the bug only shows up when someone sets a timeout to zero or clears a name. `??` falls back only on `null` and `undefined`, which is what a default is for. Use `||` only when a falsy value really should be treated as missing, and say so.

## Message

`||` with a default replaces 0, empty string, and false; use `??`

## Bad

```ts
// BAD: a timeout of 0 becomes 5000
const timeout = options.timeout || 5000;
```

```ts
// BAD: an empty name becomes 'anonymous' even when it was set on purpose
const name = user.name || 'anonymous';
```

## Good

```ts
const timeout = options.timeout ?? 5000;
const name = user.name ?? 'anonymous';
```

```ts
const canEdit = isOwner || isAdmin;
```
