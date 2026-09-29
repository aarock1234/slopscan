---
severity: minor
detect: ast
ast:
  rule:
    kind: type_assertion_expression
    has:
      field: operand
      regex: ^err$
guide:
  - go.error-types
---

## Why

A type assertion on an error only sees the outermost value, so it stops matching as soon as the error is wrapped with `%w` anywhere below. `errors.AsType` (or `errors.As`) walks the chain and returns the typed error wherever it sits. A type switch on `err.(type)` has the same weakness.

## Message

type assertion on err misses wrapped errors; use errors.AsType or errors.As

## Bad

```go
func field(err error) string {
	// BAD: assertion only sees the outermost error
	if ve, ok := err.(*ValidationError); ok {
		return ve.Field
	}

	return ""
}
```

## Good

```go
func field(err error) string {
	if ve, ok := errors.AsType[*ValidationError](err); ok {
		return ve.Field
	}

	return ""
}
```

```go
func field(err error) string {
	var ve *ValidationError
	if errors.As(err, &ve) {
		return ve.Field
	}

	return ""
}
```
