"use client";

import { Button } from "../ui/Button";
import { FILTERS, filterById, templateById } from "../../lib/content";
import type { Partner, SessionState } from "../../lib/types";
import { store } from "../../lib/store/useSession";

export function FilterScreen({
  code,
  state,
  self,
}: {
  code: string;
  state: SessionState;
  self: Partner;
}) {
  const filter = filterById(state.filterId);
  const template = templateById(state.templateConfirmed);

  function frameFor(shot: (typeof state.shots)[number]) {
    return shot.frames[self.id] ?? Object.values(shot.frames)[0] ?? null;
  }

  return (
    <div className="flex flex-col items-center text-center gap-1 w-full">
      <h1 className="font-display text-2xl text-paper mb-1">Choose a filter</h1>
      <p className="text-mist text-sm mb-6">Either of you can change it — updates for both</p>

      <div
        className="rounded-lg overflow-hidden p-1.5 flex flex-col gap-1 mb-6"
        style={{ backgroundColor: template.stripBase, width: 160 }}
      >
        {state.shots.map((shot) => {
          const frame = frameFor(shot);
          return (
            <div
              key={shot.index}
              className="aspect-[3/2] rounded-sm overflow-hidden"
              style={{ backgroundColor: template.swatch }}
            >
              {frame && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={frame}
                  alt=""
                  className="w-full h-full object-cover"
                  style={{ filter: filter.css }}
                />
              )}
            </div>
          );
        })}
      </div>

      <div className="flex gap-2 overflow-x-auto w-full pb-2 mb-6 justify-center">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => store.setFilter(code, self.id, f.id)}
            className={`shrink-0 flex flex-col items-center gap-1.5 rounded-lg border px-3 py-2 ${
              state.filterId === f.id ? "border-flash-pink" : "border-white/10"
            }`}
          >
            <div
              className="w-9 h-9 rounded-full bg-mist"
              style={{ filter: f.css }}
            />
            <span className="font-utility text-[11px] text-mist">{f.label}</span>
          </button>
        ))}
      </div>

      <Button onClick={() => store.advanceStep(code, self.id, "shared")}>
        View strip
      </Button>
    </div>
  );
}
