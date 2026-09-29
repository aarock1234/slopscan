---
severity: minor
detect: judge
ignore:
  - '**/*.test.ts'
  - '**/*.spec.ts'
  - '**/*_test.go'
falsePositives:
  - >-
    a numeric array handed to a math helper and immediately joined back to its
    records
  - 'the columns of a table or matrix, where the index is the meaning'
  - >-
    two arrays zipped once at the boundary where they arrive, such as a header
    row and a data row
  - hot loops where a struct-of-arrays layout is the point and the code says so
jev:
  threshold: 0.28
guide:
  - ts.related-data
---

## Why

Two arrays that must stay in the same order are one array of records that has not been written yet. Every sort, filter, scale, or splice between them is a place to desynchronise `names[k]` from `points[k]`, and the reader has to track through the whole function which arrays still share an ordering. Keep each item's identity and its values in one record and carry the record through every stage; convert to a bare numeric array only inside the helper that needs one, and reattach the result at once.

## Message

related data kept in parallel arrays related by index; carry it as one array of records

## Bad

```ts
// BAD: areas and their points are two arrays that must stay aligned through scaling and reordering
const poolAreas: Area[] = [];
const poolPoints: number[] = [];
for (const area of plan.areas) {
	poolAreas.push(area);
	poolPoints.push(basePoints(area));
}
scaleInPlace(poolPoints, total);
const ordered = orderByFamily(poolAreas);
return ordered.map((area, k) => ({ area, points: poolPoints[k] }));
```

```go
// BAD: hosts and their latencies are related only by position
hosts := make([]string, 0, len(targets))
latencies := make([]time.Duration, 0, len(targets))
for _, t := range targets {
	hosts = append(hosts, t.Host)
	latencies = append(latencies, probe(t))
}
sort.Slice(latencies, func(i, j int) bool { return latencies[i] < latencies[j] })
best := hosts[0]
```

## Good

```ts
type Allocation = { area: Area; points: number };

const pool: Allocation[] = plan.areas.map(area => ({ area, points: basePoints(area) }));
const scaled = scale(pool, total);
return orderByFamily(scaled);
```

```go
type Probe struct {
	Host    string
	Latency time.Duration
}

probes := make([]Probe, 0, len(targets))
for _, t := range targets {
	probes = append(probes, Probe{Host: t.Host, Latency: probe(t)})
}
sort.Slice(probes, func(i, j int) bool { return probes[i].Latency < probes[j].Latency })
best := probes[0].Host
```

```ts
// a math helper wants numbers; the records are rejoined immediately
const normalized = normalize(pool.map(entry => entry.points));
const result = pool.map((entry, index) => ({ ...entry, points: normalized[index] ?? entry.points }));
```
