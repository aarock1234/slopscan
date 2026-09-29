---
severity: minor
detect: judge
falsePositives:
  - a collection that genuinely mixes unrelated types
  - >-
    an interface used only for behavior, with no assertion back to a concrete
    type
  - the caller never needs the concrete type again
jev:
  threshold: 0.46
---

## Why

Returning an interface or `any` from a lookup and letting callers type-assert back to what they put in moves a compile-time fact to a runtime check at every call site. A type parameter keeps the caller's concrete type through the function, so the assertion and its failure branch disappear and adding a new element type needs no new code.

## Message

interface plus assertions where a type parameter would keep the caller's type

## Bad

```go
type HasID interface {
	GetID() string
}

// BAD: callers get an interface back and must assert to recover their own type
func FindItem(items []HasID, id string) HasID {
	for _, item := range items {
		if item.GetID() == id {
			return item
		}
	}

	return nil
}
```

## Good

```go
type HasID interface {
	GetID() string
}

func FindItem[T HasID](items []T, id string) (T, bool) {
	for _, item := range items {
		if item.GetID() == id {
			return item, true
		}
	}

	var zero T

	return zero, false
}
```
