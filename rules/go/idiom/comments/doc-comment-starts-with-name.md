---
severity: info
detect: judge
falsePositives:
  - 'a package comment, which starts with "Package name"'
  - 'a deprecation notice starting with "Deprecated:"'
  - a comment on a declaration inside a grouped var or const block
jev:
  threshold: 0.56
guide:
  - go.doc-comments
---

## Why

A doc comment begins with the name it documents and reads as a complete sentence: `// Process validates and persists the item.` That form is what `go doc` and editors index, and it keeps the comment attached to the thing it describes when the file is skimmed. A comment that opens with "This function" or a bare description does not identify its subject.

## Message

doc comment does not start with the name it documents

## Bad

```go
// BAD: doc comment does not begin with the name it documents
// This function validates and persists the item.
func Process(ctx context.Context, item Item) error {
	return nil
}
```

## Good

```go
// Process validates and persists item. It returns an error if the item
// fails validation or cannot be saved.
func Process(ctx context.Context, item Item) error {
	return nil
}
```
