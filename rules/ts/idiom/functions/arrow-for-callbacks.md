---
severity: minor
detect: ast
ast:
  rule:
    kind: function_expression
    inside:
      kind: arguments
    not:
      has:
        kind: this
        stopBy: end
guide:
  - ts.function-declarations
---

## Why

A `function` expression passed as a callback carries its own `this`, which is almost never what the surrounding code wants, and the keyword adds noise to what is usually a one-line transform. An arrow keeps the outer `this`, reads as an expression, and is the form every reader expects inside `map`, `filter`, event handlers, and route definitions. Callbacks that deliberately use their own `this`, such as some test framework hooks, are left alone.

## Message

`function` expression as a callback; use an arrow function

## Bad

```ts
// BAD: function expression where an arrow is expected
const activeUsers = users.filter(function (user) {
	return user.isActive;
});
```

## Good

```ts
const activeUsers = users.filter(user => user.isActive);

app.get('/health', (req, res) => res.json({ status: 'ok' }));
```

```ts
describe('parser', function () {
	this.timeout(10_000);
});
```
