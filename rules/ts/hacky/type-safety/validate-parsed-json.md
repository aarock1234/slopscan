---
severity: major
detect: ast
ast:
  rule:
    any:
      - pattern: JSON.parse($$$ARGS) as $T
      - pattern: 'const $X: $T = JSON.parse($$$ARGS)'
  constraints:
    T:
      not:
        regex: ^unknown$
guide:
  - ts.boundary-and-domain-contracts
  - ts.json-boundaries
---

## Why

`JSON.parse` returns whatever the text contained, and a cast or annotation on the result is a promise the program cannot keep. The first malformed file or changed API payload then fails deep inside code that trusted the shape, with an error that says nothing about the real cause. Parse to `unknown` and run the result through a schema so the failure is caught at the boundary with a message that names the bad field.

## Message

`JSON.parse` result cast to a type without validation; parse it through a schema

## Bad

```ts
// BAD: the shape of raw is asserted, not checked
const config = JSON.parse(raw) as Config;
```

```ts
// BAD: annotation is a cast in disguise
const config: Config = JSON.parse(raw);
```

## Good

```ts
const config = configSchema.parse(JSON.parse(raw));
```

```ts
const data: unknown = JSON.parse(raw);
const result = configSchema.safeParse(data);

if (!result.success) {
	throw new ConfigError('invalid config', { cause: result.error });
}
```
