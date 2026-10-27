import {
  ASSESSMENT_DEFINITIONS,
  ASSESSMENT_FOOTWEAR,
  ASSESSMENT_METHODS,
  ASSESSMENT_SURFACES,
  CONDITIONING_TYPES,
  CSV_KINDS,
  CSV_TEMPLATE_COLUMNS,
  IMPORT_MAX_CHARS,
  IMPORT_MAX_ROWS,
  toCsv,
  type CsvCell,
  type CsvKind,
  type ImportPreviewDto,
} from "@plyntiq/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type ChangeEvent } from "react";
import { Link } from "react-router";
import { Button, FormError, PageHeader, SecondaryButton } from "../components/ui";
import { api, ApiRequestError, queryKeys } from "../lib/api";
import { formatTrainingDate } from "../lib/format";

const KIND_LABELS: Record<CsvKind, string> = {
  workouts: "Workouts",
  conditioning: "Conditioning",
  assessments: "Sprint and jump tests",
};

/** One example row per template, so a filled-in file is easy to copy. */
const EXAMPLES: Record<CsvKind, CsvCell[][]> = {
  workouts: [
    ["2026-09-01", "Back squat", 5, 100, "kg", 8, "First set felt heavy"],
    ["2026-09-01", "Back squat", 5, 100, "kg", 8.5, ""],
  ],
  conditioning: [["2026-09-02", "intervals", 1290, 3.2, "km", 7, "6 × 400 m"]],
  assessments: [["2026-09-04", "sprint_20m", 3.12, "s", "timing_gates", "grass", "boots", "Light headwind", ""]],
};

const ids = (o: Record<string, string>) => Object.keys(o).join(", ");

/** What each column accepts, using the same IDs as the export. */
const COLUMN_HELP: Record<CsvKind, [string, string][]> = {
  workouts: [
    ["date", "YYYY-MM-DD. Sets on the same date become one workout."],
    ["exercise", "Exercise name as it appears in Plyntiq (any case). Add custom exercises before importing."],
    ["reps", "Whole number, 1–100."],
    ["load", "0 or more (0 = bodyweight)."],
    ["unit", "kg or lb."],
    ["rpe", "Optional, 1–10 in half steps."],
    ["notes", "Optional. The first notes on each date become the workout's notes."],
  ],
  conditioning: [
    ["date", "YYYY-MM-DD."],
    ["type", CONDITIONING_TYPES.join(", ")],
    ["duration_s", "Duration in seconds (e.g. 1290 for 21:30)."],
    ["distance, distance_unit", "Optional, together: a distance and m, km or mi."],
    ["session_rpe", "0–10 (CR-10 scale), whole or half steps."],
    ["notes", "Optional."],
  ],
  assessments: [
    ["date", "YYYY-MM-DD."],
    ["test", ASSESSMENT_DEFINITIONS.map((d) => `${d.id} (${d.name})`).join(", ")],
    ["value, unit", "sprint_20m in s; vertical_jump in cm or in."],
    ["method", ids(ASSESSMENT_METHODS)],
    ["surface", `Optional: ${ids(ASSESSMENT_SURFACES)}`],
    ["footwear", `Optional: ${ids(ASSESSMENT_FOOTWEAR)}`],
    ["conditions, notes", "Optional."],
  ],
};

/** Builds the template only when asked for, so no object URL outlives the click. */
function downloadTemplate(kind: CsvKind) {
  const blob = new Blob([toCsv(CSV_TEMPLATE_COLUMNS[kind], EXAMPLES[kind])], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), { href: url, download: `plyntiq-${kind}-template.csv` });
  a.click();
  URL.revokeObjectURL(url);
}

function errorMessage(err: unknown): string {
  if (err instanceof ApiRequestError) return err.body?.error.issues?.[0]?.message ?? err.message;
  return "Something went wrong. Please try again.";
}

