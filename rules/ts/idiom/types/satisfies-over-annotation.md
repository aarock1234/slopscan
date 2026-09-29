---
severity: minor
detect: ast
ast:
  rule:
    pattern: 'const $NAME: Record<$K, $V> = $OBJ'
  constraints:
    OBJ:
      kind: object
guide:
  - ts.satisfies
---

## Why

Annotating an object literal with `Record<string, T>` throws away the keys the literal actually has, so `config.typo` compiles and every value is widened to `T`. `satisfies Record<string, T>` runs the same check while keeping the literal keys and values, so a misspelled key is an error and `keyof typeof config` is a useful union. The annotation form is only right when the object is genuinely open-ended.

## Message

object literal annotated with `Record` loses its keys; use `satisfies`

## Bad

```ts
// BAD: the keys are gone and any string indexes without error
const routes: Record<string, string> = {
	home: '/',
	users: '/users',
};
```

## Good

```ts
const routes = {
	home: '/',
	users: '/users',
} satisfies Record<string, string>;

type RouteKey = keyof typeof routes;
```

```ts
const cache: Record<string, User> = await loadCache();
```
