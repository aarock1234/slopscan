---
severity: minor
detect: judge
falsePositives:
  - generated code
  - >-
    a method that must have a value receiver to satisfy an interface on the
    value type, with a comment saying so
jev:
  threshold: 0.5
---

## Why

When some methods on a type use a pointer receiver and others a value receiver, the method set differs between `T` and `*T`, so whether a value satisfies an interface depends on how it was declared, and a reader cannot tell from one method whether calls see shared state. If any method needs a pointer receiver, give every method on that type a pointer receiver.

## Message

type mixes pointer and value receivers; use one kind for every method

## Bad

```go
func (s *Service) Process(ctx context.Context, id string) error {
	return nil
}

// BAD: value receiver on a type that already uses pointer receivers
func (s Service) Name() string {
	return s.name
}
```

## Good

```go
func (s *Service) Process(ctx context.Context, id string) error {
	return nil
}

func (s *Service) Name() string {
	return s.name
}
```
