---
severity: minor
detect: ast
ast:
  rule:
    any:
      - kind: if_statement
        not:
          has:
            field: consequence
            kind: statement_block
      - kind: else_clause
        not:
          has:
            any:
              - kind: statement_block
              - kind: if_statement
guide:
  - ts.guard-clauses
---

## Why

A braceless `if (x) return;` works until someone adds a second statement under it and only the first one stays conditional. Braces make the body a visible block, keep the diff small when a line is added, and remove a whole class of indentation bugs. The two extra characters cost nothing to read.

## Message

braceless `if` body; wrap it in a block

## Bad

```ts
// BAD: a second statement added here would run unconditionally
if (!user) return undefined;
```

```ts
if (user.isActive) {
	activate(user);
// BAD: braceless else body
} else deactivate(user);
```

## Good

```ts
if (!user) {
	return undefined;
}

if (user.isActive) {
	activate(user);
} else if (user.isPending) {
	remind(user);
} else {
	deactivate(user);
}
```
