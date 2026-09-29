---
severity: minor
detect: judge
ignore:
  - '**/*.test.ts'
  - '**/*.spec.ts'
falsePositives:
  - >-
    an invariant or programmer error that no caller branches on, such as a
    missing root element, an argument that must be a positive integer, or the
    `never` branch of an exhaustive switch
  - >-
    a message that already interpolates the failing input, such as `unknown
    status: ${status}`
  - >-
    a throw in a script, test helper, or prototype with no boundary that maps
    errors to responses
guide:
  - ts.error-classes
  - ts.error-propagation
jev:
  threshold: 0.5
---

## Why

An error that crosses a boundary, or that a caller needs to tell apart from other failures, needs two things a bare `new Error('user not found')` does not give: a class the catcher can check with `instanceof` and map to a status code, and a message that names the record or input that failed. Without them the boundary can only string-match the message, and the on-call engineer learns that some user was missing. A plain `Error` with a fixed message is the right tool when no caller needs a distinct category: an invariant, a bad argument, the `never` branch of an exhaustive switch.

## Message

error crosses a boundary or callers branch on it; throw a typed error that carries context

## Bad

```ts
async function getUser(id: string): Promise<User> {
	const user = await repository.find(id);

	if (!user) {
		// BAD: the route can only map this to 404 by matching the text, and nothing says which user
		throw new Error('user not found');
	}

	return user;
}
```

```ts
async function charge(order: Order): Promise<Receipt> {
	try {
		return await gateway.charge(order.total);
	} catch (error) {
		// BAD: the caller cannot tell a declined card from an outage, and the cause is dropped
		throw new Error('payment failed');
	}
}
```

## Good

```ts
async function getUser(id: string): Promise<User> {
	const user = await repository.find(id);

	if (!user) {
		throw new NotFoundError(`user ${id}`);
	}

	return user;
}
```

```ts
function chunk<T>(items: readonly T[], size: number): T[][] {
	if (!Number.isInteger(size) || size <= 0) {
		throw new Error('chunk size must be a positive integer');
	}

	return Array.from({ length: Math.ceil(items.length / size) }, (_, index) =>
		items.slice(index * size, (index + 1) * size)
	);
}
```

```ts
function label(status: Status): string {
	switch (status) {
		case Status.ACTIVE:
			return 'running';
		default: {
			const exhaustive: never = status;

			throw new Error(`unhandled status: ${String(exhaustive)}`);
		}
	}
}
```
