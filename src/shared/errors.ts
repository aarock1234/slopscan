type ErrorOptions = {
	cause?: unknown;
};

export class SlopscanError extends Error {
	readonly code: string;

	constructor(message: string, code: string, options?: ErrorOptions) {
		super(message, options);
		this.name = this.constructor.name;
		this.code = code;
	}
}

export class ConfigError extends SlopscanError {
	constructor(message: string, options?: ErrorOptions) {
		super(message, 'CONFIG', options);
	}
}

export class RuleError extends SlopscanError {
	readonly rulePath: string;

	constructor(rulePath: string, message: string, options?: ErrorOptions) {
		super(`${rulePath}: ${message}`, 'RULE', options);
		this.rulePath = rulePath;
	}
}

export class GitError extends SlopscanError {
	constructor(message: string, options?: ErrorOptions) {
		super(message, 'GIT', options);
	}
}
