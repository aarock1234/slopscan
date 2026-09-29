---
severity: minor
detect: judge
falsePositives:
  - >-
    imports whose binding is used as a runtime value anywhere in the file,
    including in `instanceof`, `typeof`, decorators, or `satisfies`
  - imports of a const object that doubles as a type through `typeof`
  - >-
    files where every import in the statement is already marked with an inline
    `type` modifier
jev:
  threshold: 0.45
guide:
  - ts.import-order
---

## Why

A binding that is only ever used in type positions should be imported with `import type`, which is erased at compile time. A plain import of a type keeps a runtime dependency on the module, can drag a circular import into existence, and hides from the reader that nothing from that module runs. The distinction is cheap to write and tells the next person exactly what the file needs at runtime.

## Message

import is only used as a type; use `import type`

## Bad

```ts
// BAD: User is only used in a type annotation
import { User } from './user';

export function displayName(user: User): string {
	return user.name;
}
```

## Good

```ts
import type { User } from './user';

export function displayName(user: User): string {
	return user.name;
}
```

```ts
import { UserService } from './user.service';
import type { User } from './user';

export function build(): UserService {
	return new UserService();
}

export function displayName(user: User): string {
	return user.name;
}
```
