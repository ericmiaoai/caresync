import { createFileRoute } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useMemo, useRef, useState } from "react";
import {
  DndContext,
  closestCenter,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ChevronLeft, ChevronRight,
  Square, CheckSquare2,
  MapPin, CheckCircle2,
  Pill, Stethoscope, Car, Activity,
  Plus, Trash2, Pencil, CalendarSearch, GripVertical,
} from "lucide-react";
import { AddButton } from "@/components/AddButton";
import { ActionTypeSheet } from "@/components/ActionTypeSheet";
import { AddTaskSheet } from "@/components/AddTaskSheet";
import { TimeInput } from "@/components/TimeInput";
import { toast } from "sonner";
import { EventChip } from "@/components/EventChip";
import { TaskChip } from "@/components/TaskChip";
import { useAuth } from "@/hooks/useAuth";
import { useCareCircle } from "@/hooks/useCareCircle";
import { useCalendarEvents } from "@/hooks/useCalendarEvents";
import { useCalendarTasks } from "@/hooks/useCalendarTasks";
import { useMembers } from "@/hooks/useMembers";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { can } from "@/lib/permissions";
import type { UICalendarEvent, UITask, TaskKind } from "@/lib/adapters";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/calendar")({
  head: () => ({
    meta: [
      { title: "Calendar — CareSync" },
      { name: "description", content: "Shared appointments and daily tasks for the care circle." },
    ],
  }),
  component: CalendarView,
});

// ── Shared lookup maps ─────────────────────────────────────────────────────────

const KIND_ICON: Record<TaskKind, React.ComponentType<{ className?: string }>> = {
  medication:  Pill,
  appointment: Stethoscope,
  transport:   Car,
  vitals:      Activity,
};

const KIND_COLOR: Record<TaskKind, string> = {
  medication:  "text-[var(--user-nurse)]",
  appointment: "text-[var(--user-sister)]",
  transport:   "text-[var(--user-dad)]",
  vitals:      "text-[var(--user-admin)]",
};

const PRIORITY_BORDER: Record<UITask["priority"], string> = {
  critical: "border-l-[var(--destructive)]",
  high:     "border-l-[var(--warning)]",
  medium:   "border-l-[var(--user-nurse)]",
  low:      "border-l-[var(--muted-foreground)]",
};

const PRIORITY_LABEL: Record<UITask["priority"], string> = {
  critical: "Critical",
  high:     "High",
  medium:   "Medium",
  low:      "Low",
};

const PRIORITY_TEXT: Record<UITask["priority"], string> = {
  critical: "text-destructive",
  high:     "text-[var(--warning)]",
  medium:   "text-[var(--user-nurse)]",
  low:      "text-muted-foreground",
};

const INPUT = "w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring";

// ── Helpers ────────────────────────────────────────────────────────────────────

function startOfWeek(d: Date): Date {
  const date = new Date(d);
  date.setDate(date.getDate() - date.getDay());
  date.setHours(0, 0, 0, 0);
  return date;
}

function fmtDate(d: Date): string {
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0"),
  ].join("-");
}

function fmtCompletedAt(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short", day: "numeric", year: "numeric",
  });
}

