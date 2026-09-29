---
severity: major
detect: ast
ast:
  rule:
    pattern: $X as unknown as $T
guide:
  - ts.boundary-and-domain-contracts
  - ts.typed-values
---

## Why

`x as unknown as T` exists to defeat the one check a single `as` still performs, that the two types overlap. It converts any value into any type with no runtime check and no compiler objection, which is `any` with extra steps. If the value really is a `T`, a type guard or a schema can prove it; if it is not, the cast just moves the crash somewhere harder to debug.

## Message

double assertion through `unknown` bypasses all checking; validate or narrow instead

## Bad

```ts
// BAD: the compiler has been told to accept anything here
const user = row as unknown as User;
```

## Good

```ts
const user = userSchema.parse(row);
```

```ts
if (isUser(row)) {
	return row;
}
```
