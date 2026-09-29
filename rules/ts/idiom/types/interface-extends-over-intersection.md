---
severity: info
detect: judge
falsePositives:
  - >-
    intersections in generic constraints such as `T extends Identifiable &
    Timestamped`
  - 'branded types of the form `T & { readonly __brand: B }`'
  - 'intersections with a union or a mapped type, which `extends` cannot express'
  - >-
    an intersection of two object literals that is used once and never extended
    again
jev:
  threshold: 0.5
---

## Why

Extending a named object shape with `type Admin = User & { role: 'admin' }` is checked lazily on every use, and when two members conflict the intersection silently becomes `never` for that property instead of an error at the declaration. `interface Admin extends User` is checked once, rejects conflicting members where they are declared, and gives shorter error messages that name the interface rather than expanding the whole intersection. Intersections are for unions, brands, and generic constraints.

## Message

object shape extended with an intersection; use `interface extends`

## Bad

```ts
// BAD: extending a named object shape through an intersection
type Admin = User & {
	role: 'admin';
	permissions: readonly string[];
};
```

## Good

```ts
interface Admin extends User {
	role: 'admin';
	permissions: readonly string[];
}
```

```ts
type UserId = string & { readonly __brand: 'UserId' };

function sortByCreation<T extends Identifiable & Timestamped>(items: readonly T[]): T[] {
	return [...items].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
}
```
