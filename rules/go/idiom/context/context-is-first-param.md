---
severity: minor
detect: ast
ast:
  rule:
    kind: parameter_declaration
    all:
      - has:
          field: type
          regex: ^context\.Context$
      - inside:
          kind: parameter_list
          inside:
            any:
              - kind: function_declaration
              - kind: method_declaration
              - kind: func_literal
            field: parameters
      - follows:
          kind: parameter_declaration
          stopBy: end
guide:
  - go.context
---

## Why

The context is the first parameter of every function that takes one, named `ctx`, across the standard library and the ecosystem. Putting it anywhere else makes call sites read differently from every other function and is the first thing a reviewer will ask to move.

## Message

context.Context is the first parameter

## Bad

```go
// BAD: context after the id
func (s *Service) Get(id string, ctx context.Context) (*Item, error) {
	return s.repo.Get(ctx, id)
}
```

## Good

```go
func (s *Service) Get(ctx context.Context, id string) (*Item, error) {
	return s.repo.Get(ctx, id)
}
```
