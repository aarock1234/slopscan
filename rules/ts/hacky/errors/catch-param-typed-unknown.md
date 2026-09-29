---
severity: major
detect: ast
ast:
  rule:
    any:
      - kind: catch_clause
        has:
          field: type
          regex: any
      - pattern: $E as Error
        inside:
          kind: catch_clause
          stopBy: end
guide:
  - ts.error-propagation
  - ts.result-pattern
---

## Why

Anything can be thrown in JavaScript, so a catch parameter is `unknown` and the only honest way to read `.message` is to check `instanceof Error` first. Typing the parameter as `any` or casting it with `as Error` skips that check, and the first time a string or a rejected fetch body is thrown the handler itself crashes on an undefined property. Narrow with `instanceof`, or normalize with `error instanceof Error ? error : new Error(String(error))`.

## Message

catch parameter treated as `Error` without a check; keep it `unknown` and narrow with `instanceof`

## Bad

```ts
try {
	await save(user);
// BAD: any disables checking on whatever was thrown
} catch (error: any) {
	logger.error(error.message);
}
```

```ts
try {
	await save(user);
} catch (error) {
	// BAD: the cast crashes the handler if a non-Error was thrown
	logger.error((error as Error).message);
}
```

## Good

```ts
try {
	await save(user);
} catch (error: unknown) {
	if (error instanceof Error) {
		logger.error(error.message);
	}

	throw error;
}
```

```ts
try {
	await save(user);
} catch (error: unknown) {
	const cause = error instanceof Error ? error : new Error(String(error));

	throw new SaveError('saving user failed', { cause });
}
```
