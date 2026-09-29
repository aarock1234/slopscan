---
severity: info
detect: judge
falsePositives:
  - >-
    multi-method interfaces, which are named for the role they play (Repository,
    Storage)
  - a method name that does not form a natural er noun
  - a name that matches an existing standard library interface
jev:
  threshold: 0.5
guide:
  - go.naming
---

## Why

A single-method interface is named for the action with an `er` suffix: `Reader`, `Processor`, `Saver`. The name then states the capability, reads naturally at the call site, and matches how the standard library names the same shapes. Names like `IStorage` or `StorageInterface` import other languages' conventions and say nothing about what the value can do.

## Message

single-method interface is named for its action with an er suffix

## Bad

```go
// BAD: single-method interface named like a class instead of a capability
type IStorage interface {
	Save(ctx context.Context, item Item) error
}
```

## Good

```go
type Saver interface {
	Save(ctx context.Context, item Item) error
}
```
