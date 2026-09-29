---
severity: minor
detect: judge
falsePositives:
  - a factory that picks among several implementations at runtime
  - >-
    returning error or a standard interface such as io.Reader where the concrete
    type is an implementation detail
  - a parameter that needs unexported fields of the concrete type
jev:
  threshold: 0.45
guide:
  - go.consumer-interfaces
---

## Why

A function that accepts an interface can be called with any implementation and any test double, while a function that returns its concrete type lets the caller use every method and field and decide for itself which interface to view it through. Returning an interface from a constructor hides the type for no gain and forces an assertion on anyone who needs more than the interface offers.

## Message

accept interfaces and return concrete types

## Bad

```go
// BAD: constructor hides the concrete type behind an interface
func New(db *sql.DB) Repository {
	return &PgRepo{db: db}
}
```

## Good

```go
func New(db *sql.DB) *PgRepo {
	return &PgRepo{db: db}
}
```

```go
func NewService(repo Repository) *Service {
	return &Service{repo: repo}
}
```