function isoToFormTime(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

// ── Day-view card: Appointment ─────────────────────────────────────────────────

interface AppointmentCardProps {
  event:      UICalendarEvent;
  onComplete: () => void;
  onUnmark:   () => void;
  onEdit?:    () => void;
  onDelete?:  () => void;
}

function AppointmentCard({ event: ev, onComplete, onUnmark, onEdit, onDelete }: AppointmentCardProps) {
  const Icon = KIND_ICON[ev.kind];
  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-card overflow-hidden transition-opacity",
        ev.isCompleted && "opacity-60",
      )}
      data-kind="appointment"
      style={{ boxShadow: "var(--card-shadow)" }}
    >
      <div className="flex items-start gap-3 p-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent">
          <Icon className={cn("h-5 w-5", KIND_COLOR[ev.kind])} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs tabular-nums text-muted-foreground">{ev.time}</p>
              <p className="mt-0.5 truncate font-medium text-foreground">{ev.title}</p>
            </div>
            <div className="flex shrink-0 items-center gap-0.5">
              {onEdit && (
                <button
                  onClick={onEdit}
                  title="Edit appointment"
                  className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  <Pencil className="h-4 w-4" />
                </button>
              )}
              {onDelete && (
                <button
                  onClick={onDelete}
                  title="Delete appointment"
                  className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
              <button
                onClick={ev.isCompleted ? onUnmark : onComplete}
                title={ev.isCompleted ? "Mark as not done" : "Mark as complete"}
                className={cn(
                  "rounded-md p-1.5 transition-colors hover:bg-accent",
                  ev.isCompleted
                    ? "text-emerald-400 hover:text-muted-foreground"
                    : "text-muted-foreground hover:text-emerald-400",
                )}
              >
                {ev.isCompleted
                  ? <CheckSquare2 className="h-4 w-4" />
                  : <Square className="h-4 w-4" />
                }
              </button>
            </div>
          </div>
          {ev.location && (
            <p className="mt-1.5 flex items-center gap-1 text-[13px] text-muted-foreground">
              <MapPin className="h-3.5 w-3.5 shrink-0" />
              <a
                href={`https://maps.google.com/maps?q=${encodeURIComponent(ev.location)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2 hover:text-foreground"
              >
                {ev.location}
              </a>
            </p>
          )}
          {ev.description && (
            <p className="mt-1.5 text-sm leading-relaxed text-foreground/70">{ev.description}</p>
          )}
          {ev.isCompleted && ev.completedByName && (
            <p className="mt-2 flex items-center gap-1 text-xs text-emerald-400">
              <CheckCircle2 className="h-3 w-3 shrink-0" />
              Completed by {ev.completedByName}
              {ev.completedAt ? ` · ${fmtCompletedAt(ev.completedAt)}` : ""}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Day-view card: Task ────────────────────────────────────────────────────────

interface TaskDayCardProps {
  task:             UITask;
  onToggle:         () => void;
  onEdit?:          () => void;
  onDelete?:        () => void;
  dragHandleProps?: React.HTMLAttributes<HTMLButtonElement>;
}

function TaskDayCard({ task: t, onToggle, onEdit, onDelete, dragHandleProps }: TaskDayCardProps) {
  const Icon        = KIND_ICON[t.kind];
  const isCompleted = t.status === "completed";
  return (
    <div
      className={cn(
        "rounded-xl border border-border border-l-4 bg-card overflow-hidden transition-opacity",
        PRIORITY_BORDER[t.priority],
        isCompleted && "opacity-60",
      )}
      data-priority={t.priority}
      data-kind={t.kind}
      style={{ boxShadow: "var(--card-shadow)" }}
    >
      <div className="flex items-start gap-3 p-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent">
          <Icon className={cn("h-5 w-5", KIND_COLOR[t.kind])} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs tabular-nums text-muted-foreground">
                {t.hasTime ? `${t.time} · ` : ""}
                <span className={cn("font-medium", PRIORITY_TEXT[t.priority])}>
                  {PRIORITY_LABEL[t.priority]}
                </span>
              </p>
              <p className="mt-0.5 truncate font-medium text-foreground">{t.title}</p>
            </div>
            <div className="flex shrink-0 items-center gap-0.5">
              {dragHandleProps && (
                <button
                  {...dragHandleProps}
                  title="Drag to reorder"
                  className="cursor-grab rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground active:cursor-grabbing"
                >
                  <GripVertical className="h-4 w-4" />
                </button>
              )}
              {onEdit && (
                <button
                  onClick={onEdit}
                  title="Edit task"
                  className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  <Pencil className="h-4 w-4" />
                </button>
              )}
              {onDelete && (
                <button
                  onClick={onDelete}
                  title="Delete task"
                  className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
              <button
                onClick={onToggle}
                title={isCompleted ? "Mark as pending" : "Mark as complete"}
                className={cn(
                  "rounded-md p-1.5 transition-colors hover:bg-accent",
                  isCompleted
                    ? "text-emerald-400 hover:text-muted-foreground"
                    : "text-muted-foreground hover:text-emerald-400",
                )}
              >
                {isCompleted
                  ? <CheckSquare2 className="h-4 w-4" />
                  : <Square className="h-4 w-4" />
                }
              </button>
            </div>
          </div>
          {t.detail && (
            <p className="mt-1.5 text-sm leading-relaxed text-foreground/70">{t.detail}</p>
          )}
          {t.assigneeName && (
            <div className="mt-1.5 flex items-center gap-1.5">
              {t.assigneeAvatarUrl ? (
                <img src={t.assigneeAvatarUrl} alt="" className="h-4 w-4 shrink-0 rounded-full object-cover" />
              ) : (
                <div className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-accent">
                  <span className="text-[8px] font-semibold text-foreground">{t.assigneeName[0]}</span>
                </div>
              )}
              <span className="text-xs text-muted-foreground">{t.assigneeName.split(" ")[0]}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Sortable wrapper for timeless tasks ───────────────────────────────────────

function SortableTaskItem({
  task, onToggle, onEdit, onDelete,
}: {
  task: UITask;
  onToggle:  () => void;
  onEdit?:   () => void;
  onDelete?: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: task.id });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform:  CSS.Transform.toString(transform),
        transition,
        opacity:    isDragging ? 0.5 : 1,
        // "manipulation" allows the browser to handle scroll and tap on the
        // card normally; long-press still initiates drag via TouchSensor.
        // Previously this was "none" which fully blocked vertical scrolling
        // whenever a finger landed on a card — see SOP Section 9.
        touchAction: "manipulation",
      }}
    >
      <TaskDayCard
        task={task}
        onToggle={onToggle}
        onEdit={onEdit}
        onDelete={onDelete}
        dragHandleProps={{ ...attributes, ...listeners }}
      />
    </div>
  );
}

// ── Completed task row (Apple Reminders style) ─────────────────────────────────

function CompletedTaskRow({ task, onRestore }: { task: UITask; onRestore: (id: string) => void }) {
  return (
    <div className="flex items-center gap-3 py-1">
      <button
        type="button"
        aria-label={`Restore ${task.title}`}
        onClick={() => onRestore(task.id)}
        className="shrink-0 text-muted-foreground/50 transition-colors hover:text-muted-foreground"
      >
        <CheckCircle2 className="h-5 w-5" />
      </button>
      <span className="flex-1 truncate text-sm text-muted-foreground/50 line-through">
        {task.title}
      </span>
    </div>
  );
}

// ── Main view ──────────────────────────────────────────────────────────────────

function CalendarView() {
  const { user, profile }      = useAuth();
  const { careCircleId, role } = useCareCircle(user?.id);

  const today    = useMemo(() => new Date(), []);
  const todayKey = fmtDate(today);

  const [view, setView]                   = useState<"day" | "week" | "month">("day");
  const [referenceDate, setReferenceDate] = useState(new Date());
  const [selected, setSelected]           = useState<string | null>(null);

  // ── Date-jump input ──────────────────────────────────────────────────────
  const dateInputRef = useRef<HTMLInputElement>(null);

  // ── Appointment sheet state ──────────────────────────────────────────────
  const [apptSheetOpen,  setApptSheetOpen]  = useState(false);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [apptTitle,      setApptTitle]      = useState("");
  const [apptDate,       setApptDate]       = useState("");
  const [apptTime,       setApptTime]       = useState("09:00");
  const [apptLocation,   setApptLocation]   = useState("");
  const [apptNotes,      setApptNotes]      = useState("");

  // ── Task sheet state ─────────────────────────────────────────────────────
  const [taskSheetOpen,    setTaskSheetOpen]    = useState(false);
  const [editingTaskId,    setEditingTaskId]    = useState<string | null>(null);
  const [taskTitle,        setTaskTitle]        = useState("");
  const [taskDate,         setTaskDate]         = useState("");
  const [taskTime,         setTaskTime]         = useState("");
  const [taskPriority,     setTaskPriority]     = useState<UITask["priority"]>("medium");
  const [taskAssignedTo,   setTaskAssignedTo]   = useState<string>("");
  const [taskNotes,        setTaskNotes]        = useState("");

  const [submitting,      setSubmitting]      = useState(false);
  const [actionSheetOpen,   setActionSheetOpen]   = useState(false);
  const [addTaskSheetOpen,  setAddTaskSheetOpen]  = useState(false);
  const [addTaskDefaultDate, setAddTaskDefaultDate] = useState("");

  const canManage = can(role, "manage_events");
  const isOnline  = useOnlineStatus();

  // ── Drag-and-drop sensors (mouse + touch) ───────────────────────────────
  // MouseSensor (not PointerSensor) so mobile touch events flow ONLY through
  // TouchSensor's long-press path — otherwise the pointer events that modern
  // mobile browsers fire alongside touch get captured at 5px of movement and
  // block the browser's native vertical scroll on every card. Long-press
  // 150ms is required on mobile to initiate drag; the page scrolls freely
  // for any shorter touch interaction.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
  );

  function navigate(dir: -1 | 1) {
    setReferenceDate((d) => {
      const next = new Date(d);
      if (view === "day")        next.setDate(next.getDate() + dir);
      else if (view === "week")  next.setDate(next.getDate() + dir * 7);
      else                       next.setMonth(next.getMonth() + dir);
      return next;
    });
  }

  const { days, rangeStartISO, rangeEndISO } = useMemo(() => {
    let dates: Date[];

    if (view === "day") {
      const d = new Date(referenceDate);
      d.setHours(0, 0, 0, 0);
      dates = [d];
    } else if (view === "week") {
      const start = startOfWeek(referenceDate);
      dates = Array.from({ length: 7 }, (_, i) => {
        const d = new Date(start);
        d.setDate(start.getDate() + i);
        return d;
      });
    } else {
      const first = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), 1);
      const start = startOfWeek(first);
      dates = Array.from({ length: 35 }, (_, i) => {
        const d = new Date(start);
        d.setDate(start.getDate() + i);
        return d;
      });
    }

    const end = new Date(dates[dates.length - 1]);
    end.setHours(23, 59, 59, 999);

    return {
      days:          dates,
      rangeStartISO: dates[0].toISOString(),
      rangeEndISO:   end.toISOString(),
    };
  }, [view, referenceDate]);

  const periodLabel = useMemo(() => {
    if (view === "day") {
      const isToday = fmtDate(referenceDate) === todayKey;
      return isToday
        ? `Today, ${referenceDate.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`
        : referenceDate.toLocaleDateString(undefined, {
            weekday: "short", month: "short", day: "numeric", year: "numeric",
          });
    }
    if (view === "week") {
      const start = days[0];
      const end   = days[6];
      if (start.getMonth() === end.getMonth()) {
        return (
          start.toLocaleDateString(undefined, { month: "short", day: "numeric" }) +
          `–${end.getDate()}, ${end.getFullYear()}`
        );
      }
      return (
        start.toLocaleDateString(undefined, { month: "short", day: "numeric" }) +
        " – " +
        end.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
      );
    }
    return referenceDate.toLocaleDateString(undefined, { month: "short", year: "numeric" });
  }, [view, days, referenceDate, todayKey]);

  const { events, isLoading: eventsLoading, markComplete, unmarkComplete, addEvent, updateEvent, deleteEvent } =
    useCalendarEvents(careCircleId, rangeStartISO, rangeEndISO);

  const { tasks, completedUnscheduledTasks, isLoading: tasksLoading, toggleTask, restoreUnscheduledTask, addCalendarTask, updateCalendarTask, deleteCalendarTask, reorderTasks } =
    useCalendarTasks(careCircleId, rangeStartISO, rangeEndISO);

  const { members } = useMembers(careCircleId);

  const handleToggleTask = useCallback((task: UITask) => {
    const completing = task.status !== "completed";
    toggleTask(task.id, task.status);
    if (completing) {
      toast.success("Task completed", {
        description: task.title,
        duration: 5000,
        action: {
          label: "Undo",
          onClick: () => toggleTask(task.id, "completed"),
        },
        actionButtonStyle: {
          background: "var(--primary)",
          color: "var(--primary-foreground)",
          borderRadius: "6px",
          padding: "3px 10px",
          fontSize: "12px",
          fontWeight: "600",
          cursor: "pointer",
          border: "none",
        },
      });
    }
  }, [toggleTask]);

  const [showCompleted,          setShowCompleted]          = useState(false);
  const [showScheduledCompleted, setShowScheduledCompleted] = useState(false);

  const isLoading = eventsLoading || tasksLoading;

  const displayName = profile
    ? `${profile.first_name} ${profile.last_name}`
    : "Unknown";

  const eventsByDate = useMemo(() => {
    const m: Record<string, UICalendarEvent[]> = {};
    for (const e of events) (m[e.date] ||= []).push(e);
    return m;
  }, [events]);

  const tasksByDate = useMemo(() => {
    const m: Record<string, UITask[]> = {};
    for (const t of tasks) {
      const key = t.localDateKey;
      if (key) (m[key] ||= []).push(t);
    }
    return m;
  }, [tasks]);

  const isCurrentPeriod = useMemo(() => {
    if (view === "day")   return fmtDate(referenceDate) === todayKey;
    if (view === "week")  return days.some((d) => fmtDate(d) === todayKey);
    return (
      referenceDate.getFullYear() === today.getFullYear() &&
      referenceDate.getMonth()    === today.getMonth()
    );
  }, [view, days, referenceDate, todayKey, today]);

  const selectedEvents = selected ? (eventsByDate[selected] ?? []) : [];
  const selectedTasks  = selected ? (tasksByDate[selected]  ?? []) : [];

  const dayKey    = fmtDate(referenceDate);
  const dayEvents = view === "day" ? (eventsByDate[dayKey] ?? []) : [];

  const allDayTasks       = view === "day" ? (tasksByDate[dayKey] ?? []) : [];
  const activeDayTasks    = allDayTasks.filter((t) => t.status !== "completed");
  const completedDayTasks = allDayTasks.filter((t) => t.status === "completed");
  const timedDayTasks     = activeDayTasks
    .filter((t) => t.hasTime)
    .sort((a, b) => (a.rawDueDate ?? "").localeCompare(b.rawDueDate ?? ""));
  const untimedDayTasks   = activeDayTasks
    .filter((t) => !t.hasTime)
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

  // Unscheduled tasks have no due_date — they appear in every day view and
  // can't be represented in the date grid, so they get their own section.
  const unscheduledTasks = useMemo(
    () => tasks
      .filter((t) => t.localDateKey === null)
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)),
    [tasks],
  );

  // ── Sheet open helpers ──────────────────────────────────────────────────────

  const openApptSheet = (forDate?: string) => {
    setEditingEventId(null);
    setApptTitle("");
    setApptDate(forDate ?? fmtDate(referenceDate));
    setApptTime("09:00");
    setApptLocation("");
    setApptNotes("");
    setApptSheetOpen(true);
  };

  const openEditApptSheet = (ev: UICalendarEvent) => {
    setEditingEventId(ev.id);
    setApptTitle(ev.title);
    setApptDate(ev.date);
    setApptTime(isoToFormTime(ev.startISO));
    setApptLocation(ev.location ?? "");
    setApptNotes(ev.description ?? "");
    setApptSheetOpen(true);
  };

  const openTaskSheet = (forDate?: string) => {
    setAddTaskDefaultDate(forDate ?? fmtDate(referenceDate));
    setTaskAssignedTo("");
    setAddTaskSheetOpen(true);
  };

  const openEditTaskSheet = (task: UITask) => {
    setEditingTaskId(task.id);
    setTaskTitle(task.title);
    setTaskDate(task.localDateKey ?? "");
    setTaskTime(task.hasTime && task.rawDueDate ? isoToFormTime(task.rawDueDate) : "");
    setTaskPriority(task.priority);
    setTaskAssignedTo(task.assigneeId ?? "");
    setTaskNotes(task.detail ?? "");
    setTaskSheetOpen(true);
  };

  // ── Save handlers (add + edit unified) ─────────────────────────────────────

  const handleSaveAppt = async () => {
    if (!isOnline) { toast.error("You're offline — reconnect to make changes."); return; }
    if (!apptTitle.trim() || !apptDate) return;
    setSubmitting(true);
    const originalEvent = editingEventId ? (events.find((e) => e.id === editingEventId) ?? null) : null;
    const start = new Date(`${apptDate}T${apptTime}:00`);
    const end   = new Date(start.getTime() + 60 * 60 * 1000);

    if (editingEventId) {
      const { error } = await updateEvent(
        editingEventId,
        apptTitle.trim(),
        start.toISOString(),
        end.toISOString(),
        apptLocation || undefined,
        apptNotes || undefined,
      );
      setSubmitting(false);
      if (error) toast.error("Failed to update appointment", { description: error });
      else {
        setApptSheetOpen(false);
        toast.success("Appointment updated", {
          duration: 5000,
          action: {
            label: "Undo",
            onClick: () => {
              if (!originalEvent) return;
              const oldEnd = new Date(new Date(originalEvent.startISO).getTime() + 3600000);
              updateEvent(originalEvent.id, originalEvent.title, originalEvent.startISO, oldEnd.toISOString(), originalEvent.location ?? undefined, originalEvent.description ?? undefined);
            },
          },
        });
      }
    } else {
      const { error } = await addEvent(
        apptTitle.trim(),
        start.toISOString(),
        end.toISOString(),
        user?.id ?? "",
        apptLocation || undefined,
        apptNotes || undefined,
      );
      setSubmitting(false);
      if (error) toast.error("Failed to add appointment", { description: error });
      else { setApptSheetOpen(false); toast.success("Appointment added"); }
    }
  };

  const handleSaveTask = async () => {
    if (!isOnline) { toast.error("You're offline — reconnect to make changes."); return; }
    if (!taskTitle.trim()) return;
    setSubmitting(true);

    // Blank date = unscheduled (null due_date).  Time is only meaningful with a date.
    const dueDateValue: string | null = taskDate
      ? (taskTime ? new Date(`${taskDate}T${taskTime}:00`).toISOString() : taskDate)
      : null;

    if (editingTaskId) {
      const originalTask = tasks.find((t) => t.id === editingTaskId) ?? null;
      const { error } = await updateCalendarTask(editingTaskId, taskTitle.trim(), dueDateValue, taskPriority, taskAssignedTo || null, taskNotes.trim() || null);
      setSubmitting(false);
      if (error) toast.error("Failed to update task", { description: error });
      else {
        setTaskSheetOpen(false);
        toast.success("Task updated", {
          duration: 5000,
          action: {
            label: "Undo",
            onClick: () => {
              if (!originalTask) return;
              updateCalendarTask(originalTask.id, originalTask.title, originalTask.rawDueDate, originalTask.priority, originalTask.assigneeId, originalTask.detail);
            },
          },
        });
      }
    } else {
      const { error } = await addCalendarTask(taskTitle.trim(), dueDateValue, taskPriority, user?.id ?? "", taskAssignedTo || null, taskNotes.trim() || null);
      setSubmitting(false);
      if (error) toast.error("Failed to add task", { description: error });
      else { setTaskSheetOpen(false); toast.success("Task added"); }
    }
  };

  const handleUnscheduledDragEnd = async (event: DragEndEvent) => {
    if (!isOnline) return;
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oi = unscheduledTasks.findIndex((t) => t.id === active.id);
    const ni = unscheduledTasks.findIndex((t) => t.id === over.id);
    if (oi === -1 || ni === -1) return;
    await reorderTasks(arrayMove(unscheduledTasks, oi, ni).map((t) => t.id));
  };

  const handleRestoreTask = async (id: string) => {
    await restoreUnscheduledTask(id);
    toast.success("Task restored");
  };

  const handleDeleteEvent = async (id: string) => {
    if (!isOnline) { toast.error("You're offline — reconnect to make changes."); return; }
    await deleteEvent(id);
    toast.success("Appointment deleted");
  };

  const handleDeleteTask = async (id: string) => {
    if (!isOnline) { toast.error("You're offline — reconnect to make changes."); return; }
    await deleteCalendarTask(id);
    toast.success("Task deleted");
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    if (!isOnline) return;
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = untimedDayTasks.findIndex((t) => t.id === active.id);
    const newIndex = untimedDayTasks.findIndex((t) => t.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = arrayMove(untimedDayTasks, oldIndex, newIndex);
    await reorderTasks(reordered.map((t) => t.id));
  };

  return (
    <div className="mx-auto w-full max-w-5xl px-3 py-6 sm:px-4">

      {/* ── Header — stacks vertically on mobile, side-by-side on tablet+ ── */}
      <header className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Calendar
          </p>
          <div className="flex items-center gap-1">
            <button
              onClick={() => navigate(-1)}
              aria-label="Previous"
              className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-card-elevated hover:text-foreground"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="min-w-[140px] flex-1 text-center text-xl font-semibold tracking-tight sm:min-w-[200px] sm:flex-none">
              {periodLabel}
            </span>
            <button
              onClick={() => navigate(1)}
              aria-label="Next"
              className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-card-elevated hover:text-foreground"
            >
              <ChevronRight className="h-4 w-4" />
            </button>

            {/* Hidden native date picker — triggered by the calendar icon button */}
            <input
              ref={dateInputRef}
              type="date"
              className="sr-only"
              value={fmtDate(referenceDate)}
              onChange={(e) => {
                if (!e.target.value) return;
                const d = new Date(e.target.value + "T00:00:00");
                if (!isNaN(d.getTime())) setReferenceDate(d);
              }}
            />
            <button
              onClick={() => dateInputRef.current?.showPicker()}
              title="Jump to date"
              aria-label="Jump to date"
              className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-card-elevated hover:text-foreground"
            >
              <CalendarSearch className="h-4 w-4" />
            </button>

            {!isCurrentPeriod && (
              <button
                onClick={() => setReferenceDate(new Date())}
                className="ml-1 rounded-md px-2 py-0.5 text-xs font-medium text-muted-foreground ring-1 ring-border transition-colors hover:text-foreground"
              >
                Today
              </button>
            )}
          </div>
        </div>

        {/* View toggle — right-aligned on mobile (own row), inline on tablet+ */}
        <div className="inline-flex shrink-0 self-end rounded-lg border border-border bg-card p-0.5 sm:self-auto">
          {(["day", "week", "month"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm capitalize transition-colors sm:touch-target",
                view === v
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {v}
            </button>
          ))}
        </div>
      </header>

      {isLoading && <div className="h-64 animate-pulse rounded-xl bg-card" />}

      {/* ══════════════════════════════════════════════════════════════
          DAY VIEW
      ══════════════════════════════════════════════════════════════ */}
      {!isLoading && view === "day" && (
        <>
          {/* Single + button — sits below the Day/Week/Month toggle */}
          {canManage && isOnline && (
            <div className="mb-8 flex justify-end">
              <AddButton
                onClick={() => setActionSheetOpen(true)}
                label="Add task or appointment"
              />
            </div>
          )}

          <div className="flex flex-col gap-10">

            {/* ── Appointments card ── */}
            <div className="overflow-hidden rounded-2xl border border-border/60 bg-card/50" style={{ boxShadow: "var(--card-shadow-lg)" }}>
              <div className="px-4 pb-3 pt-4">
                <p className="text-sm font-semibold uppercase tracking-wider" style={{ color: "oklch(0.62 0.13 74)" }}>
                  Appointments
                </p>
              </div>
              <div className="mx-4 h-px bg-border/40" />
              <div className="flex flex-col gap-4 p-4">
                {dayEvents.length === 0 ? (
                  <p className="py-3 text-center text-sm text-muted-foreground">
                    No appointments scheduled.
                  </p>
                ) : (
                  dayEvents.map((ev) => (
                    <AppointmentCard
                      key={ev.id}
                      event={ev}
                      onComplete={() => user && markComplete(ev.id, user.id, displayName)}
                      onUnmark={() => unmarkComplete(ev.id)}
                      onEdit={canManage ? () => openEditApptSheet(ev) : undefined}
                      onDelete={canManage ? () => handleDeleteEvent(ev.id) : undefined}
                    />
                  ))
                )}
              </div>
            </div>

            {/* ── Tasks card — Scheduled + Unscheduled sub-sections ── */}
            <div className="overflow-hidden rounded-2xl border border-border/60 bg-card/50" style={{ boxShadow: "var(--card-shadow-lg)" }}>
              <div className="px-4 pb-3 pt-4">
                <p className="text-sm font-semibold uppercase tracking-wider" style={{ color: "oklch(0.62 0.13 74)" }}>
                  Tasks
                </p>
              </div>
              <div className="mx-4 h-px bg-border/40" />

              {/* Scheduled sub-section */}
              <div className="px-4 pb-5 pt-4">
                <p className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Scheduled
                </p>
                {allDayTasks.length === 0 ? (
                  <p className="py-2 text-center text-sm text-muted-foreground">
                    No tasks for this day.
                  </p>
                ) : (
                  <>
                    {/* Active tasks */}
                    {(timedDayTasks.length > 0 || untimedDayTasks.length > 0) && (
                      <div className="flex flex-col gap-4">
                        {timedDayTasks.map((t) => (
                          <TaskDayCard
                            key={t.id}
                            task={t}
                            onToggle={() => handleToggleTask(t)}
                            onEdit={canManage ? () => openEditTaskSheet(t) : undefined}
                            onDelete={canManage ? () => handleDeleteTask(t.id) : undefined}
                          />
                        ))}
                        {timedDayTasks.length > 0 && untimedDayTasks.length > 0 && (
                          <div className="flex items-center gap-2">
                            <div className="h-px flex-1 bg-border" />
                            <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "oklch(0.62 0.13 74)" }}>
                              No Time Set
                            </span>
                            <div className="h-px flex-1 bg-border" />
                          </div>
                        )}
                        <DndContext
                          sensors={sensors}
                          collisionDetection={closestCenter}
                          onDragEnd={handleDragEnd}
                        >
                          <SortableContext
                            items={untimedDayTasks.map((t) => t.id)}
                            strategy={verticalListSortingStrategy}
                          >
                            <div className="flex flex-col gap-4">
                              {untimedDayTasks.map((t) => (
                                <SortableTaskItem
                                  key={t.id}
                                  task={t}
                                  onToggle={() => handleToggleTask(t)}
                                  onEdit={canManage ? () => openEditTaskSheet(t) : undefined}
                                  onDelete={canManage ? () => handleDeleteTask(t.id) : undefined}
                                />
                              ))}
                            </div>
                          </SortableContext>
                        </DndContext>
                      </div>
                    )}

                    {/* Show Completed toggle — Apple Reminders style */}
                    {completedDayTasks.length > 0 && (
                      <div className={cn(timedDayTasks.length > 0 || untimedDayTasks.length > 0 ? "mt-3" : "")}>
                        <button
                          type="button"
                          onClick={() => setShowScheduledCompleted((v) => !v)}
                          className="flex items-center gap-1.5 text-xs text-muted-foreground/60 transition-colors hover:text-muted-foreground"
                        >
                          <ChevronRight
                            className={cn("h-3.5 w-3.5 transition-transform duration-200", showScheduledCompleted && "rotate-90")}
                          />
                          {showScheduledCompleted ? "Hide Completed" : `${completedDayTasks.length} Completed`}
                        </button>

                        <AnimatePresence initial={false}>
                          {showScheduledCompleted && (
                            <motion.div
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: "auto" }}
                              exit={{ opacity: 0, height: 0 }}
                              transition={{ duration: 0.2, ease: "easeInOut" }}
                              className="overflow-hidden"
                            >
                              <div className="mt-2 flex flex-col divide-y divide-border/30">
                                {completedDayTasks.map((task) => (
                                  <CompletedTaskRow
                                    key={task.id}
                                    task={task}
                                    onRestore={(id) => {
                                      toggleTask(id, "completed");
                                      toast.success("Task restored");
                                    }}
                                  />
                                ))}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    )}
                  </>
                )}
              </div>

              <div className="mx-4 my-4 h-px bg-border/40" />

              {/* Unscheduled sub-section — always shown */}
              <div className="px-4 pb-5 pt-2">
                <p className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Unscheduled
                </p>
                {unscheduledTasks.length === 0 && completedUnscheduledTasks.length === 0 ? (
                  <p className="py-2 text-center text-sm text-muted-foreground">
                    No unscheduled tasks.
                  </p>
                ) : (
                  <>
                    {unscheduledTasks.length > 0 && (
                      <DndContext
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        onDragEnd={handleUnscheduledDragEnd}
                      >
                        <SortableContext
                          items={unscheduledTasks.map((t) => t.id)}
                          strategy={verticalListSortingStrategy}
                        >
                          <div className="flex flex-col gap-4">
                            {unscheduledTasks.map((t) => (
                              <SortableTaskItem
                                key={t.id}
                                task={t}
                                onToggle={() => handleToggleTask(t)}
                                onEdit={canManage ? () => openEditTaskSheet(t) : undefined}
                                onDelete={canManage ? () => handleDeleteTask(t.id) : undefined}
                              />
                            ))}
                          </div>
                        </SortableContext>
                      </DndContext>
                    )}

                    {/* Show Completed toggle — Apple Reminders style */}
                    {completedUnscheduledTasks.length > 0 && (
                      <div className="mt-3">
                        <button
                          type="button"
                          onClick={() => setShowCompleted((v) => !v)}
                          className="flex items-center gap-1.5 text-xs text-muted-foreground/60 transition-colors hover:text-muted-foreground"
                        >
                          <ChevronRight
                            className={cn("h-3.5 w-3.5 transition-transform duration-200", showCompleted && "rotate-90")}
                          />
                          {showCompleted ? "Hide Completed" : `${completedUnscheduledTasks.length} Completed`}
                        </button>

                        <AnimatePresence initial={false}>
                          {showCompleted && (
                            <motion.div
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: "auto" }}
                              exit={{ opacity: 0, height: 0 }}
                              transition={{ duration: 0.2, ease: "easeInOut" }}
                              className="overflow-hidden"
                            >
                              <div className="mt-2 flex flex-col divide-y divide-border/30">
                                {completedUnscheduledTasks.map((task) => (
                                  <CompletedTaskRow
                                    key={task.id}
                                    task={task}
                                    onRestore={handleRestoreTask}
                                  />
                                ))}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>

          </div>
        </>
      )}

      {/* ══════════════════════════════════════════════════════════════
          WEEK / MONTH GRID VIEW
      ══════════════════════════════════════════════════════════════ */}
      {!isLoading && view !== "day" && (
        <>
          <div className="mb-3 flex items-center gap-4 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-sm bg-card-elevated ring-1 ring-border" />
              Appointments
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-sm border border-dashed border-border" />
              Tasks
            </span>
          </div>

          <div className="grid grid-cols-7 gap-px overflow-hidden rounded-xl border border-border bg-border">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
              <div
                key={d}
                className="bg-card-elevated px-2 py-2 text-center text-[11px] font-medium uppercase tracking-wider text-muted-foreground"
              >
                {d}
              </div>
            ))}
            {days.map((d) => {
              const key       = fmtDate(d);
              const dayEvts   = eventsByDate[key] ?? [];
              const dayTsks   = tasksByDate[key]  ?? [];
              const isToday   = key === todayKey;
              const inMonth   = d.getMonth() === referenceDate.getMonth();

              const shownEvents = dayEvts.slice(0, 2);
              const taskSlots   = Math.max(0, 3 - shownEvents.length);
              const shownTasks  = dayTsks.slice(0, taskSlots);
              const overflow    =
                (dayEvts.length - shownEvents.length) +
                (dayTsks.length  - shownTasks.length);

              return (
                <button
                  key={key}
                  onClick={() => setSelected(key)}
                  className={cn(
                    "flex min-h-[96px] flex-col gap-1 bg-card p-1.5 text-left transition-colors hover:bg-card-elevated",
                    !inMonth && view === "month" && "opacity-40",
                  )}
                >
                  <span
                    className={cn(
                      "inline-flex h-6 w-6 items-center justify-center rounded-full text-xs tabular-nums",
                      isToday
                        ? "bg-foreground text-background font-semibold"
                        : "text-muted-foreground",
                    )}
                  >
                    {d.getDate()}
                  </span>
                  <div className="flex flex-col gap-0.5">
                    {shownEvents.map((ev) => (
                      <EventChip key={ev.id} event={ev} compact />
                    ))}
                    {shownTasks.map((t) => (
                      <TaskChip key={t.id} task={t} compact />
                    ))}
                    {overflow > 0 && (
                      <span className="px-1 text-[10px] text-muted-foreground">
                        +{overflow} more
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </>
      )}

      {/* ── Action type sheet (day view + button) ── */}
      <ActionTypeSheet
        open={actionSheetOpen}
        onOpenChange={setActionSheetOpen}
        onTask={() => openTaskSheet()}
        onAppointment={() => openApptSheet()}
      />

      {/* ── Add task sheet — shared component, same as My Day ── */}
      <AddTaskSheet
        open={addTaskSheetOpen}
        onOpenChange={setAddTaskSheetOpen}
        defaultDate={addTaskDefaultDate}
        isOnline={isOnline}
        members={members}
        onSave={async (title, dueDate, priority, assignedTo, notes) =>
          addCalendarTask(title, dueDate, priority, user?.id ?? "", assignedTo, notes)
        }
      />

      {/* ══════════════════════════════════════════════════════════════
          DAY DETAIL SHEET (week / month tap)
      ══════════════════════════════════════════════════════════════ */}
      <Sheet open={selected !== null} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent className="bg-card">
          <SheetHeader>
            <SheetTitle>
              {selected &&
                new Date(selected + "T00:00:00").toLocaleDateString(undefined, {
                  weekday: "short", month: "short", day: "numeric",
                })}
            </SheetTitle>
            <SheetDescription>
              {selectedEvents.length === 0 && selectedTasks.length === 0
                ? "Nothing scheduled."
                : [
                    selectedEvents.length > 0 &&
                      `${selectedEvents.length} appointment${selectedEvents.length === 1 ? "" : "s"}`,
                    selectedTasks.length > 0 &&
                      `${selectedTasks.length} task${selectedTasks.length === 1 ? "" : "s"}`,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
            </SheetDescription>
            {/* Add buttons for the selected day */}
            {canManage && selected && (
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => openApptSheet(selected)}
                  className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground ring-1 ring-border transition-colors hover:bg-accent hover:text-foreground"
                >
                  <Plus className="h-3 w-3" />
                  Add Appointment
                </button>
                <button
                  type="button"
                  onClick={() => openTaskSheet(selected)}
                  className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground ring-1 ring-border transition-colors hover:bg-accent hover:text-foreground"
                >
                  <Plus className="h-3 w-3" />
                  Add Task
                </button>
              </div>
            )}
          </SheetHeader>

          <div className="mt-6 flex flex-col gap-6">

            <section>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Appointments
              </p>
              {selectedEvents.length === 0 ? (
                <p className="text-xs text-muted-foreground">None scheduled.</p>
              ) : (
                <div className="flex flex-col gap-3">
                  {selectedEvents.map((ev) => (
                    <div key={ev.id} className="flex gap-3">
                      <span className="mt-1 w-16 shrink-0 whitespace-nowrap text-xs font-medium tabular-nums text-muted-foreground">
                        {ev.time}
                      </span>
                      <div className="flex flex-1 flex-col gap-1">
                        <div className="flex items-center gap-2">
                          <div className="flex-1"><EventChip event={ev} /></div>
                          {canManage && (
                            <button
                              onClick={() => openEditApptSheet(ev)}
                              title="Edit"
                              className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                          )}
                          {canManage && (
                            <button
                              onClick={() => handleDeleteEvent(ev.id)}
                              title="Delete"
                              className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                          <button
                            onClick={() => ev.isCompleted ? unmarkComplete(ev.id) : user && markComplete(ev.id, user.id, displayName)}
                            title={ev.isCompleted ? "Mark as not done" : "Mark as complete"}
                            className={cn(
                              "rounded-md p-1 transition-colors hover:bg-card-elevated",
                              ev.isCompleted
                                ? "text-emerald-400 hover:text-muted-foreground"
                                : "text-muted-foreground hover:text-emerald-400",
                            )}
                          >
                            {ev.isCompleted
                              ? <CheckSquare2 className="h-3.5 w-3.5" />
                              : <Square className="h-3.5 w-3.5" />
                            }
                          </button>
                        </div>
                        {ev.isCompleted && ev.completedByName && (
                          <p className="pl-1 text-[11px] text-emerald-400">
                            Completed by {ev.completedByName}
                            {ev.completedAt ? ` · ${fmtCompletedAt(ev.completedAt)}` : ""}
                          </p>
                        )}
                        {ev.location && (
                          <p className="pl-1 flex items-center gap-1 text-xs text-muted-foreground">
                            <MapPin className="h-3 w-3 shrink-0" />
                            <a
                              href={`https://maps.google.com/maps?q=${encodeURIComponent(ev.location)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="underline underline-offset-2 hover:text-foreground"
                            >
                              {ev.location}
                            </a>
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Tasks
              </p>
              {selectedTasks.length === 0 ? (
                <p className="text-xs text-muted-foreground">None scheduled.</p>
              ) : (
                <div className="flex flex-col gap-3">
                  {selectedTasks.map((t) => (
                    <div key={t.id} className="flex gap-3">
                      <span className="mt-1 w-16 shrink-0 whitespace-nowrap text-xs font-medium tabular-nums text-muted-foreground">
                        {t.time}
                      </span>
                      <div className="flex flex-1 items-center gap-2">
                        <div className="flex-1"><TaskChip task={t} /></div>
                        {canManage && (
                          <button
                            onClick={() => openEditTaskSheet(t)}
                            title="Edit"
                            className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                        )}
                        {canManage && (
                          <button
                            onClick={() => handleDeleteTask(t.id)}
                            title="Delete"
                            className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                        <button
                          onClick={() => toggleTask(t.id, t.status)}
                          title={t.status === "completed" ? "Mark as pending" : "Mark as complete"}
                          className={cn(
                            "rounded-md p-1 transition-colors hover:bg-card-elevated",
                            t.status === "completed"
                              ? "text-emerald-400 hover:text-muted-foreground"
                              : "text-muted-foreground hover:text-emerald-400",
                          )}
                        >
                          {t.status === "completed"
                            ? <CheckSquare2 className="h-3.5 w-3.5" />
                            : <Square className="h-3.5 w-3.5" />
                          }
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

          </div>
        </SheetContent>
      </Sheet>

      {/* ══════════════════════════════════════════════════════════════
          ADD / EDIT APPOINTMENT SHEET
      ══════════════════════════════════════════════════════════════ */}
      <Sheet
        open={apptSheetOpen}
        onOpenChange={(o) => { if (!o) { setApptSheetOpen(false); setEditingEventId(null); } }}
      >
        <SheetContent>
          <SheetHeader>
            <SheetTitle>{editingEventId ? "Edit Appointment" : "Add Appointment"}</SheetTitle>
          </SheetHeader>
          <div className="mt-6 flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-foreground">Title</label>
              <input
                type="text"
                value={apptTitle}
                onChange={(e) => setApptTitle(e.target.value)}
                placeholder="e.g. Cardiology follow-up"
                className={INPUT}
                autoFocus
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-foreground">Date</label>
                <input
                  type="date"
                  value={apptDate}
                  onChange={(e) => setApptDate(e.target.value)}
                  className={INPUT}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-foreground">Time</label>
                <TimeInput
                  value={apptTime}
                  onChange={setApptTime}
                  className={INPUT}
                />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-foreground">
                Location <span className="text-muted-foreground font-normal">(optional)</span>
              </label>
              <input
                type="text"
                value={apptLocation}
                onChange={(e) => setApptLocation(e.target.value)}
                placeholder="e.g. St. Mary's Hospital, Room 204"
                className={INPUT}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-foreground">
                Notes <span className="text-muted-foreground font-normal">(optional)</span>
              </label>
              <textarea
                value={apptNotes}
                onChange={(e) => setApptNotes(e.target.value)}
                placeholder="Any relevant details…"
                rows={3}
                className={`${INPUT} resize-none`}
              />
            </div>
          </div>
          <SheetFooter className="mt-6">
            <Button variant="outline" onClick={() => { setApptSheetOpen(false); setEditingEventId(null); }}>
              Cancel
            </Button>
            <Button
              onClick={handleSaveAppt}
              disabled={!apptTitle.trim() || !apptDate || submitting}
            >
              {submitting ? "Saving…" : editingEventId ? "Save Changes" : "Add Appointment"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* ══════════════════════════════════════════════════════════════
          ADD / EDIT TASK SHEET
      ══════════════════════════════════════════════════════════════ */}
      <Sheet
        open={taskSheetOpen}
        onOpenChange={(o) => { if (!o) { setTaskSheetOpen(false); setEditingTaskId(null); } }}
      >
        <SheetContent>
          <SheetHeader>
            <SheetTitle>{editingTaskId ? "Edit Task" : "Add Task"}</SheetTitle>
          </SheetHeader>
          <div className="mt-6 flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-foreground">Title</label>
              <input
                type="text"
                value={taskTitle}
                onChange={(e) => setTaskTitle(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSaveTask()}
                placeholder="e.g. Check blood pressure"
                className={INPUT}
                autoFocus
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-foreground">
                  Date <span className="text-muted-foreground font-normal">(optional)</span>
                </label>
                <input
                  type="date"
                  value={taskDate}
                  onChange={(e) => setTaskDate(e.target.value)}
                  className={INPUT}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-foreground">
                  Time <span className="text-muted-foreground font-normal">(optional)</span>
                </label>
                <TimeInput
                  value={taskTime}
                  onChange={setTaskTime}
                  className={INPUT}
                />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-foreground">Priority</label>
              <select
                value={taskPriority}
                onChange={(e) => setTaskPriority(e.target.value as UITask["priority"])}
                className={INPUT}
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </div>
            {members.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-foreground">
                  Assign to
                  <span className="ml-1.5 text-xs font-normal text-muted-foreground">(optional)</span>
                </label>
                <select
                  value={taskAssignedTo}
                  onChange={(e) => setTaskAssignedTo(e.target.value)}
                  className={INPUT}
                >
                  <option value="">Unassigned</option>
                  {members.map((m) => (
                    <option key={m.userId} value={m.userId}>
                      {m.firstName} {m.lastName}{m.userId === user?.id ? " (me)" : ""}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-foreground">
                Notes <span className="text-muted-foreground font-normal">(optional)</span>
              </label>
              <textarea
                value={taskNotes}
                onChange={(e) => setTaskNotes(e.target.value)}
                placeholder="Any relevant details…"
                rows={3}
                className={`${INPUT} resize-none`}
              />
            </div>
          </div>
          <SheetFooter className="mt-6">
            <Button variant="outline" onClick={() => { setTaskSheetOpen(false); setEditingTaskId(null); }}>
              Cancel
            </Button>
            <Button
              onClick={handleSaveTask}
              disabled={!taskTitle.trim() || submitting}
            >
              {submitting ? "Saving…" : editingTaskId ? "Save Changes" : "Add Task"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

    </div>
  );
}
