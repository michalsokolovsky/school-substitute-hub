import {
  SCHEDULE_DAYS,
  SCHEDULE_LESSONS,
  SLOT_STATUS_LABEL,
  needsAbilityGroup,
  emptyScheduleSlot,
  parseClassFields,
  CLASS_NUMBERS,
  CLASS_LETTERS,
  ABILITY_GROUPS,
  type ScheduleSlot,
  type SlotStatus,
} from "@/lib/schedule";

type ScheduleEditorProps = {
  grid: Record<string, ScheduleSlot>;
  readOnly?: boolean;
  onUpdateSlot: (key: string, patch: Partial<ScheduleSlot>) => void;
};

function ClassPicker({
  slot,
  readOnly,
  onChange,
}: {
  slot: ScheduleSlot;
  readOnly: boolean;
  onChange: (patch: Partial<ScheduleSlot>) => void;
}) {
  const { classNumber, classLetter } = parseClassFields(slot.class_name, slot.grade_level);

  return (
    <div className="flex items-center gap-1">
      <select
        disabled={readOnly}
        value={classLetter}
        onChange={(e) => onChange({ class_name: e.target.value })}
        className="min-w-0 flex-1 rounded border bg-background px-1 py-1 text-xs"
        aria-label="אות כיתה"
      >
        <option value="">כיתה</option>
        {CLASS_LETTERS.map((letter) => (
          <option key={letter} value={letter}>
            {letter}
          </option>
        ))}
      </select>
      <select
        disabled={readOnly}
        value={classNumber}
        onChange={(e) => onChange({ grade_level: e.target.value })}
        className="w-9 shrink-0 rounded border bg-background px-0.5 py-1 text-center text-xs"
        aria-label="מספר כיתה"
      >
        <option value="">—</option>
        {CLASS_NUMBERS.map((num) => (
          <option key={num} value={num}>
            {num}
          </option>
        ))}
      </select>
    </div>
  );
}

export function ScheduleEditor({ grid, readOnly = false, onUpdateSlot }: ScheduleEditorProps) {
  return (
    <div className="overflow-x-auto rounded-lg border bg-card">
      <table className="w-full border-collapse text-sm">
        <thead className="bg-secondary">
          <tr>
            <th className="border p-2 font-medium">שיעור</th>
            {SCHEDULE_DAYS.map((d) => (
              <th key={d} className="border p-2 font-medium">
                {d}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {SCHEDULE_LESSONS.map((l) => (
            <tr key={l}>
              <td className="border bg-secondary/50 p-2 text-center font-medium">{l}</td>
              {SCHEDULE_DAYS.map((_, d) => {
                const key = `${d}-${l}`;
                const slot = grid[key] ?? emptyScheduleSlot();
                return (
                  <td key={key} className="border p-2 align-top">
                    <select
                      disabled={readOnly}
                      value={slot.status}
                      onChange={(e) =>
                        onUpdateSlot(key, { status: e.target.value as SlotStatus })
                      }
                      className="w-full rounded border bg-background px-2 py-1 text-xs"
                    >
                      {Object.entries(SLOT_STATUS_LABEL).map(([v, label]) => (
                        <option key={v} value={v}>
                          {label}
                        </option>
                      ))}
                    </select>
                    {slot.status === "teaching" && (
                      <div className="mt-1 space-y-1">
                        <input
                          disabled={readOnly}
                          placeholder="מקצוע"
                          value={slot.subject}
                          onChange={(e) => {
                            const subject = e.target.value;
                            const patch: Partial<ScheduleSlot> = { subject };
                            if (!needsAbilityGroup(subject)) patch.ability_group = "";
                            onUpdateSlot(key, patch);
                          }}
                          className="w-full rounded border bg-background px-2 py-1 text-xs"
                        />
                        <ClassPicker
                          slot={slot}
                          readOnly={readOnly}
                          onChange={(patch) => onUpdateSlot(key, patch)}
                        />
                        {needsAbilityGroup(slot.subject) && (
                          <select
                            disabled={readOnly}
                            value={slot.ability_group}
                            onChange={(e) => onUpdateSlot(key, { ability_group: e.target.value })}
                            className="w-full rounded border bg-background px-2 py-1 text-xs"
                          >
                            <option value="">הקבצה</option>
                            {ABILITY_GROUPS.map((g) => (
                              <option key={g} value={g}>
                                {g}
                              </option>
                            ))}
                          </select>
                        )}
                      </div>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
