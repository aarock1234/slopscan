---
severity: minor
detect: ast
ast:
  rule:
    pattern: const $NAME = $VALUE
    inside:
      kind: export_statement
  constraints:
    NAME:
      regex: '^[a-z][a-zA-Z0-9]*$'
    VALUE:
      any:
        - kind: number
        - kind: string
        - kind: 'true'
        - kind: 'false'
guide:
  - ts.naming
---

## Why

An exported module-level constant holding a literal value is a configuration knob other modules import, and SCREAMING_SNAKE_CASE marks it as one at every use site: `DEFAULT_TIMEOUT` reads as a fixed limit where `defaultTimeout` reads as something computed nearby. The guide's naming table has both a camelCase "Constants" row and a SCREAMING_SNAKE "Module constants" row; this rule enforces only the second, for exported primitives, and leaves an unexported `const maxRetries = 3` and every local constant alone.

## Message

exported literal constant is camelCase; use SCREAMING_SNAKE_CASE

## Bad

```ts
// BAD: exported literal config in camelCase
export const defaultTimeout = 10_000;
```

## Good

```ts
export const DEFAULT_TIMEOUT = 10_000;
```

```ts
const maxRetries = 3;

export const userSchema = z.object({
	id: z.string(),
});

function retry(): void {
	const attempts = 3;
}
```
