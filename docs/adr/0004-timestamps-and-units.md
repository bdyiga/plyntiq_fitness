# ADR 0004: Timestamps and measurement units

**Status:** accepted (2026-10-26)

- **Instants** (`created_at`, `expires_at`, …): `INTEGER` milliseconds since the Unix epoch, UTC (`timestamp_ms` mode in Drizzle). This matches Better Auth's Drizzle mapping and sorts and compares cheaply.
- **Training dates** (M2: workout date, assessment date): `TEXT` `YYYY-MM-DD` as the athlete entered it, in their local calendar. A workout belongs to a day, not an instant. Weekly bucketing uses ISO weeks on that local date.
- **Measurements:** store the **original value and unit** exactly as entered or imported (`load_value` + `load_unit`), plus a normalized column (`load_kg`, `distance_m`, `time_s`, `height_cm`) computed on write by one tested conversion module. Analytics read only the normalized columns, and the UI displays in the athlete's preferred unit. Original values are never overwritten.
