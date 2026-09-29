---
severity: minor
detect: ast
ignore:
  - '**/app/**'
  - '**/pages/**'
ast:
  rule:
    kind: function_declaration
    inside:
      kind: export_statement
    not:
      has:
        field: return_type
        regex: .
guide:
  - ts.return-types
---

## Why

An exported function is a contract, and an inferred return type lets that contract drift silently: a change deep in the body widens or narrows the type and the error surfaces at some distant call site instead of at the definition. Writing the return type pins the contract, produces errors where the change was made, and documents the function without a comment. Internal helpers and callbacks can keep inference where the type is obvious. Framework-managed files under `app/` and `pages/`, whose component signatures the framework owns, are excluded.

## Message

exported function has no return type; declare it so the contract cannot drift

## Bad

```ts
// BAD: the return type is whatever the body happens to produce today
export async function getUser(id: string) {
	return repository.find(id);
}
```

## Good

```ts
export async function getUser(id: string): Promise<User | undefined> {
	return repository.find(id);
}
```

```ts
function buildWhere(filters: Filters) {
	return {
		...(filters.status && { status: filters.status }),
	};
}

export function listUsers(filters: Filters): Promise<User[]> {
	return repository.findMany(buildWhere(filters));
}
```
