---
severity: minor
detect: ast
ast:
  rule:
    kind: lexical_declaration
    has:
      kind: variable_declarator
      has:
        kind: arrow_function
        field: value
    inside:
      any:
        - kind: program
        - kind: export_statement
guide:
  - ts.function-declarations
---

## Why

A top-level function written as `const f = () => {}` is not hoisted, so callers above it in the file break, and it reads as a variable holding a value rather than as a unit of the module. A `function` declaration is hoisted, stands out visually, and keeps ordinary binding semantics for `this` and `arguments` should a caller ever need them. The preference is about readable structure and binding, not stack traces: an arrow assigned to a named binding gets that name inferred. Arrows are for callbacks and inline expressions, where lexical `this` and brevity actually help.

## Message

top-level arrow function; use a `function` declaration

## Bad

```ts
// BAD: exported arrow is not hoisted and reads as a variable, not a module function
export const createUser = async (input: CreateUserInput): Promise<User> => {
	return repository.insert(input);
};
```

```ts
// BAD: module-level helper written as an arrow
const toSlug = (title: string) => title.toLowerCase().replaceAll(' ', '-');
```

## Good

```ts
export async function createUser(input: CreateUserInput): Promise<User> {
	return repository.insert(input);
}
```

```ts
function toSlug(title: string): string {
	return title.toLowerCase().replaceAll(' ', '-');
}

export function slugs(titles: readonly string[]): string[] {
	return titles.map(title => toSlug(title));
}
```
