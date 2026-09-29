---
severity: minor
detect: ast
ast:
  rule:
    kind: parameter_declaration
    all:
      - inside:
          kind: parameter_list
          inside:
            kind: method_declaration
            field: receiver
      - has:
          field: name
          regex: '^[a-zA-Z_]\w{2,}$'
          not:
            regex: ^(this|self)$
guide:
  - go.receiver-names
---

## Why

A receiver is named with one or two letters abbreviating the type, `s` for `Service`, `c` for `Client`, and the same letters on every method of that type. A long receiver name such as `service` reads like a parameter and pushes the method body to the right on every line that touches it.

## Message

receiver name longer than two letters; use a short abbreviation of the type

## Bad

```go
// BAD: receiver named like a parameter
func (service *Service) Get(ctx context.Context, id string) (*Item, error) {
	return service.repo.Get(ctx, id)
}
```

## Good

```go
func (s *Service) Get(ctx context.Context, id string) (*Item, error) {
	return s.repo.Get(ctx, id)
}
```
