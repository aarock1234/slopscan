---
severity: minor
detect: judge
falsePositives:
  - a name that only coincidentally shares a prefix with the package
  - exported names in package main
  - a name that would become a keyword or ambiguous when the prefix is dropped
jev:
  threshold: 0.44
---

## Why

The package name is read together with every export, so `rotate.FileRotator` and `auth.AuthToken` say the same word twice at every call site. Let the package carry the context and name the export for what remains: `rotate.File`, `auth.Token`. This is also why a package's primary constructor is plain `New`.

## Message

exported name repeats the package name; let the package carry the context

## Bad

```go
package rotate

// BAD: rotate.FileRotator repeats the package name
type FileRotator struct {
	path string
}
```

## Good

```go
package rotate

type File struct {
	path string
}
```
