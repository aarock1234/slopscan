import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

// every path git tracks in the repository, relative to its root
export async function trackedFiles(repo: string): Promise<string[]> {
	const { stdout } = await execFileAsync('git', ['ls-files', '-z'], {
		cwd: repo,
		encoding: 'utf-8',
	});

	return stdout.split('\0').filter(path => path.length > 0);
}
