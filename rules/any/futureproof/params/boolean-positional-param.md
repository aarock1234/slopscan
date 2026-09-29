---
severity: minor
detect: ast
ast:
  ts:
    utils:
      param:
        any:
          - kind: required_parameter
          - kind: optional_parameter
    rule:
      matches: param
      any:
        - has:
            kind: type_annotation
            has:
              kind: predefined_type
              regex: ^boolean$
        - all:
            - not:
                has:
                  kind: type_annotation
            - has:
                field: value
                any:
                  - kind: 'true'
                  - kind: 'false'
      all:
        - any:
            - follows:
                matches: param
                stopBy: end
            - precedes:
                matches: param
                stopBy: end
  go:
    rule:
      kind: parameter_declaration
      has:
        field: type
        regex: ^bool$
      inside:
        kind: parameter_list
        not:
          follows:
            kind: parameter_list
      any:
        - follows:
            kind: parameter_declaration
            stopBy: end
        - precedes:
            kind: parameter_declaration
            stopBy: end
ignore:
  - '**/*.test.ts'
  - '**/*.spec.ts'
  - '**/*_test.go'
guide:
  - go.function-boundaries
  - ts.options
  - ts.readability-and-abstraction-decisions
---

## Why

A boolean argument reads as `render(user, true)` at the call site, so every reader has to open the definition to learn what `true` means, and the second flag turns the function into four functions in a trench coat. Callers cannot add a third mode without touching every existing call. Take an options object or struct with named fields, or split the function into two named behaviors.

## Message

boolean positional parameter; use an options object or two functions

## Bad

```ts
// BAD: render(user, true) says nothing at the call site
export function render(user: User, compact: boolean): string {
	return compact ? user.name : `${user.name} <${user.email}>`;
}
```

```go
// BAD: Render(user, true) says nothing at the call site
func Render(user User, compact bool) string {
	if compact {
		return user.Name
	}

	return user.Name + " <" + user.Email + ">"
}
```

## Good

```ts
type RenderOptions = {
	compact?: boolean;
};

export function render(user: User, options: RenderOptions = {}): string {
	return options.compact ? user.name : `${user.name} <${user.email}>`;
}
```

```ts
export function renderCompact(user: User): string {
	return user.name;
}

export function renderFull(user: User): string {
	return `${user.name} <${user.email}>`;
}
```

```go
type RenderOptions struct {
	Compact bool
}

func Render(user User, opts RenderOptions) string {
	if opts.Compact {
		return user.Name
	}

	return user.Name + " <" + user.Email + ">"
}
```

```go
func IsAdmin(user User) bool {
	return user.Role == RoleAdmin
}
```
