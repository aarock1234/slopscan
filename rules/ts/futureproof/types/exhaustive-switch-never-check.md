---
severity: minor
detect: judge
falsePositives:
  - >-
    switches over open types such as `string` or `number`, where a default
    branch is the only way to finish
  - >-
    a switch whose default already assigns the value to `never` or calls an
    `assertNever` helper
  - >-
    a switch that intentionally handles a subset and falls through to shared
    behavior for everything else
jev:
  threshold: 0.49
---

## Why

A switch over a union or a const-object type with a plain `default` keeps compiling when a new variant is added, so the new case silently takes the default path at runtime. Assigning the switched value to `never` in the default branch makes the compiler reject any switch that forgot a case, turning a production bug into a build error at the moment the variant is introduced. The same applies to `if` chains that end in an unconditional fallback.

## Message

switch over a union without a `never` check; new variants will fall through silently

## Bad

```ts
function label(status: Status): string {
	switch (status) {
		case Status.PENDING:
			return 'waiting';
		case Status.ACTIVE:
			return 'running';
		// BAD: adding Status.CANCELLED compiles and returns 'done'
		default:
			return 'done';
	}
}
```

## Good

```ts
function label(status: Status): string {
	switch (status) {
		case Status.PENDING:
			return 'waiting';
		case Status.ACTIVE:
			return 'running';
		case Status.COMPLETED:
			return 'done';
		default: {
			const exhaustive: never = status;

			throw new Error(`unhandled status: ${String(exhaustive)}`);
		}
	}
}
```
