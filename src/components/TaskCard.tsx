import { Pill, Stethoscope, Car, Activity, Trash2, GripVertical, Pencil } from "lucide-react";
import type { UITask, TaskKind } from "@/lib/adapters";
import { cn } from "@/lib/utils";

const ICON: Record<TaskKind, React.ComponentType<{ className?: string }>> = {
  medication:  Pill,
  appointment: Stethoscope,
  transport:   Car,
  vitals:      Activity,
};

const PRIORITY_BORDER: Record<UITask["priority"], string> = {
  critical: "border-l-[var(--destructive)]",
  high:     "border-l-[var(--warning)]",
  medium:   "border-l-[var(--user-nurse)]",
  low:      "border-l-[var(--muted-foreground)]",
};

interface TaskCardProps {
  task:             UITask;
  onComplete:       (id: string) => void;
  onEdit?:          (id: string) => void;
  onDelete?:        (id: string) => void;
  dragHandleProps?: React.HTMLAttributes<HTMLButtonElement>;
  showAssignee?:    boolean;
}

export function TaskCard({ task, onComplete, onEdit, onDelete, dragHandleProps, showAssignee = false }: TaskCardProps) {
  const Icon        = ICON[task.kind];
  const borderClass = PRIORITY_BORDER[task.priority];

  return (
    <div
      className={cn(
        "flex items-stretch gap-3 rounded-xl border border-border border-l-4 bg-card",
        borderClass,
      )}
      data-priority={task.priority}
      data-kind={task.kind}
      style={{ boxShadow: "var(--card-shadow)" }}
    >
      {/* Time column — narrower on mobile to leave room for action buttons */}
      <div className={cn(
        "flex w-20 shrink-0 flex-col justify-center border-r border-border py-3 px-2 sm:w-24 sm:px-3",
        task.hasTime ? "items-end" : "items-center",
      )}>
        <span className="whitespace-nowrap text-sm font-semibold tabular-nums">{task.time}</span>
      </div>

      {/* Content */}
      <div className="flex min-w-0 flex-1 items-center gap-2 py-3 pr-1 sm:gap-3 sm:pr-2">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent sm:h-9 sm:w-9">
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">{task.title}</p>
          {task.detail && (
            <p className="mt-0.5 truncate text-xs text-muted-foreground">{task.detail}</p>
          )}
          {showAssignee && task.assigneeName && (
            <div className="mt-1 flex items-center gap-1">
              {task.assigneeAvatarUrl ? (
                <img src={task.assigneeAvatarUrl} alt="" className="h-4 w-4 shrink-0 rounded-full object-cover" />
              ) : (
                <div className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-accent">
                  <span className="text-[8px] font-semibold text-foreground">{task.assigneeName[0]}</span>
                </div>
              )}
              <span className="truncate text-xs text-muted-foreground">{task.assigneeName.split(" ")[0]}</span>
            </div>
          )}
        </div>
      </div>

      {/* Actions — compact on mobile (36px), full touch-target (44px) on tablet+ */}
      <div className="flex shrink-0 items-center gap-0 pr-1 sm:gap-0.5 sm:pr-2">
        {dragHandleProps && (
          <button
            {...dragHandleProps}
            title="Drag to reorder"
            className="cursor-grab flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground active:cursor-grabbing sm:h-11 sm:w-11"
          >
            <GripVertical className="h-4 w-4" />
          </button>
        )}
        {onEdit && (
          <button
            type="button"
            aria-label={`Edit ${task.title}`}
            onClick={() => onEdit(task.id)}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground sm:h-11 sm:w-11"
          >
            <Pencil className="h-4 w-4" />
          </button>
        )}
        {onDelete && (
          <button
            type="button"
            aria-label={`Delete ${task.title}`}
            onClick={() => onDelete(task.id)}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive sm:h-11 sm:w-11"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
        <button
          type="button"
          aria-label={`Complete ${task.title}`}
          onClick={() => onComplete(task.id)}
          className="touch-target group flex shrink-0 items-center justify-center pl-1"
        >
          <span className="grid h-7 w-7 place-items-center rounded-full border-2 border-border-strong transition-colors group-hover:border-[var(--success)] group-active:bg-[var(--success)]/20" />
        </button>
      </div>
    </div>
  );
}
