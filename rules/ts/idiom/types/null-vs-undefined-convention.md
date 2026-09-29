---
severity: info
detect: judge
falsePositives:
  - >-
    values that come from an external API, database column, or library that
    itself uses `null`, where mirroring it is the honest type
  - React state initialized with `null` to mean not yet loaded or no selection
  - 'optional properties declared with `?`, which are `undefined` by definition'
jev:
  threshold: 0.5
---

## Why

`undefined` is what the language produces for structural absence: a missing property, a `Map.get` miss, an `Array.find` with no hit. `null` is a value a developer chooses to mean "explicitly nothing", such as no selection or no error. Returning `null` from a lookup, or writing `foo: string | undefined` where the author means a deliberate empty state, mixes the two and makes callers check for both.

## Message

null and undefined used interchangeably; undefined for absence, null for a deliberate empty value

## Bad

```ts
// BAD: a lookup miss is structural absence, which the language already spells undefined
function findUser(id: string): User | null {
	const user = users.get(id);

	return user === undefined ? null : user;
}
```

## Good

```ts
function findUser(id: string): User | undefined {
	return users.get(id);
}
```

```ts
type Form = {
	selectedUser: User | null;
};

const [error, setError] = useState<string | null>(null);
```
