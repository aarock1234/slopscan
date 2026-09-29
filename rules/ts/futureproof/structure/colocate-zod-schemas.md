---
severity: info
detect: judge
falsePositives:
  - >-
    a schema shared by several modules and placed in a module named for the
    domain concept it describes, such as `user.schema.ts` next to
    `user.service.ts`
  - >-
    schemas that are the public contract of a package and are grouped
    deliberately for export
  - >-
    a schema moved into its own file because it is large, when it stays in the
    same feature directory
jev:
  threshold: 0.8
---

## Why

A Zod schema is the definition of a shape the code around it consumes, so when it lives in a distant `schemas/` or `types.ts` dump the reader has to jump files to learn what a function accepts, and changes to the consumer and the schema land in different places. Keep the schema next to the code that parses with it and derive the type from it there. A shared schema belongs with the domain module it describes, not in a catch-all.

## Message

schema lives away from the code that uses it; colocate it with its consumer

## Bad

```ts
// BAD: the request schema lives in a distant catch-all module
import { createUserSchema } from '@/schemas';

export async function handleCreateUser(req: Request, res: Response): Promise<void> {
	const input = createUserSchema.parse(req.body);

	res.json(await createUser(input));
}
```

## Good

```ts
const createUserSchema = z.object({
	name: z.string().min(1),
	email: z.string().email(),
});

type CreateUserInput = z.infer<typeof createUserSchema>;

export async function handleCreateUser(req: Request, res: Response): Promise<void> {
	const input = createUserSchema.parse(req.body);

	res.json(await createUser(input));
}
```

```ts
// the schema is the shared contract of a domain module, imported from where that concept lives
import { gradingSourceSchema } from '@acme/types/grading-source';
import type { GradingSource } from '@acme/types/grading-source';

export function readGradingSource(input: unknown): GradingSource | undefined {
	const result = gradingSourceSchema.safeParse(input);

	return result.success ? result.data : undefined;
}
```
