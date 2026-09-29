---
severity: info
detect: ast
ast:
  rule:
    kind: composite_literal
    regex: '^[^\n]*$'
    all:
      - has:
          field: type
          any:
            - kind: type_identifier
            - kind: qualified_type
            - kind: generic_type
      - has:
          field: body
          has:
            kind: keyed_element
            precedes:
              kind: keyed_element
              stopBy: end
guide:
  - go.struct-literals
---

## Why

A struct literal with two or more fields goes one field per line, so gofmt aligns the values and a later field is a one-line diff instead of a rewrite of the whole literal. A single field can stay inline.

## Message

struct literal with several fields goes one field per line

## Bad

```go
func build() Item {
	// BAD: several fields crammed on one line
	return Item{ID: "abc", Name: "example"}
}
```

## Good

```go
func build() Item {
	return Item{
		ID:   "abc",
		Name: "example",
	}
}
```

```go
func build() Item {
	return Item{ID: "abc"}
}
```
