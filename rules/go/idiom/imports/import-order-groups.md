---
severity: minor
detect: judge
falsePositives:
  - a file with a single import or a single group
  - generated code
  - an import block the diff did not touch
guide:
  - go.import-order
---

## Why

Imports read as four groups separated by blank lines: standard library, external modules, this module's own packages, and side-effect imports. gofmt only sorts within a group, so an import dropped into the wrong group stays there and the reader has to scan every line to learn what the file depends on. Keep the groups in that order with one blank line between each.

## Message

imports are grouped stdlib, external, internal, side-effect with a blank line between groups

## Bad

```go
import (
	"context"
	// BAD: external module mixed into the stdlib group
	"github.com/google/uuid"
	"fmt"

	"project/pkg/client"
)
```

## Good

```go
import (
	"context"
	"fmt"

	"github.com/google/uuid"

	"project/pkg/client"
)
```
