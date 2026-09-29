import { describe, expect, it } from 'vitest';

import { Lang } from './lang.js';
import { extractUnits } from './units.js';
import type { RepoCounts } from './units.js';

const NO_COUNTS: RepoCounts = { callers: () => 0, references: () => 1 };

const TS_SOURCE = `import { z } from 'zod';

export const userSchema = z.object({ id: z.string() });

export type User = z.infer<typeof userSchema>;

interface Options {
	retries: number;
}

export function isAdmin(user: User): boolean {
	return user.id === 'admin';
}

export const load = async (id: string, options: Options): Promise<User> => {
	const attempts = [1, 2, 3].map(step => step * options.retries);

	return { id: \`\${id}:\${attempts.length}\` };
};

const MAX = 3;

export const SYSTEM_PROMPT = [
	'You derive the legal elements a complete answer must address.',
	'Return at most three elements per issue.',
].join('\\n\\n');

class Store {
	get(id: string): User | undefined {
		return id === '' ? undefined : { id };
	}
}
`;

const GO_SOURCE = `package store

import (
	"context"
	"regexp"
)

var (
	resolvedWords = regexp.MustCompile("resolved|fixed")
	notResolved   = regexp.MustCompile("not resolved")
)

const timeout = 30

type Store struct {
	path string
}

func Open(path string) (*Store, error) {
	return &Store{path: path}, nil
}

func (s *Store) Has(ctx context.Context, id string) bool {
	return id != ""
}
`;

describe('extractUnits', () => {
	it('cuts a TypeScript file into functions, module-level arrows, top-level types, and long module-level values', () => {
		const units = extractUnits(Lang.TS, 'src/user.ts', TS_SOURCE, NO_COUNTS);

		expect(units.map(unit => [unit.facts.name, unit.facts.exported, unit.facts.parameters])).toEqual([
			['User', true, 0],
			['Options', false, 0],
			['isAdmin', true, 1],
			['load', true, 2],
			['SYSTEM_PROMPT', true, 0],
			['get', false, 1],
		]);
	});

	it('leaves one-line values to the syntax rules', () => {
		const names = extractUnits(Lang.TS, 'src/user.ts', TS_SOURCE, NO_COUNTS).map(unit => unit.facts.name);

		expect(names).not.toContain('MAX');
		expect(names).not.toContain('userSchema');
	});

	it('names an arrow function by its declaration and reads its header from there', () => {
		const load = extractUnits(Lang.TS, 'src/user.ts', TS_SOURCE, NO_COUNTS).find(
			unit => unit.facts.name === 'load'
		);

		expect(load?.header).toBe('const load = async (id: string, options: Options): Promise<User> => {');
		expect(load?.facts.returnsBoolean).toBe(false);
		expect(load?.declarations).not.toContain(load?.header);
		expect(load?.imports).toEqual(["import { z } from 'zod';"]);
	});

	it('knows which units return a boolean', () => {
		const units = extractUnits(Lang.TS, 'src/user.ts', TS_SOURCE, NO_COUNTS);

		expect(units.filter(unit => unit.facts.returnsBoolean).map(unit => unit.facts.name)).toEqual(['isAdmin']);
	});

	it('cuts a Go file into long value blocks, types, functions, and methods, counting parameters without the receiver', () => {
		const units = extractUnits(Lang.GO, 'store/store.go', GO_SOURCE, NO_COUNTS);

		expect(
			units.map(unit => [unit.facts.name, unit.facts.exported, unit.facts.parameters, unit.facts.returnsBoolean])
		).toEqual([
			['resolvedWords', false, 0, false],
			['Store', true, 0, false],
			['Open', true, 1, false],
			['Has', true, 2, true],
		]);
	});

	it('counts repository callers and references by name, without the definition itself', () => {
		const counts: RepoCounts = { callers: name => (name === 'isAdmin' ? 3 : 0), references: () => 5 };
		const isAdmin = extractUnits(Lang.TS, 'src/user.ts', TS_SOURCE, counts).find(
			unit => unit.facts.name === 'isAdmin'
		);

		expect(isAdmin?.facts).toMatchObject({ callers: 3, references: 4, lines: 3 });
	});
});
