import { motions, type Motion } from "@/lib/hackmate/motions";

// The silhouette stays familiar. Arms grow from shoulder anchors only when needed.
const arms = new Set<Motion>([
  "greeting",
  "goodbye",
  "suggesting",
  "choosing",
  "planning",
  "adding-task",
  "assigning-task",
  "completing-task",
  "celebrating",
  "welcoming-member",
  "team-checkin",
  "encouraging",
  "resolving-blocker",
  "explaining",
  "reading",
  "saving",
  "exporting",
]);
const extra = new Set<Motion>([
  "planning",
  "adding-task",
  "resolving-blocker",
  "saving",
]);

export function Companion({
  motion,
  talking = false,
}: {
  motion: Motion;
  talking?: boolean;
}) {
  const state = motions.find((m) => m.id === motion)!;
  return (
    <div
      className="companion"
      data-motion={motion}
      data-speaking={talking}
      data-arms={arms.has(motion)}
      data-extra={extra.has(motion)}
      aria-hidden="true"
    >
      <div className="halo" />
      <div className="shadow" />
      <div className="character">
        <svg viewBox="0 0 260 260" className="pip-svg">
          <g transform="translate(15 0)">
            <g transform="translate(51 137)">
              <g className="pip-limb">
                <g className="pip-arm left-arm">
                  <path d="M0 0 Q-28 -8 -28 -42" />
                </g>
              </g>
            </g>
            <g transform="translate(149 137)">
              <g className="pip-limb">
                <g className="pip-arm right-arm">
                  <path d="M0 0 Q72 -6 77 -45" />
                </g>
              </g>
            </g>
            <g transform="translate(51 163)">
              <g className="pip-extra">
                <g className="pip-arm extra-arm">
                  <path d="M0 0 Q-30 10 -34 34" />
                </g>
              </g>
            </g>
            <g transform="translate(149 163)">
              <g className="pip-extra">
                <g className="pip-arm extra-arm">
                  <path d="M0 0 Q62 10 67 32" />
                </g>
              </g>
            </g>
            <path
              fill="#050505"
              d="M38 91 C38 49 70 18 113 18 C158 18 193 49 193 94 C193 122 178 143 157 159 L157 207 Q157 225 137 225 Q117 225 116 208 L115 204 Q113 182 97 182 Q79 182 78 207 Q78 225 58 225 Q38 225 38 207 Z"
            />
            <g className="pip-eyes" fill="white">
              <circle cx="86" cy="85" r="9.5" />
              <circle cx="144" cy="85" r="9.5" />
            </g>
            <path
              className="pip-smile"
              d="M97 110 Q113 123 132 111"
              fill="none"
              stroke="white"
              strokeWidth="6"
              strokeLinecap="round"
            />
          </g>
        </svg>
      </div>
      <span className="motion-mark">{state.glyph}</span>
    </div>
  );
}
