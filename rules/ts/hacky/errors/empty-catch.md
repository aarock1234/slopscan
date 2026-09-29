---
severity: critical
detect: ast
ast:
  rule:
    kind: catch_clause
    has:
      kind: statement_block
      regex: '^\{\s*\}$'
guide:
  - ts.error-propagation
---

## Why

An empty catch swallows the failure and lets the program continue in a state nobody designed for. The bug surfaces later, somewhere else, with no stack trace pointing home. Handle the error, rethrow it with context, or let it propagate. If ignoring it really is correct, the block needs a comment saying why, which makes it non-empty.

## Message

empty catch swallows the error; handle it, rethrow with context, or let it propagate

## Bad

```ts
try {
	await save(record);
	// BAD: the failure vanishes
} catch {}
```

```ts
try {
	await save(record);
	// BAD: binding the error and dropping it is still swallowing
} catch (error) {}
```

## Good

```ts
try {
	await save(record);
} catch (error) {
	throw new PersistenceError(`saving record ${record.id}`, { cause: error });
}
```

```ts
try {
	await removeTempFile(path);
} catch {
	// the file is already gone, which is the state we wanted
}
```
