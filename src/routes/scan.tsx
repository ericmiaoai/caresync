import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState, useEffect, useCallback } from "react";
import {
  AlertTriangle, Check, X, CalendarDays, ClipboardList,
  Stethoscope, CheckCircle2, ScanLine, Pencil, Save, ShieldOff, Clock,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabaseClient";
import { processAVSImage, type AVSContract } from "@/services/VLMService";
import { useAuth } from "@/hooks/useAuth";
import { useCareCircle } from "@/hooks/useCareCircle";
import { can } from "@/lib/permissions";
import { Dropzone } from "@/components/Dropzone";

export const Route = createFileRoute("/scan")({
  head: () => ({
    meta: [
      { title: "Scan AVS — CareSync" },
      {
        name: "description",
        content: "Extract follow-up appointments from an After Visit Summary into your calendar.",
      },
    ],
  }),
  component: ScanAVS,
});

type Phase = "idle" | "scanning" | "review" | "done" | "error";

interface ApprovalSummary {
  appointmentTitles: string[];
}

interface EditableAppt {
  specialty_or_provider: string;
  date_time:             string;
  location:              string;
}

const INPUT_SM = "w-full rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring";

// Formats ISO date-time strings from Gemini into a user-friendly local format.
// Date-only strings (no T) are parsed as local date to avoid UTC midnight shifting the day.
function formatAVSDateTime(dt: string): string {
  if (!dt) return dt;
  try {
    const hasTime = dt.includes("T");
    const date = hasTime
      ? new Date(dt)
      : (() => { const [y, m, d] = dt.split("-").map(Number); return new Date(y, m - 1, d); })();
    if (isNaN(date.getTime())) return dt;
    return new Intl.DateTimeFormat("en-US", {
      month:        "2-digit",
      day:          "2-digit",
      year:         "numeric",
      ...(hasTime && { hour: "numeric", minute: "2-digit", hour12: true, timeZoneName: "short" }),
    }).format(date);
  } catch {
    return dt;
  }
}

// Mirrors AVS_DAILY_SCAN_LIMIT on the server. Update VITE_AVS_DAILY_SCAN_LIMIT in .env
// and rebuild whenever the server-side limit changes.
const DISPLAY_DAILY_LIMIT = parseInt(import.meta.env.VITE_AVS_DAILY_SCAN_LIMIT ?? "10", 10);

function compressImage(file: File): Promise<{ base64: string; mimeType: "image/jpeg" | "image/png" | "image/webp" }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const MAX = 1600;
      let { width, height } = img;
      if (width > MAX || height > MAX) {
        if (width >= height) { height = Math.round((height * MAX) / width); width = MAX; }
        else                 { width  = Math.round((width  * MAX) / height); height = MAX; }
      }
      const canvas = document.createElement("canvas");
      canvas.width  = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) { reject(new Error("Canvas not supported")); return; }
      ctx.drawImage(img, 0, 0, width, height);
      resolve({ base64: canvas.toDataURL("image/jpeg", 0.85).split(",")[1], mimeType: "image/jpeg" });
    };
    img.onerror = reject;
    img.src = url;
  });
}

