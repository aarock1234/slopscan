---
severity: minor
detect: ast
ignore:
  - '**/*.test.ts'
  - '**/*.spec.ts'
ast:
  rule:
    any:
      - pattern: $E.message === $S
      - pattern: $E.message == $S
      - pattern: $E.message.includes($$$ARGS)
      - pattern: $E.message.startsWith($$$ARGS)
      - pattern: $E.message.match($$$ARGS)
guide:
  - ts.error-classes
---

## Why

Branching on the text of an error message couples the caller to a string that was written for humans and will be reworded without anyone checking the callers. A custom error class gives the failure a name, an `instanceof` check that survives rewording, and a place to hang structured fields such as a status code or the offending id. Expected failures get their own class; message matching is left for logs.

## Message

branching on error message text; throw a custom error class and check `instanceof`

## Bad

```ts
try {
	await getUser(id);
} catch (error: unknown) {
	// BAD: a reworded message silently turns this into a 500
	if (error instanceof Error && error.message === 'user not found') {
		res.status(404).end();
	}
}
```

```ts
try {
	await connect();
} catch (error: unknown) {
	// BAD: substring matching on prose
	if (error instanceof Error && error.message.includes('timeout')) {
		return retry();
	}
}
```

## Good

```ts
class NotFoundError extends Error {
	constructor(resource: string) {
		super(`${resource} not found`);
		this.name = 'NotFoundError';
	}
}

try {
	await getUser(id);
} catch (error: unknown) {
	if (error instanceof NotFoundError) {
		res.status(404).end();
	}
}
```
