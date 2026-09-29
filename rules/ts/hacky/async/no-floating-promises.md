---
severity: major
detect: judge
falsePositives:
  - >-
    a promise discarded with `void` whose rejection is owned by a trailing
    `.catch`, such as `void sendWelcomeEmail(user).catch(reportError)` for
    best-effort work
  - >-
    a promise stored in a variable or array and awaited later, including through
    `Promise.all`
  - >-
    a call that returns something other than a promise, when the return type is
    visible in the diff or obvious from the name
guide:
  - ts.async-await
jev:
  threshold: 0.3
---

## Why

A promise nobody awaits or returns keeps running with nobody watching: its rejection is not caught by the surrounding `try`, the function returns before the work is done, and depending on the runtime the failure is either an unhandled rejection that kills the process or a warning nobody reads. Every promise should be awaited, returned, collected for a later `Promise.all`, or discarded on purpose with `void` and a `.catch` that owns the rejection. `void` alone only silences the lint; the failure still has no owner.

## Message

promise is neither awaited nor returned; its rejection is lost

## Bad

```ts
async function createUser(input: CreateUserInput): Promise<User> {
	const user = await repository.insert(input);

	// BAD: a failed email send rejects into the void
	sendWelcomeEmail(user);

	return user;
}
```

```ts
async function createUser(input: CreateUserInput): Promise<User> {
	const user = await repository.insert(input);

	// BAD: void silences the lint but nobody handles the rejection
	void sendWelcomeEmail(user);

	return user;
}
```

## Good

```ts
async function createUser(input: CreateUserInput): Promise<User> {
	const user = await repository.insert(input);

	await sendWelcomeEmail(user);

	return user;
}
```

```ts
async function createUser(input: CreateUserInput): Promise<User> {
	const user = await repository.insert(input);

	// the email is best-effort; its failure is reported rather than awaited
	void sendWelcomeEmail(user).catch(error => logger.warn({ err: error }, 'welcome email failed'));

	return user;
}
```
