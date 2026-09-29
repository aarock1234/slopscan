---
severity: minor
detect: ast
ast:
  rule:
    any:
      - pattern: $P.then($$$ARGS)
      - pattern: $P.finally($$$ARGS)
      - pattern: $P.catch($$$ARGS)
        not:
          any:
            - inside:
                kind: expression_statement
            - inside:
                kind: unary_expression
                regex: ^void
guide:
  - ts.async-await
---

## Why

`async`/`await` reads top to bottom and keeps error handling in an ordinary `try`. Promise chains split the same logic across callbacks, lose stack context, and make the return value of the surrounding function harder to see. A terminal `.catch` that owns an entrypoint's failure, such as `main().catch(...)` or `void save().catch(report)`, is not a chain: it is the one place that rejection is handled, and there is no surrounding `try` to move it into.

## Message

promise chain; use async/await

## Bad

```ts
function loadUser(id: string) {
	// BAD: callback chain where a straight line would do
	return fetchUser(id)
		.then(user => enrich(user))
		.catch(error => report(error));
}
```

## Good

```ts
async function loadUser(id: string): Promise<User> {
	try {
		const user = await fetchUser(id);

		return await enrich(user);
	} catch (error) {
		report(error);

		throw error;
	}
}
```

```ts
main().catch(error => {
	logger.error({ err: error }, 'fatal');
	process.exitCode = 1;
});
```

```ts
function onSubmit(draft: Draft): void {
	void save(draft).catch(reportError);
}
```