function ScanAVS() {
  const { user }                    = useAuth();
  const { careCircleId, role }      = useCareCircle(user?.id);
  const navigate                    = useNavigate();
  const canScan                     = can(role, "scan_avs");

  // Redirect Viewers away — role may be null briefly while loading, so only
  // redirect once we have a confirmed non-null role that lacks permission.
  useEffect(() => {
    if (role !== null && !canScan) {
      navigate({ to: "/" });
      toast.error("Access restricted", { description: "Scanning AVS documents requires a Caregiver or Admin role." });
    }
  }, [role, canScan, navigate]);

  const [phase,          setPhase]          = useState<Phase>("idle");
  const [scanError,      setScanError]      = useState<string | null>(null);
  const [rateLimitError, setRateLimitError] = useState(false);
  const [scansUsed,      setScansUsed]      = useState<number | null>(null);
  const [contract,       setContract]       = useState<AVSContract | null>(null);
  const [patientId,      setPatientId]      = useState<string | null>(null);
  const [patientName,    setPatientName]    = useState<string | null>(null);
  const [summary,        setSummary]        = useState<ApprovalSummary | null>(null);
  const [editableAppts,  setEditableAppts]  = useState<EditableAppt[]>([]);
  const [editingIndex,   setEditingIndex]   = useState<number | null>(null);
  const [editDraft,      setEditDraft]      = useState<EditableAppt>({ specialty_or_provider: "", date_time: "", location: "" });

  const fetchScansUsed = useCallback(async () => {
    if (!user?.id) return;
    const window24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count, error } = await supabase
      .from("avs_scan_logs")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .gte("scanned_at", window24h);
    if (!error) setScansUsed(count ?? 0);
  }, [user?.id]);

  useEffect(() => { fetchScansUsed(); }, [fetchScansUsed]);

  useEffect(() => {
    if (!careCircleId) return;
    supabase
      .from("patients")
      .select("id, first_name, last_name")
      .eq("care_circle_id", careCircleId)
      .limit(1)
      .single()
      .then(({ data }) => {
        const row = data as unknown as { id: string; first_name: string; last_name: string } | null;
        setPatientId(row?.id ?? null);
        if (row) setPatientName(`${row.first_name} ${row.last_name}`);
      });
  }, [careCircleId]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleFileSelect = async (file: File) => {
    setPhase("scanning");
    setScanError(null);
    try {
      // Formats Gemini handles natively — pass through as-is without canvas compression.
      // JPEG/PNG/WebP are compressed via canvas; everything else is sent raw.
      const PASSTHROUGH_TYPES = ["application/pdf", "image/heic", "image/heif"];
      const isPassthrough = PASSTHROUGH_TYPES.includes(file.type);
      const { base64, mimeType } = isPassthrough
        ? await new Promise<{ base64: string; mimeType: string }>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload  = () => resolve({ base64: (reader.result as string).split(",")[1], mimeType: file.type });
            reader.onerror = reject;
            reader.readAsDataURL(file);
          })
        : await compressImage(file);
      const result = await processAVSImage(base64, mimeType);
      setContract(result);
      setEditableAppts(
        result.upcoming_appointments.map((a) => ({
          specialty_or_provider: a.specialty_or_provider,
          date_time:             a.date_time,
          location:              a.location ?? "",
        })),
      );
      setEditingIndex(null);
      setPhase("review");
      fetchScansUsed();
    } catch (err: unknown) {
      const isRateLimit = err instanceof Error && (err as any).statusCode === 429;
      setScanError(err instanceof Error ? err.message : "Failed to parse AVS. Please try again.");
      setRateLimitError(isRateLimit);
      setPhase("error");
      fetchScansUsed();
    }
  };

  const writeAuditRow = async (status: "approved" | "rejected") => {
    if (!careCircleId || !user?.id || !patientId) return;
    const now = new Date().toISOString();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from("avs_documents") as any).insert({
      care_circle_id: careCircleId,
      patient_id:     patientId,
      document_label: `AVS Scan — ${contract?.avs_metadata.visit_date ?? now.slice(0, 10)}`,
      visit_date:     contract?.avs_metadata.visit_date ?? null,
      provider_name:  contract?.avs_metadata.provider_name ?? null,
      review_status:  status,
      reviewed_by:    user.id,
      reviewed_at:    now,
      scanned_by:     user.id,
      scanned_at:     now,
    });
  };

  const handleApprove = async () => {
    await writeAuditRow("approved");

    const appointmentTitles: string[] = [];

    if (careCircleId && user?.id && editableAppts.length > 0) {
      const eventsToInsert = editableAppts
        .map((appt) => {
          const start = new Date(appt.date_time);
          if (isNaN(start.getTime())) return null;
          const end = new Date(start.getTime() + 60 * 60 * 1000);
          return {
            care_circle_id: careCircleId,
            patient_id:     patientId ?? undefined,
            title:          appt.specialty_or_provider,
            description:    null as null,
            location:       appt.location || null,
            start_time:     start.toISOString(),
            end_time:       end.toISOString(),
            created_by:     user.id,
          };
        })
        .filter(Boolean);

      if (eventsToInsert.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase.from("calendar_events") as any).insert(eventsToInsert);
        editableAppts.forEach((appt) =>
          appointmentTitles.push(appt.specialty_or_provider),
        );
      }
    }

    setSummary({ appointmentTitles });
    setPhase("done");
    toast.success("AVS review complete", { duration: 3000 });
  };

  const handleReject = async () => {
    await writeAuditRow("rejected");
    toast("Scan discarded", { duration: 3000 });
    reset();
  };

  const reset = () => {
    setPhase("idle");
    setContract(null);
    setScanError(null);
    setRateLimitError(false);
    setSummary(null);
    setEditableAppts([]);
    setEditingIndex(null);
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6">
      <header className="mb-6">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Human-in-the-loop
        </p>
        <div className="mt-1 flex items-center justify-between gap-4">
          <h1 className="text-2xl font-semibold tracking-tight">Scan AVS</h1>
          {scansUsed !== null && (
            <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium tabular-nums ${
              scansUsed >= DISPLAY_DAILY_LIMIT
                ? "bg-red-500/10 text-red-400 ring-1 ring-inset ring-red-500/20"
                : scansUsed >= Math.floor(DISPLAY_DAILY_LIMIT * 0.7)
                ? "bg-amber-500/10 text-amber-400 ring-1 ring-inset ring-amber-500/20"
                : "bg-muted text-muted-foreground"
            }`}>
              {scansUsed} / {DISPLAY_DAILY_LIMIT} scans today
            </span>
          )}
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Scans an After Visit Summary and adds follow-up appointments to your Calendar.
          Medications and care instructions are shown during review for your reference —
          they are <span className="font-medium text-foreground">not saved</span> to CareSync.
        </p>
      </header>

      {/* ── Done / post-approval summary ───────────────────────────────────── */}
      {phase === "done" && summary && (
        <div className="flex flex-col gap-4">
          <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-5">
            <div className="mb-3 flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-400" />
              <p className="text-sm font-semibold text-emerald-400">
                {summary.appointmentTitles.length > 0
                  ? `${summary.appointmentTitles.length} appointment${summary.appointmentTitles.length === 1 ? "" : "s"} added to Calendar`
                  : "No upcoming appointments found in this AVS"}
              </p>
            </div>
            {summary.appointmentTitles.length > 0 && (
              <ul className="flex flex-col gap-1.5 pl-7">
                {summary.appointmentTitles.map((title, i) => (
                  <li key={i} className="text-sm text-foreground/80">
                    {title}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <p className="text-center text-xs text-muted-foreground">
            Medications and care instructions from this AVS were shown for reference only
            and were not saved.
          </p>

          <button
            type="button"
            onClick={reset}
            className="touch-target flex items-center justify-center gap-2 rounded-xl border border-border bg-transparent px-4 py-3 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            <ScanLine className="h-4 w-4" />
            Scan Another AVS
          </button>
        </div>
      )}

      {/* ── Idle / upload ──────────────────────────────────────────────────── */}
      {(phase === "idle" || phase === "scanning" || phase === "error") && (
        <>
          <Dropzone loading={phase === "scanning"} onFileSelect={handleFileSelect} />

          {phase === "error" && scanError && (
            rateLimitError ? (
              <div className="mt-4 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
                <Clock className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
                <div>
                  <p className="text-sm font-medium text-amber-400">Daily limit reached</p>
                  <p className="mt-0.5 text-xs text-amber-400/80">
                    You've used all {DISPLAY_DAILY_LIMIT} scans for today. Your limit resets on a rolling 24-hour basis.
                  </p>
                </div>
              </div>
            ) : (
              <div className="mt-4 flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
                <div>
                  <p className="text-sm font-medium text-red-400">Parsing failed</p>
                  <p className="mt-0.5 text-xs text-red-400/80">{scanError}</p>
                  <button
                    type="button"
                    onClick={reset}
                    className="mt-2 text-xs text-red-400 underline underline-offset-2"
                  >
                    Try again
                  </button>
                </div>
              </div>
            )
          )}
        </>
      )}

      {/* ── Review ─────────────────────────────────────────────────────────── */}
      {phase === "review" && contract && (
        <>
          {/* HITL warning */}
          <div className="mt-6 mb-3 flex items-start gap-2 rounded-lg border border-[var(--warning)]/30 bg-[var(--warning)]/10 p-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--warning)]" />
            <p className="text-xs leading-relaxed text-foreground/90">
              Verify appointments against the physical AVS before approving. CareSync does
              not validate clinical accuracy.
            </p>
          </div>

          {/* Patient name mismatch warning */}
          {(() => {
            const extracted = contract.avs_metadata.patient_name?.trim();
            const stored    = patientName?.trim();
            if (!extracted || !stored) return null;
            const namesMatch = extracted.toLowerCase() === stored.toLowerCase();
            if (namesMatch) return null;
            return (
              <div className="mb-3 flex items-start gap-2 rounded-lg border border-orange-500/40 bg-orange-500/10 p-3">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-orange-400" />
                <div>
                  <p className="text-xs font-semibold text-orange-400">Patient name mismatch — please verify</p>
                  <p className="mt-0.5 text-xs text-orange-400/80">
                    Document shows <span className="font-medium">"{extracted}"</span> but
                    CareSync has <span className="font-medium">"{stored}"</span> on file.
                    Confirm this AVS belongs to the correct patient before approving.
                  </p>
                </div>
              </div>
            );
          })()}

          {/* Metadata */}
          <div className="mb-5 rounded-xl border border-border bg-card p-3" style={{ boxShadow: "var(--card-shadow)" }}>
            <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground mb-1">
              Document metadata
            </p>
            <p className="text-sm font-medium text-foreground">
              {contract.avs_metadata.provider_name || "Provider not detected"}
            </p>
            <p className="text-xs text-muted-foreground">
              Visit date: {contract.avs_metadata.visit_date || "Not detected"}
            </p>
            {contract.avs_metadata.patient_name && (
              <p className="text-xs text-muted-foreground">
                Patient: {contract.avs_metadata.patient_name}
              </p>
            )}
          </div>

          {/* Upcoming appointments — SAVED on approve */}
          {editableAppts.length > 0 && (
            <section className="mb-5">
              <div className="mb-2 flex items-center gap-2">
                <CalendarDays className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold tracking-tight">Upcoming Appointments</h2>
                <span className="ml-auto rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-400">
                  Saved to Calendar on approve
                </span>
              </div>
              <div className="flex flex-col gap-2">
                {editableAppts.map((appt, i) =>
                  editingIndex === i ? (
                    /* ── Edit mode ── */
                    <div key={i} className="rounded-xl border border-ring bg-card px-4 py-3 flex flex-col gap-2" style={{ boxShadow: "var(--card-shadow)" }}>
                      <input
                        autoFocus
                        className={INPUT_SM}
                        placeholder="Provider / specialty"
                        value={editDraft.specialty_or_provider}
                        onChange={(e) => setEditDraft((d) => ({ ...d, specialty_or_provider: e.target.value }))}
                      />
                      <input
                        className={INPUT_SM}
                        placeholder="Date & time (e.g. May 15, 2026 at 10:00 AM)"
                        value={editDraft.date_time}
                        onChange={(e) => setEditDraft((d) => ({ ...d, date_time: e.target.value }))}
                      />
                      <input
                        className={INPUT_SM}
                        placeholder="Location (optional)"
                        value={editDraft.location}
                        onChange={(e) => setEditDraft((d) => ({ ...d, location: e.target.value }))}
                      />
                      <div className="flex justify-end gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => setEditingIndex(null)}
                          className="rounded-md px-3 py-1 text-xs text-muted-foreground hover:bg-accent"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditableAppts((prev) =>
                              prev.map((a, idx) => idx === i ? { ...editDraft } : a),
                            );
                            setEditingIndex(null);
                          }}
                          className="flex items-center gap-1 rounded-md bg-foreground px-3 py-1 text-xs font-medium text-background"
                        >
                          <Save className="h-3 w-3" />
                          Save
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* ── Read mode ── */
                    <div key={i} className="group rounded-xl border border-border bg-card px-4 py-3 flex items-start gap-3" style={{ boxShadow: "var(--card-shadow)" }}>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-foreground">
                          {appt.specialty_or_provider}
                        </p>
                        <p className="text-xs text-muted-foreground">{formatAVSDateTime(appt.date_time)}</p>
                        {appt.location && (
                          <p className="text-xs text-muted-foreground">{appt.location}</p>
                        )}
                      </div>
                      <button
                        type="button"
                        aria-label="Edit appointment"
                        onClick={() => {
                          setEditDraft({ ...appt });
                          setEditingIndex(i);
                        }}
                        className="shrink-0 rounded-md p-1.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:bg-accent hover:text-foreground focus-visible:opacity-100"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ),
                )}
              </div>
            </section>
          )}

          {/* Medications — reference only, not saved */}
          {contract.medications.length > 0 && (
            <section className="mb-5">
              <div className="mb-2 flex items-center gap-2">
                <ClipboardList className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold tracking-tight">Medications</h2>
                <span className="ml-auto rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                  Not saved to CareSync
                </span>
              </div>
              <ul className="rounded-xl border border-border bg-card divide-y divide-border" style={{ boxShadow: "var(--card-shadow)" }}>
                {contract.medications.map((med, i) => (
                  <li key={i} className="px-4 py-3">
                    <p className="text-sm font-medium text-foreground">
                      {med.name}
                      {med.dosage && (
                        <span className="font-normal text-muted-foreground"> · {med.dosage}</span>
                      )}
                    </p>
                    {med.frequency && (
                      <p className="text-xs text-muted-foreground">{med.frequency}</p>
                    )}
                    {med.reason && (
                      <p className="text-xs text-muted-foreground">{med.reason}</p>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Care instructions — reference only, not saved */}
          {contract.care_instructions.length > 0 && (
            <section className="mb-5">
              <div className="mb-2 flex items-center gap-2">
                <Stethoscope className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold tracking-tight">Care Instructions</h2>
                <span className="ml-auto rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                  Not saved to CareSync
                </span>
              </div>
              <ul className="rounded-xl border border-border bg-card divide-y divide-border" style={{ boxShadow: "var(--card-shadow)" }}>
                {contract.care_instructions.map((instruction, i) => (
                  <li key={i} className="px-4 py-2.5 text-sm text-foreground/90">
                    {instruction}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Action bar */}
          <div className="sticky bottom-20 mt-6 flex flex-col gap-2 rounded-2xl border border-border bg-card/95 p-3 backdrop-blur md:bottom-4 md:flex-row" style={{ boxShadow: "var(--card-shadow-lg)" }}>
            <button
              type="button"
              onClick={handleReject}
              className="touch-target flex flex-1 items-center justify-center gap-2 rounded-xl border border-border bg-transparent px-4 text-sm font-medium text-foreground transition-colors hover:bg-accent"
            >
              <X className="h-4 w-4" />
              Reject
            </button>
            <button
              type="button"
              onClick={handleApprove}
              className="touch-target flex flex-[2] items-center justify-center gap-2 rounded-xl bg-[var(--success)] px-4 text-base font-semibold text-[var(--success-foreground)] shadow-sm transition-opacity hover:opacity-90"
            >
              <Check className="h-5 w-5" />
              Approve & Add Appointments to Calendar
            </button>
          </div>
        </>
      )}

      {/* Contextual privacy disclosure — surfaced here because this is where
          a document is sent to an external AI service (Google Gemini). */}
      <p className="mt-10 text-center text-[11px] leading-relaxed text-muted-foreground/70">
        Documents you scan are processed by Google Gemini.{" "}
        <Link
          to="/privacy"
          className="underline-offset-2 hover:text-foreground hover:underline"
        >
          Privacy Policy
        </Link>
      </p>
    </div>
  );
}
