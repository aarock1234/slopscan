---
severity: minor
detect: ast
ast:
  rule:
    kind: binary_expression
    all:
      - has:
          field: operator
          regex: ^\+$
      - has:
          kind: string
    not:
      inside:
        kind: augmented_assignment_expression
guide:
  - ts.template-literals
---

## Why

Building a string with `+` scatters the literal parts and the values across quotes and operators, so the reader has to reassemble the final shape in their head and a missing space or quote is easy to miss. A template literal shows the string as it will appear with the values slotted in place. Incremental building in a loop with `+=` is a different pattern and is left alone.

## Message

string built with `+`; use a template literal

## Bad

```ts
// BAD: the final shape is spread across three fragments and two operators
const greeting = 'hello, ' + name + '!';
```

```ts
// BAD: path assembled by concatenation
const url = baseUrl + '/users/' + userId + '/posts';
```

## Good

```ts
const greeting = `hello, ${name}!`;
const url = `${baseUrl}/users/${userId}/posts`;
```

```ts
let csv = '';

for (const row of rows) {
	csv += row.join(',') + '\n';
}
```
