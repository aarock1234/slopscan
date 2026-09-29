---
severity: minor
detect: ast
ast:
  rule:
    kind: package_identifier
    regex: '[A-Z_]'
    not:
      regex: '^[a-z0-9]+_test$'
guide:
  - go.naming
  - go.package-names
---

## Why

A package name is typed at every call site, so it is short, lowercase, and a single word: `rotate`, `auth`, `client`. Mixed case or underscores in a package name break that rhythm, and the Go toolchain and most linters assume the lowercase form. Only the `_test` suffix on an external test package is conventional.

## Message

package names are one short lowercase word

## Bad

```go
// BAD: mixed case package name
package httpHelpers
```

```go
// BAD: underscore in package name
package user_service
```

## Good

```go
package client
```

```go
package client_test
```
