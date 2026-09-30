export function parse(raw: string) {
	try {
		return JSON.parse(raw) as any;
	} catch {}
	return null;
}
