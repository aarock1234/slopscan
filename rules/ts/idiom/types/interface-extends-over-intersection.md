---
severity: info
detect: judge
falsePositives:
  - >-
    a single-level extension of one named shape, such as `type Admin = User & {
    role: 'admin' }`, which stays readable and is not what the guide's
    performance note is about
  - >-
    intersections in generic constraints such as `T extends Identifiable &
    Timestamped`
  - 'branded types of the form `T & { readonly __brand: B }`'
  - 'intersections with a union or a mapped type, which `extends` cannot express'
  - >-
    an intersection of two object literals that is used once and never extended
    again
guide:
  - ts.interface-or-type
jev:
  threshold: 0.5
---

## Why

For a complex object-extension hierarchy, several named shapes each layered on the last, `interface extends` gives clearer diagnostics and better checker behavior than stacked intersections: it is checked once, rejects conflicting members where they are declared, and its error messages name the interface instead of expanding the whole intersection. Keep simple types readable and investigate actual checker bottlenecks before rewriting an established model; a single `User & { role: 'admin' }` is fine. Intersections are for unions, brands, and generic constraints.

## Message

multi-level object hierarchy built from intersections; use `interface extends`

## Bad

```ts
// BAD: three levels of named shapes stacked as intersections
type Entity = { id: string } & Timestamped;
type Account = Entity & { email: string } & Auditable;
type Admin = Account & {
	role: 'admin';
	permissions: readonly string[];
};
```

## Good

```ts
interface Entity extends Timestamped {
	id: string;
}

interface Account extends Entity, Auditable {
	email: string;
}

interface Admin extends Account {
	role: 'admin';
	permissions: readonly string[];
}
```

```ts
type Admin = User & {
	role: 'admin';
};
```

```ts
type UserId = string & { readonly __brand: 'UserId' };

function sortByCreation<T extends Identifiable & Timestamped>(items: readonly T[]): T[] {
	return [...items].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
}
```
