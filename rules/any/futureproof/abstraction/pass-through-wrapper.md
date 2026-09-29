---
severity: minor
detect: judge
confirm: callCount
falsePositives:
  - >-
    a method that exists to satisfy an interface or adapt one signature to
    another
  - >-
    a wrapper that is the package's public surface over an internal or
    third-party dependency, so callers do not import the dependency
  - >-
    a wrapper that adds something, such as a default argument, a conversion,
    error context, logging, or caching
  - 'functions with several callers, where the shared name is the point'
jev:
  threshold: 0.51
---

## Why

A function whose whole body forwards its arguments to another call adds a name, a file jump, and a signature to keep in sync, without adding a decision. The reader now has to open it to learn it does nothing, and the next change has to update two signatures. Call the target directly, or make the wrapper earn its name by doing something the callers should not repeat.

## Message

pass-through wrapper forwards its arguments unchanged; call the target directly

## Bad

```ts
// BAD: forwards every argument and adds nothing
async function findUser(id: string): Promise<User | undefined> {
	return userRepo.findById(id);
}

export async function profile(id: string): Promise<Profile> {
	const user = await findUser(id);

	return toProfile(user);
}
```

```go
// BAD: forwards every argument and adds nothing
func (s *Service) findUser(ctx context.Context, id string) (User, error) {
	return s.repo.FindByID(ctx, id)
}

func (s *Service) Profile(ctx context.Context, id string) (Profile, error) {
	user, err := s.findUser(ctx, id)
	if err != nil {
		return Profile{}, fmt.Errorf("finding user: %w", err)
	}

	return toProfile(user), nil
}
```

## Good

```ts
export async function profile(id: string): Promise<Profile> {
	const user = await userRepo.findById(id);

	return toProfile(user);
}
```

```ts
// GOOD: small is not the same as pass-through; a lookup, a projection, a predicate, and an identity used as a
// strategy each compute something, none forwards its arguments to another call
export function detectLang(path: string): Lang | undefined {
	return EXTENSION_LANGS[extname(path)];
}

function pickScore({ overall, grade, axes }: Scored): Baseline {
	return { overall, grade, axes };
}

export function isIgnored(path: string, globs: readonly string[]): boolean {
	return globs.some(glob => matchesGlob(path, glob));
}

const paint = color ? pc.green : identity;

function identity(text: string): string {
	return text;
}
```

```go
func (s *Service) Profile(ctx context.Context, id string) (Profile, error) {
	user, err := s.repo.FindByID(ctx, id)
	if err != nil {
		return Profile{}, fmt.Errorf("finding user: %w", err)
	}

	return toProfile(user), nil
}
```
