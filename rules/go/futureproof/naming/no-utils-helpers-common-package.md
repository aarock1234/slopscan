---
severity: minor
detect: ast
ast:
  rule:
    kind: package_identifier
    regex: ^(utils?|helpers?|common|misc|shared)$
guide:
  - go.package-names
---

## Why

A package called `utils` or `helpers` has no domain, so every unrelated function ends up there and the package grows into a dependency of everything. The name gives the reader no idea what `utils.Process` does or where the next function belongs. Name packages after the concept they own, such as `rotate` or `auth`, and split a grab-bag by what its functions act on.

## Message

package named as a grab-bag; name it after the concept it owns

## Bad

```go
// BAD: no domain, will collect everything
package utils
```

```go
// BAD: no domain, will collect everything
package common
```

## Good

```go
package rotate
```
