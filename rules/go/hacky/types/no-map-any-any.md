---
severity: major
detect: ast
ast:
  rule:
    kind: map_type
    has:
      field: key
      regex: '^(any|interface\{\s*\})$'
guide:
  - go.type-preferences
---

## Why

A map keyed by `any` says nothing about what goes in or comes out, so both the lookup and the value need runtime assertions and a typo in a key type compiles fine. Give the map a concrete key type and, where the values vary, a small interface or a typed union such as a string enum.

## Message

map[any]any is fully untyped; give the map concrete key and value types

## Bad

```go
type Registry struct {
	// BAD: neither keys nor values have a checkable type
	handlers map[any]any
}
```

## Good

```go
type Registry struct {
	handlers map[string]HandlerFunc
}
```
