---
severity: minor
detect: ast
ast:
  rule:
    kind: import_statement
    not:
      any:
        - has:
            kind: import_clause
        - follows:
            kind: comment
        - precedes:
            kind: comment
    precedes:
      kind: import_statement
      stopBy: end
guide:
  - ts.import-order
---

## Why

A side-effect import such as `import './polyfills'` runs code for its effect alone, so it stands apart from the imports that bind names. Placing it last, after a blank line, makes the effect visible instead of burying it among ordinary imports where a reader assumes nothing happens. A polyfill or registration import whose execution order matters, such as an instrumentation hook that must load before everything else, stays where it is: give it a comment saying why, and a commented side-effect import is left alone wherever it sits.

## Message

side-effect import belongs after all named imports, or carries a comment saying why it must run first

## Bad

```ts
// BAD: side-effect import hidden at the top of the list
import './polyfills';
import { z } from 'zod';

import { config } from '@/config';
```

## Good

```ts
import { z } from 'zod';

import { config } from '@/config';

// registers the fetch polyfill for node 18
import './polyfills';
```

```ts
// must load before any other import so the OpenTelemetry hooks are installed
import './instrumentation';
import { z } from 'zod';

import { config } from '@/config';
```
