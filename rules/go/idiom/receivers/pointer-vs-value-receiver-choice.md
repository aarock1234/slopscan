---
severity: minor
detect: judge
falsePositives:
  - >-
    small immutable value types such as enums and thin wrappers on value
    receivers
  - a type that is deliberately copied on every call and documented as such
  - 'methods on named map, slice, or channel types'
jev:
  threshold: 0.5
---

## Why

A value receiver works on a copy, so a method that assigns to a field on a value receiver silently changes nothing, and a large struct is copied on every call. Use a pointer receiver when the method mutates state or the struct is large; use a value receiver for small immutable types such as a string enum with a `String` method.

## Message

receiver kind does not fit the method: mutation or a large struct needs a pointer receiver

## Bad

```go
type Counter struct {
	n int
}

// BAD: value receiver mutates a copy, so the increment is lost
func (c Counter) Inc() {
	c.n++
}
```

## Good

```go
type Counter struct {
	n int
}

func (c *Counter) Inc() {
	c.n++
}
```

```go
type Status string

func (s Status) String() string {
	return string(s)
}
```
