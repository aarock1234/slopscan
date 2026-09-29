---
severity: major
detect: ast
ast:
  rule:
    kind: field_declaration
    has:
      field: type
      regex: ^context\.Context$
guide:
  - go.context
---

## Why

A context stored in a struct is captured once at construction and then reused by every method call, so cancellation and deadlines belong to the wrong request and the value never expires. Contexts are per call: pass `ctx` as the first parameter of each method that needs it. The one exception is an adapter forced to implement a fixed external method signature that has no context parameter; it may hold a narrowly scoped context field, with its lifetime documented on the field, and that exception does not extend to ordinary services.

## Message

context stored in a struct outlives the request it belongs to; pass ctx per call

## Bad

```go
type Service struct {
	// BAD: captured once, reused by every call
	ctx  context.Context
	repo Repository
}

func (s *Service) Get(id string) (*Item, error) {
	return s.repo.Get(s.ctx, id)
}
```

## Good

```go
type Service struct {
	repo Repository
}

func (s *Service) Get(ctx context.Context, id string) (*Item, error) {
	return s.repo.Get(ctx, id)
}
```
