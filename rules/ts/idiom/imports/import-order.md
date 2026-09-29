---
severity: minor
detect: ast
ast:
  rule:
    kind: import_statement
    any:
      - has:
          field: source
          regex: ^.\.
        precedes:
          kind: import_statement
          stopBy: end
          has:
            field: source
            regex: '^.[^.]'
      - has:
          field: source
          regex: ^.@/
        precedes:
          kind: import_statement
          stopBy: end
          has:
            field: source
            regex: '^.[^.]'
          not:
            has:
              field: source
              regex: ^.@/
      - has:
          field: source
          regex: '^.[^.]'
        not:
          has:
            field: source
            regex: '^.(@/|node:)'
        precedes:
          kind: import_statement
          stopBy: end
          has:
            field: source
            regex: '^.node:'
guide:
  - ts.import-order
---

## Why

Imports come in four groups, `node:` builtins, then external packages, then internal `@/` modules, then relative paths, with a blank line between groups and empty groups omitted. A reader scans the top of a file to learn what it depends on, and a fixed order makes runtime, external, and local coupling visible at a glance. Mixed groups force a line-by-line read and produce noisy diffs when imports are added.

## Message

imports out of order; `node:` builtins, then external packages, then `@/` modules, then relative paths

## Bad

```ts
// BAD: relative import placed before an external package
import { formatDate } from './format';
import { z } from 'zod';
```

```ts
import { z } from 'zod';
// BAD: internal module placed before an external package
import { config } from '@/config';
import { PrismaClient } from '@prisma/client';
```

```ts
// BAD: external package placed before a node builtin
import { z } from 'zod';
import { readFile } from 'node:fs/promises';
```

## Good

```ts
import { readFile } from 'node:fs/promises';

import { PrismaClient } from '@prisma/client';
import { z } from 'zod';

import { config } from '@/config';
import { logger } from '@/lib/logger';

import { formatDate } from './format';
import type { User } from './user';
```
