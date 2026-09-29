---
severity: minor
detect: judge
falsePositives:
  - >-
    a single `if` with an `else` where both branches are one or two lines and
    neither is an error path
  - >-
    branches that must run cleanup or logging before returning, where flattening
    would duplicate that code
  - >-
    a `switch` or a chain of `if` returning a value per case, which is already
    flat
jev:
  threshold: 0.48
guide:
  - ts.guard-clauses
---

## Why

Nesting the happy path inside a pyramid of `if` blocks pushes the code the function exists for to the deepest indentation and makes every reader hold the whole condition stack in their head. Checking preconditions first and returning or throwing early keeps the main logic at the top level, reads in the order the cases are decided, and makes each failure case a self-contained line. The result is shorter, flatter, and easier to change.

## Message

nested conditionals wrap the happy path; check preconditions first and return early

## Bad

```ts
// BAD: the update is buried two levels deep under checks that could exit early
async function updateUser(id: string, input: UpdateUserInput): Promise<User> {
	const user = await repository.find(id);
	if (user) {
		if (user.isActive) {
			return repository.update(id, input);
		} else {
			throw new ForbiddenError(`user ${id} is deactivated`);
		}
	} else {
		throw new NotFoundError(`user ${id}`);
	}
}
```

## Good

```ts
async function updateUser(id: string, input: UpdateUserInput): Promise<User> {
	const user = await repository.find(id);

	if (!user) {
		throw new NotFoundError(`user ${id}`);
	}

	if (!user.isActive) {
		throw new ForbiddenError(`user ${id} is deactivated`);
	}

	return repository.update(id, input);
}
```
