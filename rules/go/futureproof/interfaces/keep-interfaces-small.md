---
severity: minor
detect: ast
ast:
  rule:
    kind: interface_type
    has:
      kind: method_elem
      nthChild:
        position: 5
        ofRule:
          kind: method_elem
guide:
  - go.consumer-interfaces
  - go.interface-composition
  - go.philosophy
---

## Why

Every method on an interface is a method every implementation and every test double must provide, so a five-method interface makes the next fake and the next adapter five times the work of a one-method one. Small interfaces compose: declare `Reader` and `Writer` and embed them into `ReadWriter` where a consumer needs both.

## Message

interface with five or more methods; split it and compose smaller interfaces

## Bad

```go
// BAD: every fake and adapter must implement all of these
type Storage interface {
	Get(ctx context.Context, id string) ([]byte, error)
	Put(ctx context.Context, id string, data []byte) error
	Delete(ctx context.Context, id string) error
	List(ctx context.Context, prefix string) ([]string, error)
	Stat(ctx context.Context, id string) (Info, error)
}
```

## Good

```go
type Reader interface {
	Get(ctx context.Context, id string) ([]byte, error)
	List(ctx context.Context, prefix string) ([]string, error)
}

type Writer interface {
	Put(ctx context.Context, id string, data []byte) error
	Delete(ctx context.Context, id string) error
}

type ReadWriter interface {
	Reader
	Writer
}
```
