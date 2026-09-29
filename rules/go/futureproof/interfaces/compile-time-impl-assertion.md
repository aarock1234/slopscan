---
severity: info
detect: judge
falsePositives:
  - >-
    the type is passed to a function taking the interface in the same package,
    which already checks it
  - an unexported helper type with a single local use
  - the interface is not known to the implementing package
jev:
  threshold: 0.49
---

## Why

A type that is meant to satisfy an interface but never checked against it breaks only at the distant call site that first assigns it, and the compiler error points there instead of at the missing method. `var _ Repository = (*PgRepo)(nil)` next to the type turns that into an error on the type itself the moment the interface changes.

## Message

type meant to satisfy an interface is not checked; add var _ Iface = (*T)(nil)

## Bad

```go
type PgRepo struct {
	db *sql.DB
}

// BAD: nothing checks PgRepo against Repository until a distant caller fails to compile
func (r *PgRepo) Get(ctx context.Context, id string) (*Item, error) {
	return nil, nil
}
```

## Good

```go
type PgRepo struct {
	db *sql.DB
}

var _ Repository = (*PgRepo)(nil)

func (r *PgRepo) Get(ctx context.Context, id string) (*Item, error) {
	return nil, nil
}
```
