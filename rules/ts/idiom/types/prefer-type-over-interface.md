---
severity: minor
detect: ast
ast:
  rule:
    kind: interface_declaration
    not:
      any:
        - has:
            kind: extends_type_clause
        - inside:
            kind: ambient_declaration
            stopBy: end
        - has:
            kind: interface_body
            has:
              kind: method_signature
        - all:
            - any:
                - pattern: interface $NAME { $$$BODY }
                - pattern: interface $NAME<$$$PARAMS> { $$$BODY }
            - inside:
                kind: program
                stopBy: end
                has:
                  stopBy: end
                  kind: implements_clause
                  has:
                    any:
                      - kind: type_identifier
                        pattern: $NAME
                      - kind: generic_type
                        has:
                          kind: type_identifier
                          pattern: $NAME
guide:
  - ts.interface-or-type
---

## Why

A plain data shape is a `type`: it composes with unions, intersections, mapped types, and `z.infer` in one syntax, and it cannot be silently reopened by declaration merging somewhere else in the program. `interface` earns its place when you extend another shape, define a contract that classes implement, or deliberately augment a global. An interface with only properties and no `extends` is a `type` with an extra way to go wrong. The guide calls this a convention with contextual exceptions: an interface that a class in the same file `implements` is a class contract and is left alone even when it has only properties, though a `type` would serve there too.

## Message

plain data shape declared as `interface`; use `type`

## Bad

```ts
// BAD: a data shape that gains nothing from being an interface
interface User {
	id: string;
	name: string;
}
```

## Good

```ts
type User = {
	id: string;
	name: string;
};
```

```ts
interface Admin extends User {
	role: 'admin';
}

interface Repository<T> {
	findById(id: string): Promise<T | undefined>;
	save(item: T): Promise<void>;
}
```

```ts
interface Clock {
	readonly now: () => Date;
}

class SystemClock implements Clock {
	now = (): Date => new Date();
}
```

```ts
declare global {
	interface Window {
		analytics: Analytics;
	}
}
```