export function ImportPage() {
  const queryClient = useQueryClient();
  const [kind, setKind] = useState<CsvKind>("workouts");
  const [preview, setPreview] = useState<ImportPreviewDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const refreshRecords = () =>
    Promise.all(
      [queryKeys.imports, queryKeys.workouts, queryKeys.conditioning, queryKeys.assessments].map((queryKey) =>
        queryClient.invalidateQueries({ queryKey }),
      ),
    );

  const upload = useMutation({
    mutationFn: api.uploadImport,
    onSuccess: (p) => {
      setPreview(p);
      setError(null);
    },
    onError: (err) => setError(errorMessage(err)),
  });
  const confirm = useMutation({
    mutationFn: api.confirmImport,
    onSuccess: async (job) => {
      setPreview(null);
      setDone(`Imported ${job.acceptedCount} ${job.acceptedCount === 1 ? "row" : "rows"}.`);
      await refreshRecords();
    },
    onError: (err) => setError(errorMessage(err)),
  });
  const cancel = useMutation({
    mutationFn: api.undoImport,
    onSuccess: async () => {
      setPreview(null);
      await refreshRecords();
    },
  });

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setDone(null);
    setPreview(null);
    const text = await file.text();
    if (text.length > IMPORT_MAX_CHARS) {
      setError("Use a file of 1 MB or less.");
      return;
    }
    upload.mutate({ kind, csv: text });
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Import from CSV" />
      <p className="text-sm text-slate-600">
        Bring in training you logged elsewhere. Fill in the template in any spreadsheet app, save it as CSV, and upload
        it. You'll see exactly what will be saved before anything changes, and you can undo an import later.
      </p>

      <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="font-semibold text-slate-900">1. Choose what you're importing</h2>
        <div role="group" aria-label="Record type" className="flex flex-wrap gap-2">
          {CSV_KINDS.map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={kind === k}
              onClick={() => {
                setKind(k);
                setPreview(null);
                setError(null);
              }}
              className={`rounded-lg border px-3 py-1.5 text-sm font-medium ${
                kind === k ? "border-emerald-700 bg-emerald-50 text-emerald-900" : "border-slate-300 text-slate-700"
              }`}
            >
              {KIND_LABELS[k]}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => downloadTemplate(kind)}
          className="block text-sm font-medium text-emerald-800 underline"
        >
          Download the {KIND_LABELS[kind].toLowerCase()} template
        </button>
        <details className="text-sm">
          <summary className="cursor-pointer text-slate-600 hover:text-slate-900">What goes in each column</summary>
          <dl className="mt-2 space-y-1">
            {COLUMN_HELP[kind].map(([col, help]) => (
              <div key={col}>
                <dt className="inline font-mono text-slate-900">{col}</dt>: <dd className="inline text-slate-700">{help}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-2 text-slate-600">Up to {IMPORT_MAX_ROWS} rows and 1 MB per file. Keep the first row of column names.</p>
        </details>
      </section>

      <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="font-semibold text-slate-900">2. Upload your file</h2>
        <label className="block">
          <span className="sr-only">CSV file</span>
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={onFile}
            disabled={upload.isPending}
            className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-emerald-700 file:px-3 file:py-2 file:font-medium file:text-white"
          />
        </label>
        {upload.isPending && <p className="text-sm text-slate-600">Checking your file…</p>}
        <FormError message={error} />
        {done && (
          <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
            {done}{" "}
            <Link to="/history" className="font-medium underline">
              See your history
            </Link>
          </p>
        )}
      </section>

      {preview && (
        <PreviewPanel
          preview={preview}
          busy={confirm.isPending || cancel.isPending}
          onConfirm={() => confirm.mutate(preview.job.id)}
          onCancel={() => cancel.mutate(preview.job.id)}
        />
      )}

      <PastImports onChange={refreshRecords} />
    </div>
  );
}

function PreviewPanel({
  preview,
  busy,
  onConfirm,
  onCancel,
}: {
  preview: ImportPreviewDto;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { job, sample, errors, warnings } = preview;
  const columns = CSV_TEMPLATE_COLUMNS[job.kind];
  return (
    <section aria-label="Import preview" className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="font-semibold text-slate-900">3. Check and confirm</h2>
      <p className="text-slate-800">
        <strong>{job.acceptedCount}</strong> of {job.rowCount} rows are ready to import.
        {job.rejectedCount > 0 && ` ${job.rejectedCount} have problems and will be skipped.`}
      </p>

      {errors.length > 0 && (
        <IssueList title="Rows that will be skipped" tone="error" issues={errors} />
      )}
      {warnings.length > 0 && (
        <IssueList title="Possible duplicates (these will still be imported)" tone="warning" issues={warnings} />
      )}

      {sample.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-slate-700">
            {sample.length < job.acceptedCount ? `First ${sample.length} rows to import` : "Rows to import"}
          </h3>
          <div className="mt-2 max-h-72 overflow-auto rounded-lg border border-slate-200">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-2 py-1 font-medium">Row</th>
                  {columns.map((c) => (
                    <th key={c} className="px-2 py-1 font-medium">
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sample.map((row) => (
                  <tr key={row.rowNumber} className="border-t border-slate-100">
                    <td className="px-2 py-1 tabular-nums text-slate-500">{row.rowNumber}</td>
                    {columns.map((c) => (
                      <td key={c} className="px-2 py-1 text-slate-800">
                        {row.cells[c]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {job.acceptedCount > 0 && (
          <Button type="button" onClick={onConfirm} disabled={busy} className="w-auto">
            Import {job.acceptedCount} {job.acceptedCount === 1 ? "row" : "rows"}
          </Button>
        )}
        <SecondaryButton onClick={onCancel} disabled={busy}>
          Cancel
        </SecondaryButton>
      </div>
      <p className="text-xs text-slate-500">If you don't confirm, this preview is deleted after 24 hours.</p>
    </section>
  );
}

function IssueList({
  title,
  tone,
  issues,
}: {
  title: string;
  tone: "error" | "warning";
  issues: ImportPreviewDto["errors"];
}) {
  const style = tone === "error" ? "border-red-200 bg-red-50 text-red-950" : "border-amber-200 bg-amber-50 text-amber-950";
  return (
    <div className={`rounded-lg border px-3 py-2 text-sm ${style}`}>
      <h3 className="font-medium">{title}</h3>
      <ul className="mt-1 max-h-48 space-y-0.5 overflow-auto">
        {issues.map((i, n) => (
          <li key={n}>
            Row {i.rowNumber}
            {i.field !== "row" && <>, {i.field}</>}: {i.message}
          </li>
        ))}
      </ul>
    </div>
  );
}

function PastImports({ onChange }: { onChange: () => Promise<unknown> }) {
  const imports = useQuery({ queryKey: queryKeys.imports, queryFn: api.imports });
  const [error, setError] = useState<string | null>(null);
  const undo = useMutation({
    mutationFn: api.undoImport,
    onSuccess: async () => {
      setError(null);
      await onChange();
    },
    onError: () => setError("We couldn't undo that import. Please try again."),
  });
  const confirmed = imports.data?.filter((j) => j.status === "confirmed") ?? [];
  if (confirmed.length === 0) return null;

  return (
    <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="font-semibold text-slate-900">Past imports</h2>
      <FormError message={error} />
      <ul className="space-y-2 text-sm">
        {confirmed.map((job) => (
          <li key={job.id} className="flex items-center justify-between gap-3 border-t border-slate-100 pt-2">
            <span className="text-slate-800">
              {KIND_LABELS[job.kind]}: {job.acceptedCount} {job.acceptedCount === 1 ? "row" : "rows"},{" "}
              {formatTrainingDate((job.confirmedAt ?? job.createdAt).slice(0, 10))}
            </span>
            <SecondaryButton
              disabled={undo.isPending}
              onClick={() => {
                if (
                  window.confirm(
                    `Undo this import? This deletes everything it added (${job.acceptedCount} rows), including anything you've edited since.`,
                  )
                ) {
                  undo.mutate(job.id);
                }
              }}
            >
              Undo
            </SecondaryButton>
          </li>
        ))}
      </ul>
    </section>
  );
}
