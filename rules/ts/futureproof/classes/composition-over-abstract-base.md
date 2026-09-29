---
severity: minor
detect: judge
falsePositives:
  - >-
    an abstract class that enforces a method contract across a family of
    implementations and holds real shared behavior such as a template method
  - >-
    framework-required base classes, such as ORM entities, component classes, or
    error hierarchies extending `Error`
  - >-
    a hierarchy that is one level deep and whose subclasses differ only in the
    abstract method they implement
jev:
  threshold: 0.56
---

## Why

An abstract base class introduced to share a helper or two couples every subclass to a hierarchy, so the next feature that does not fit the base shape either bends the base or forks it. A shared function, or a dependency passed into a constructor, gives the same reuse without the inheritance tax and can be swapped or tested on its own. Reach for an abstract class only when there is a real contract to enforce across a family of implementations.

## Message

abstract base class used for code sharing; prefer a shared function or injected dependency

## Bad

```ts
// BAD: the base exists only to share one helper with its subclasses
abstract class BaseService {
	protected logDuration(label: string, startedAt: number): void {
		logger.info(`${label} took ${Date.now() - startedAt}ms`);
	}
}

class UserService extends BaseService {
	async getUser(id: string): Promise<User> {
		const startedAt = Date.now();
		const user = await repository.find(id);

		this.logDuration('getUser', startedAt);

		return user;
	}
}
```

## Good

```ts
function logDuration(label: string, startedAt: number): void {
	logger.info(`${label} took ${Date.now() - startedAt}ms`);
}

class UserService {
	constructor(private readonly repository: UserRepository) {}

	async getUser(id: string): Promise<User> {
		const startedAt = Date.now();
		const user = await this.repository.find(id);

		logDuration('getUser', startedAt);

		return user;
	}
}
```

```ts
abstract class BaseProcessor<TInput, TOutput> {
	async process(input: TInput): Promise<TOutput> {
		this.validate(input);

		return this.execute(input);
	}

	protected abstract validate(input: TInput): void;

	protected abstract execute(input: TInput): Promise<TOutput>;
}
```
