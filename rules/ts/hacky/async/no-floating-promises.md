---
severity: major
detect: judge
falsePositives:
  - >-
    a promise explicitly discarded with `void` and a comment saying why, such as
    fire-and-forget telemetry
  - >-
    a promise stored in a variable or array and awaited later, including through
    `Promise.all`
  - >-
    a call that returns something other than a promise, when the return type is
    visible in the diff or obvious from the name
jev:
  threshold: 0.46
---

## Why

A promise nobody awaits or returns keeps running with nobody watching: its rejection is not caught by the surrounding `try`, the function returns before the work is done, and depending on the runtime the failure is either an unhandled rejection that kills the process or a warning nobody reads. Every promise should be awaited, returned, collected for a later `Promise.all`, or discarded on purpose with `void` and a reason.

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

	// the email is best-effort and failures are logged inside the mailer
	void sendWelcomeEmail(user);

	return user;
}
```
