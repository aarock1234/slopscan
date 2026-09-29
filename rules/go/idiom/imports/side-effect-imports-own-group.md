---
severity: minor
detect: ast
ast:
  rule:
    kind: import_declaration
    regex: '\n[ \t]*([^_\s][^\n]*)?"[^"\n]*"[ \t]*(//[^\n]*)?\n[ \t]*_[ \t]+"'
guide:
  - go.import-order
---

## Why

A side-effect import (`_ "project/pkg/log"`) registers something at init time and is easy to miss when it sits inside the internal group, where gofmt sorts it by path. Give side-effect imports their own group after the internal one so the reader sees at a glance which imports exist only for their init.

## Message

side-effect imports go in their own group after the internal imports

## Bad

```go
import (
	"context"
	"fmt"

	"project/pkg/client"
	// BAD: side-effect import glued to the internal group
	_ "project/pkg/log"
)
```

## Good

```go
import (
	"context"
	"fmt"

	"project/pkg/client"

	_ "project/pkg/log"
)
```

```go
import (
	"embed"

	_ "project/pkg/log"
	_ "project/pkg/metrics"
)
```
