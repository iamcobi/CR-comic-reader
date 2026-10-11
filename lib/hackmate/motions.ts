// One named state per meaningful event; only one plays at a time.
export const motions = [
  {
    id: "idle",
    name: "At ease",
    trigger: "Waiting for you",
    glyph: "",
    duration: 5000,
  },
  {
    id: "greeting",
    name: "Hello wave",
    trigger: "Opening the companion",
    glyph: "✧",
    duration: 2200,
  },
  {
    id: "listening",
    name: "Listening lean",
    trigger: "Microphone active",
    glyph: "◉",
    duration: 1800,
  },
  {
    id: "transcribing",
    name: "Catching words",
    trigger: "Speech becomes text",
    glyph: "…",
    duration: 1200,
  },
  {
    id: "thinking",
    name: "Thinking orbit",
    trigger: "Waiting for an AI response",
    glyph: "·",
    duration: 2600,
  },
  {
    id: "searching",
    name: "Looking around",
    trigger: "Checking the next task",
    glyph: "⌕",
    duration: 1800,
  },
  {
    id: "reading",
    name: "Reading the brief",
    trigger: "Adding or using documents",
    glyph: "≡",
    duration: 2200,
  },
  {
    id: "understanding",
    name: "Got-it nod",
    trigger: "A request is understood",
    glyph: "✓",
    duration: 1000,
  },
  {
    id: "speaking",
    name: "Talking rhythm",
    trigger: "Voice playback actually starts",
    glyph: "〰",
    duration: 900,
  },
  {
    id: "asking",
    name: "Curious tilt",
    trigger: "Asking about your team",
    glyph: "?",
    duration: 1600,
  },
  {
    id: "suggesting",
    name: "Idea spark",
    trigger: "Project ideas arrive",
    glyph: "✦",
    duration: 1700,
  },
  {
    id: "choosing",
    name: "Decision nod",
    trigger: "Selecting a project",
    glyph: "↗",
    duration: 1200,
  },
  {
    id: "planning",
    name: "Putting it together",
    trigger: "Creating a game plan",
    glyph: "⋮",
    duration: 2400,
  },
  {
    id: "adding-task",
    name: "Write & place",
    trigger: "Adding a to-do",
    glyph: "+",
    duration: 1600,
  },
  {
    id: "assigning-task",
    name: "Your turn",
    trigger: "Giving someone a task",
    glyph: "→",
    duration: 1400,
  },
  {
    id: "completing-task",
    name: "Check it off",
    trigger: "Completing a task",
    glyph: "✓",
    duration: 1300,
  },
  {
    id: "celebrating",
    name: "Little victory",
    trigger: "Finishing a milestone",
    glyph: "✧",
    duration: 2200,
  },
  {
    id: "welcoming-member",
    name: "Meet the crew",
    trigger: "Adding a teammate",
    glyph: "♡",
    duration: 1800,
  },
  {
    id: "team-checkin",
    name: "Bring it in",
    trigger: "A team bonding check-in",
    glyph: "♡",
    duration: 2300,
  },
  {
    id: "encouraging",
    name: "You’ve got this",
    trigger: "A teammate needs encouragement",
    glyph: "↗",
    duration: 1800,
  },
  {
    id: "spotting-blocker",
    name: "Something’s stuck",
    trigger: "A task is marked blocked",
    glyph: "!",
    duration: 1500,
  },
  {
    id: "resolving-blocker",
    name: "Room to breathe",
    trigger: "A blocked task is reopened",
    glyph: "↝",
    duration: 2000,
  },
  {
    id: "deadline-reminder",
    name: "Time to scope",
    trigger: "Discussing time remaining",
    glyph: "◷",
    duration: 1600,
  },
  {
    id: "focusing",
    name: "One thing at a time",
    trigger: "Narrowing the project scope",
    glyph: "·",
    duration: 2200,
  },
  {
    id: "explaining",
    name: "Let me show you",
    trigger: "Explaining a coding concept",
    glyph: "⌘",
    duration: 2200,
  },
  {
    id: "remembering",
    name: "Keeping context",
    trigger: "Loading your saved workspace",
    glyph: "⋯",
    duration: 1600,
  },
  {
    id: "saving",
    name: "Safe & sound",
    trigger: "Saving an explicit edit",
    glyph: "✓",
    duration: 1100,
  },
  {
    id: "exporting",
    name: "Take it with you",
    trigger: "Exporting the team plan",
    glyph: "↓",
    duration: 1600,
  },
  {
    id: "error",
    name: "Try that again",
    trigger: "A request fails",
    glyph: "!",
    duration: 1300,
  },
  {
    id: "goodbye",
    name: "See you soon",
    trigger: "Ending a voice session",
    glyph: "·",
    duration: 2200,
  },
] as const;
export type Motion = (typeof motions)[number]["id"];
export function conversationMotion(text: string): Motion {
  if (/bond|check.?in|team morale/i.test(text)) return "team-checkin";
  if (/stuck|block|problem/i.test(text)) return "spotting-blocker";
  if (/explain|teach|code/i.test(text)) return "explaining";
  if (/overwhelm|stress|motivat|encourag/i.test(text)) return "encouraging";
  if (/deadline|time left|hours/i.test(text)) return "deadline-reminder";
  if (/focus|scope|simpl/i.test(text)) return "focusing";
  if (/next|start/i.test(text)) return "searching";
  if (/team|teammate/i.test(text)) return "asking";
  return "understanding";
}

export function operationMotions(
  operations: import("./types").AssistantOperation[],
): Motion[] {
  return [
    ...new Set(
      operations.map((op): Motion => {
        if (op.type === "add_member") return "welcoming-member";
        if (op.type === "remove_member" || op.type === "update_member")
          return "saving";
        if (op.type === "add_tasks") return "adding-task";
        if (op.type === "select_idea") return "choosing";
        if (op.type === "set_event")
          return op.hours !== undefined ? "deadline-reminder" : "remembering";
        if (op.type === "update_task")
          return op.status === "done"
            ? "completing-task"
            : op.status === "blocked"
              ? "spotting-blocker"
              : op.status === "todo"
                ? "resolving-blocker"
                : op.ownerId !== undefined
                  ? "assigning-task"
                  : "focusing";
        return "saving";
      }),
    ),
  ];
}

export function intakeMotion(
  stage: import("./intake").IntakeStage,
  accepted: boolean,
): Motion {
  if (!accepted) return "asking";
  const gestures: Record<import("./intake").IntakeStage, Motion> = {
    event: "remembering",
    team: "welcoming-member",
    experience: "remembering",
    goal: "focusing",
    documents: "reading",
    hours: "deadline-reminder",
    done: "understanding",
  };
  return gestures[stage];
}
