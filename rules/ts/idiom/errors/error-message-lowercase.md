---
severity: minor
detect: ast
ast:
  rule:
    any:
      - pattern: new $CLS($MSG)
      - pattern: 'new $CLS($MSG, $$$REST)'
  constraints:
    CLS:
      regex: Error$
    MSG:
      regex: '^.[A-Z][a-z]'
guide:
  - ts.error-propagation
---

## Why

Error messages get wrapped and joined with other messages, as in `loading config: reading file: permission denied`, and a capitalized fragment in the middle of that chain reads like a new sentence. Messages are lowercase fragments without trailing punctuation so they compose cleanly and match the log lines around them. Acronyms and proper nouns at the start are fine.

## Message

error message starts with a capital letter; write it as a lowercase fragment

## Bad

```ts
if (!config) {
	// BAD: capitalized message reads wrong once it is wrapped
	throw new Error('Config file is missing');
}
```

```ts
if (!user) {
	// BAD: capitalized message in a custom error
	throw new NotFoundError(`User ${id} does not exist`, 404);
}
```

## Good

```ts
if (!config) {
	throw new ConfigError('config file is missing');
}
```

```ts
if (!user) {
	throw new NotFoundError(`user ${id} does not exist`);
}
```

```ts
throw new UpstreamError('HTTP 502 from payments service');
```
