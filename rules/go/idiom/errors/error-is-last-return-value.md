---
severity: minor
detect: ast
ast:
  rule:
    kind: parameter_declaration
    all:
      - has:
          field: type
          regex: ^error$
      - inside:
          kind: parameter_list
          inside:
            any:
              - kind: function_declaration
              - kind: method_declaration
              - kind: func_literal
            field: result
      - precedes:
          kind: parameter_declaration
          stopBy: end
guide:
  - go.error-propagation
---

## Why

Every Go API returns the error last, so `value, err := f()` is muscle memory for the reader. An error in any other position forces callers to look up the signature, and the mismatch shows up as swapped variables at the call site.

## Message

error is the last return value

## Bad

```go
// BAD: error before the value
func load(path string) (error, []byte) {
	return nil, nil
}
```

## Good

```go
func load(path string) ([]byte, error) {
	return nil, nil
}
```

```go
func load(path string) (data []byte, err error) {
	return nil, nil
}
```
