---
severity: minor
detect: judge
falsePositives:
  - >-
    a catch that logs and then handles the error without rethrowing, such as
    falling back to a default or skipping one item in a batch
  - >-
    the outermost handler, controller, job runner, or CLI entrypoint, which is
    the boundary and should log
  - >-
    a catch that adds context by wrapping the error in a typed error before
    rethrowing, without logging
jev:
  threshold: 0.51
---

## Why

When every layer catches an error, logs it, and rethrows, one failure produces a stack of near-identical log lines and the boundary that finally handles it logs it again. Errors should propagate untouched, or wrapped with context, until they reach the boundary, such as the request handler or the job runner, where they are logged once with full context and turned into a response. Inner layers that only log and rethrow are noise generators.

## Message

catch logs and rethrows in an inner layer; let it propagate and log once at the boundary

## Bad

```ts
class UserService {
	async getUser(id: string): Promise<User> {
		try {
			return await this.repository.find(id);
		} catch (error) {
			// BAD: the handler above will log this same error again
			this.logger.error('get user failed', { error });

			throw error;
		}
	}
}
```

## Good

```ts
class UserService {
	async getUser(id: string): Promise<User> {
		const user = await this.repository.find(id);

		if (!user) {
			throw new NotFoundError(`user ${id}`);
		}

		return user;
	}
}
```

```ts
async function handleGetUser(req: Request, res: Response): Promise<void> {
	try {
		res.json(await userService.getUser(req.params.id));
	} catch (error: unknown) {
		if (error instanceof NotFoundError) {
			res.status(404).json({ error: error.message });

			return;
		}

		logger.error('get user failed', { error, userId: req.params.id });
		res.status(500).json({ error: 'internal error' });
	}
}
```
