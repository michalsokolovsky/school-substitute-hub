import {
  SCHEDULE_DAYS,
  SCHEDULE_LESSONS,
  SLOT_STATUS_LABEL,
  emptyScheduleSlot,
  formatClassLabel,
  type ScheduleSlot,
  type SlotStatus,
} from "@/lib/schedule";

const STATUS_STYLE: Record<SlotStatus, string> = {
  teaching: "bg-blue-100 text-blue-900",
  free: "bg-secondary text-muted-foreground",
  available: "bg-green-100 text-green-800",
  unavailable: "bg-red-100 text-red-800",
};

const STATUSES = Object.keys(SLOT_STATUS_LABEL) as SlotStatus[];

export function ScheduleView({ grid }: { grid: Record<string, ScheduleSlot> }) {
  // getDay(): 0 is Sunday, which is the first column. Saturday (6) has no column.
  const todayDay = new Date().getDay();
  const todayColumn = todayDay < SCHEDULE_DAYS.length ? todayDay : -1;

  const counts: Record<SlotStatus, number> = { teaching: 0, free: 0, available: 0, unavailable: 0 };
  for (const slot of Object.values(grid)) counts[slot.status]++;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {STATUSES.map((status) => (
          <span
            key={status}
            className={`rounded-full px-3 py-1 font-medium ${STATUS_STYLE[status]}`}
          >
            {SLOT_STATUS_LABEL[status]} · {counts[status]}
          </span>
        ))}
      </div>
      <div className="overflow-x-auto rounded-lg border bg-card p-3">
        <div className="grid min-w-[640px] grid-cols-[2rem_repeat(6,minmax(0,1fr))] gap-1">
          <div />
          {SCHEDULE_DAYS.map((day, d) => (
            <div
              key={day}
              className={`border-b-2 py-1 text-center text-xs ${
                d === todayColumn
                  ? "border-primary font-semibold text-primary"
                  : "border-transparent text-muted-foreground"
              }`}
            >
              {day}
            </div>
          ))}
          {SCHEDULE_LESSONS.map((lesson) => (
            <Row key={lesson} lesson={lesson} grid={grid} />
          ))}
        </div>
      </div>
    </div>
  );
}

function Row({ lesson, grid }: { lesson: number; grid: Record<string, ScheduleSlot> }) {
  return (
    <>
      <div className="flex items-center justify-center text-xs text-muted-foreground">{lesson}</div>
      {SCHEDULE_DAYS.map((day, d) => {
        const slot = grid[`${d}-${lesson}`] ?? emptyScheduleSlot();
        const classLabel = formatClassLabel(slot.grade_level, slot.class_name);
        return (
          <div
            key={day}
            className={`flex min-h-[2.75rem] flex-col items-center justify-center rounded-md px-1 py-1 text-center text-xs leading-tight ${STATUS_STYLE[slot.status]}`}
          >
            {slot.status === "teaching" ? (
              <>
                <span className="font-semibold">{slot.subject || SLOT_STATUS_LABEL.teaching}</span>
                {(classLabel || slot.ability_group) && (
                  <span>{[classLabel, slot.ability_group].filter(Boolean).join(" · ")}</span>
                )}
              </>
            ) : (
              SLOT_STATUS_LABEL[slot.status]
            )}
          </div>
        );
      })}
    </>
  );
}
