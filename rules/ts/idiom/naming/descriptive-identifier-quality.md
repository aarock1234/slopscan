---
severity: minor
detect: judge
falsePositives:
  - >-
    conventional short names in tiny scopes, such as `i` in a counting loop, `e`
    in a catch, `x` in a one-line arrow, or `T` as a type parameter
  - >-
    domain abbreviations that are standard in the codebase, such as `db`, `req`,
    `res`, `ctx`, `id`, or `url`
  - names that match an external API or schema field the code has to mirror
jev:
  threshold: 0.42
---

## Why

An identifier is read far more often than it is written, and a name like `data`, `tmp`, `res2`, or `handleStuff` tells the reader nothing they did not already know from the type. Good names say what the value is or what the function does, so the surrounding code needs fewer comments and a wrong assumption is caught on sight. Length is not the goal; precision is, and a short name in a short scope is fine.

## Message

identifier does not describe what it holds or does; use a descriptive name

## Bad

```ts
// BAD: data, res, and tmp say nothing about what they hold
async function process(data: string): Promise<string[]> {
	const res = await fetchRows(data);
	const tmp = res.filter(r => r.active);

	return tmp.map(t => t.id);
}
```

```ts
// BAD: a numbered copy of a name is a sign the first name was wrong
const user2 = await repository.find(managerId);
```

## Good

```ts
async function activeRowIds(tableName: string): Promise<string[]> {
	const rows = await fetchRows(tableName);
	const activeRows = rows.filter(row => row.active);

	return activeRows.map(row => row.id);
}
```

```ts
const manager = await repository.find(managerId);
```
