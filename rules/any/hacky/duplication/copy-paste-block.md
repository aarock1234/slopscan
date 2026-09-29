---
severity: minor
detect: judge
ignore:
  - '**/*.test.ts'
  - '**/*.spec.ts'
  - '**/*_test.go'
falsePositives:
  - 'table-driven tests and test fixtures, where repetition is the point'
  - generated code
  - >-
    two or three short lines that happen to look alike, such as consecutive
    field assignments or switch arms
  - >-
    blocks that look alike today but belong to different domains and are
    expected to diverge, when the code says so
jev:
  threshold: 0.5
---

## Why

Two blocks that differ only in a name or a literal are one function with a parameter that has not been extracted yet. The next bug fix lands in one copy and not the other, and the reader has to diff them by eye to learn they are the same. Extract the block with the varying part as an argument, or loop over the values.

## Message

copy-pasted block differs in one identifier; extract a function or loop over the values

## Bad

```ts
export async function exportReports(db: Db): Promise<void> {
	// BAD: the second block is the first with 'sales' replaced by 'refunds'
	const salesRows = await db.query('select * from sales where exported = false');
	const salesCsv = toCsv(salesRows);
	await storage.put(`exports/sales-${today()}.csv`, salesCsv);
	await db.execute('update sales set exported = true where exported = false');
	logger.info({ count: salesRows.length }, 'exported sales');

	const refundRows = await db.query('select * from refunds where exported = false');
	const refundCsv = toCsv(refundRows);
	await storage.put(`exports/refunds-${today()}.csv`, refundCsv);
	await db.execute('update refunds set exported = true where exported = false');
	logger.info({ count: refundRows.length }, 'exported refunds');
}
```

```go
func ExportReports(ctx context.Context, db *sql.DB) error {
	// BAD: the second block is the first with "sales" replaced by "refunds"
	salesRows, err := query(ctx, db, "select * from sales where exported = false")
	if err != nil {
		return fmt.Errorf("querying sales: %w", err)
	}
	if err := storage.Put(ctx, "exports/sales-"+today()+".csv", toCSV(salesRows)); err != nil {
		return fmt.Errorf("uploading sales: %w", err)
	}
	if _, err := db.ExecContext(ctx, "update sales set exported = true where exported = false"); err != nil {
		return fmt.Errorf("marking sales: %w", err)
	}

	refundRows, err := query(ctx, db, "select * from refunds where exported = false")
	if err != nil {
		return fmt.Errorf("querying refunds: %w", err)
	}
	if err := storage.Put(ctx, "exports/refunds-"+today()+".csv", toCSV(refundRows)); err != nil {
		return fmt.Errorf("uploading refunds: %w", err)
	}
	if _, err := db.ExecContext(ctx, "update refunds set exported = true where exported = false"); err != nil {
		return fmt.Errorf("marking refunds: %w", err)
	}

	return nil
}
```

## Good

```ts
const EXPORTED_TABLES = ['sales', 'refunds'] as const;

export async function exportReports(db: Db): Promise<void> {
	for (const table of EXPORTED_TABLES) {
		await exportTable(db, table);
	}
}

async function exportTable(db: Db, table: string): Promise<void> {
	const rows = await db.query(`select * from ${table} where exported = false`);
	await storage.put(`exports/${table}-${today()}.csv`, toCsv(rows));
	await db.execute(`update ${table} set exported = true where exported = false`);
	logger.info({ table, count: rows.length }, 'exported table');
}
```

```go
var exportedTables = []string{"sales", "refunds"}

func ExportReports(ctx context.Context, db *sql.DB) error {
	for _, table := range exportedTables {
		if err := exportTable(ctx, db, table); err != nil {
			return fmt.Errorf("exporting %s: %w", table, err)
		}
	}

	return nil
}

func exportTable(ctx context.Context, db *sql.DB, table string) error {
	rows, err := query(ctx, db, "select * from "+table+" where exported = false")
	if err != nil {
		return fmt.Errorf("querying: %w", err)
	}
	if err := storage.Put(ctx, "exports/"+table+"-"+today()+".csv", toCSV(rows)); err != nil {
		return fmt.Errorf("uploading: %w", err)
	}
	if _, err := db.ExecContext(ctx, "update "+table+" set exported = true where exported = false"); err != nil {
		return fmt.Errorf("marking: %w", err)
	}

	return nil
}
```
