---
severity: info
detect: judge
falsePositives:
  - parameters or properties that the function or class genuinely mutates
  - builder or accumulator objects whose whole purpose is to be filled in
  - >-
    types generated from a schema or an ORM where the modifier is not under the
    author's control
jev:
  threshold: 0.52
---

## Why

A parameter typed as `T[]` or a property typed without `readonly` invites the next author to push into it or reassign it, and the compiler will let them even when the caller never expected its data to change. `readonly` on arrays and on identity fields such as `id` and `createdAt` documents the intent, rejects the mutation at compile time, and costs nothing at runtime. Data that is meant to be shared is safer when it cannot be edited in place.

## Message

data that is never mutated is typed as mutable; mark it `readonly`

## Bad

```ts
// BAD: nothing stops a caller from reassigning id or pushing into tags
type User = {
	id: string;
	createdAt: Date;
	tags: string[];
};

function tagNames(tags: string[]): string[] {
	return tags.map(tag => tag.toLowerCase());
}
```

## Good

```ts
type User = {
	readonly id: string;
	readonly createdAt: Date;
	readonly tags: readonly string[];
	name: string;
};

function tagNames(tags: readonly string[]): string[] {
	return tags.map(tag => tag.toLowerCase());
}
```
