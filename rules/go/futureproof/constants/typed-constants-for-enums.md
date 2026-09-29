---
severity: minor
detect: judge
falsePositives:
  - >-
    unrelated constants grouped for convenience, such as defaults or
    configuration keys
  - a single constant
  - >-
    values only ever used as map keys or labels, never as a parameter or field
    type
jev:
  threshold: 0.51
---

## Why

A set of untyped string or int constants that stand for the states of one thing is an enum without a type, so any string is accepted where a status is expected and a typo compiles. Declare a named type and make the constants that type; the compiler then rejects a raw value and a `String` or `MarshalText` method has a type to hang on.

## Message

related constants form an enum but have no named type; declare one

## Bad

```go
// BAD: untyped strings, so any string passes where a status is expected
const (
	StatusPending   = "pending"
	StatusCompleted = "completed"
)

func Transition(status string) error {
	return nil
}
```

## Good

```go
type Status string

const (
	StatusPending   Status = "pending"
	StatusCompleted Status = "completed"
)

func Transition(status Status) error {
	return nil
}
```
