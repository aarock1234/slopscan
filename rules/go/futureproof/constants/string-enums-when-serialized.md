---
severity: minor
detect: judge
falsePositives:
  - >-
    an enum that never leaves the process (not stored, logged, or sent on the
    wire)
  - 'protobuf or database enums with a fixed, documented numbering'
  - >-
    a hot path where the integer is a deliberate optimization and a String
    method covers logs
jev:
  threshold: 0.5
guide:
  - go.constants
---

## Why

An `iota` enum that is stored, logged, or sent over the wire serializes as a bare number, so inserting a constant renumbers everything that was already saved and a log line shows `status=2` to whoever is debugging it. Back an enum that crosses a boundary with a string; the value stays stable when the list changes and is readable everywhere it appears.

## Message

iota enum is serialized as a bare integer; back it with a string

## Bad

```go
type Status int

const (
	StatusPending Status = iota
	StatusCompleted
)

type Item struct {
	// BAD: inserting a constant above StatusCompleted changes every stored record
	Status Status `json:"status"`
}
```

## Good

```go
type Status string

const (
	StatusPending   Status = "pending"
	StatusCompleted Status = "completed"
)

type Item struct {
	Status Status `json:"status"`
}
```
