---
severity: minor
detect: ast
ast:
  rule:
    kind: parameter_declaration
    regex: ^(this|self)\b
    inside:
      kind: parameter_list
      inside:
        kind: method_declaration
guide:
  - go.receiver-names
---

## Why

Go receivers are ordinary parameters and the convention is a one or two letter abbreviation of the type, used consistently across all methods on that type. `this` and `self` import another language's model and stand out as a tell that the author was not writing Go.

## Message

receiver named this/self; use a short abbreviation of the type

## Bad

```go
// BAD: receiver named like an object-oriented keyword
func (this *Server) Start() error {
	return this.listener.Listen()
}
```

## Good

```go
func (s *Server) Start() error {
	return s.listener.Listen()
}
```
