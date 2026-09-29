---
severity: major
detect: ast
ast:
  rule:
    kind: catch_clause
    has:
      kind: statement_block
      regex: >-
        ^\{\s*(?:(?:console|log|logger|this\.logger|this\.log)\.\w+\([^;]*\);?\s*)+\}$
guide:
  - ts.error-propagation
---

## Why

Logging an error and carrying on is an empty catch with a paper trail: the caller gets a normal return and proceeds as if the operation succeeded, so the failure surfaces later as bad data or a confusing second error. The log line is rarely read until then. Rethrow with context, return an explicit failure the caller must handle, or, if continuing really is correct, say why in a comment so the choice is visible.

## Message

catch only logs and continues; rethrow with context or return an explicit failure

## Bad

```ts
async function saveDraft(draft: Draft): Promise<void> {
	try {
		await repo.save(draft);
		// BAD: the caller is told nothing and proceeds as if the save worked
	} catch (error) {
		console.error('failed to save draft', error);
	}
}
```

```ts
async function saveDraft(draft: Draft): Promise<void> {
	try {
		await repo.save(draft);
		// BAD: a structured logger does not change what the caller sees
	} catch (error) {
		logger.error({ err: error, draftId: draft.id }, 'failed to save draft');
	}
}
```

## Good

```ts
async function saveDraft(draft: Draft): Promise<void> {
	try {
		await repo.save(draft);
	} catch (error) {
		throw new PersistenceError(`saving draft ${draft.id}`, { cause: error });
	}
}
```

```ts
async function warmCache(): Promise<void> {
	try {
		await cache.preload();
	} catch (error) {
		// a cold cache only costs latency, and the request path fills it on demand
		logger.warn({ err: error }, 'cache preload failed, continuing cold');
	}
}
```
