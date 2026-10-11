import { buildHours } from "./conversation-route";
import type { Workspace, Provider } from "./types";

export const stages = [
  "event",
  "team",
  "experience",
  "goal",
  "documents",
  "hours",
  "done",
] as const;
export type IntakeStage = (typeof stages)[number];
export type Intake = { stage: IntakeStage; skipped: string[]; confirmed?: string[] };
export const questions: Record<IntakeStage, string> = {
  event:
    "Let’s meet our hackathon first. What’s its name? Include the university, location, or date if you know them.",
  team: "Who’s on our team, including you? Tell me each person’s name, coding skills, and experience level. If a detail is unknown, say so. You can also add them in Our team.",
  experience:
    "Have you done a hackathon before? Tell me what worked, what went wrong, or say this is your first. I’ll use that to shape our plan.",
  goal: "What do you want to build or explore? A problem, interest, or goal is enough. If you haven’t decided, say so—we’ll explore ideas after reading the hackathon materials.",
  documents:
    "Please attach the hackathon brief, rules, or sponsor documents using the paperclip, or paste the relevant text here. I’ll use them before suggesting projects. If you don’t have them, tell me explicitly.",
  hours:
    "How many hours do we have to build? If the schedule isn’t known yet, tell me that.",
  done: "I have our starting context. Would you like project ideas, a team check-in, or help refining your own project?",
};
export function freshWorkspace(provider: Provider = "nvidia"): Workspace {
  return {
    event: "",
    hours: 24,
    goal: "",
    members: [],
    documents: [],
    ideas: [],
    selectedIdea: null,
    tasks: [],
    messages: [],
    companion: { name: "Pip", color: "#050505" },
    provider,
    intake: { stage: "event", skipped: [] },
  };
}
export function currentIntake(w: Workspace): Intake {
  if (w.intake) {
    if (w.intake.stage === "done") {
      const skipped = w.intake.skipped;
      if (!w.event && !skipped.includes("event"))
        return { ...w.intake, stage: "event" };
      if (
        (!w.members.length ||
          w.members.some(
            (m) => !m.name.trim() || !m.skills.trim() || !m.level,
          )) &&
        !skipped.includes("team")
      )
        return { ...w.intake, stage: "team" };
      if (!w.goal && !skipped.includes("goal"))
        return { ...w.intake, stage: "goal" };
      if (
        !w.documents.some(
          (d) => d.id !== "sample" && !d.id.startsWith("research-"),
        ) &&
        !skipped.includes("documents")
      )
        return { ...w.intake, stage: "documents" };
    }
    const known: Record<string, boolean> = {
      event: Boolean(w.event.trim()),
      team: Boolean(w.members.length && w.members.every(m => m.name.trim() && m.skills.trim() && m.level)),
      experience: Boolean(w.pastExperience?.trim()),
      goal: Boolean(w.goal.trim()),
      documents: w.documents.some(d => d.id !== "sample" && !d.id.startsWith("research-")),
      hours: Boolean(w.intake.confirmed?.includes("hours")),
    };
    let index = stages.indexOf(w.intake.stage);
    while (index < stages.length - 1 && (known[stages[index]] || w.intake.skipped.includes(stages[index]))) index++;
    return { ...w.intake, stage: stages[index] };
  }
  // Existing work is preserved; ask only for information we can’t identify.
  return {
    stage:
      !w.event || /our next hackathon/i.test(w.event)
        ? "event"
        : !w.members.length
          ? "team"
          : !w.goal
            ? "goal"
            : !w.documents.some(
                  (d) => d.id !== "sample" && !d.id.startsWith("research-"),
                )
              ? "documents"
              : "hours",
    skipped: [],
  };
}
export function advance(w: Workspace, skipped = false): Workspace {
  const intake = w.intake || currentIntake(w);
  return {
    ...w,
    intake: {
      ...intake,
      confirmed: [...new Set([...(intake.confirmed || []), ...(intake.stage === "hours" && !skipped ? ["hours"] : [])])],
      stage:
        stages[Math.min(stages.indexOf(intake.stage) + 1, stages.length - 1)],
      skipped: skipped
        ? [...new Set([...intake.skipped, intake.stage])]
        : intake.skipped,
    },
  };
}
export function isUnknown(text: string) {
  return /\b(don['’]?t (?:know|have)|do not (?:know|have)|not sure|unsure|unknown|no (?:idea|documents?|brief|rules|teammates?|team)|haven['’]?t decided|undecided|solo)\b/i.test(
    text,
  );
}
// Intake answers are local and immediate. They never invent missing facts.
export function answerIntake(
  w: Workspace,
  text: string,
): { workspace: Workspace; answer: string; accepted: boolean } {
  const stage = currentIntake(w).stage;
  let next: Workspace = { ...w, intake: currentIntake(w) };
  const unknown = isUnknown(text) && !(stage === "team" && text.includes("|"));
  if (stage === "done")
    return { workspace: next, answer: questions.done, accepted: false };
  if (
    /^(?:hi|hey|hello|help)[.!]?$/i.test(text.trim()) ||
    /^(?:give|find|suggest|recommend|show|make|create).*\b(?:ideas?|projects?|plan)\b/i.test(
      text.trim(),
    )
  )
    return { workspace: next, answer: questions[stage], accepted: false };
  if (unknown) {
    if (stage === "experience") next.pastExperience = text.slice(0, 3000);
    if (stage === "goal") next.goal = text.slice(0, 3000);
    next = advance(next, true);
    return {
      workspace: next,
      answer: `That’s okay. I’ll keep that information marked as unknown. ${questions[currentIntake(next).stage]}`,
      accepted: true,
    };
  }
  if (stage === "event")
    next.event = text
      .replace(/^(?:the hackathon (?:is|name is)|event:)\s*/i, "")
      .trim()
      .slice(0, 200);
  if (stage === "team") {
    const rows = text
      .split(/[;\n]/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (rows.some((row) => row.split("|").length < 3))
      return {
        workspace: next,
        answer:
          "Tell me each teammate’s name, skills, and experience level, separated by |. For example: Collins | React | beginner. Or use Our team to add them. If a detail is unknown, write unknown in that field.",
        accepted: false,
      };
    const members = rows.map((row) => {
      const [name, skills, level] = row.split("|").map((s) => s.trim());
      return {
        id: crypto.randomUUID(),
        name: name.slice(0, 60),
        skills: skills.slice(0, 1000),
        level: /advanced/i.test(level)
          ? "Advanced"
          : /intermediate/i.test(level)
            ? "Intermediate"
            : /unknown|unsure/i.test(level)
              ? "Unknown"
              : "Learning",
        role: "",
        interests: "",
      };
    });
    if (
      members.some((m) => !m.name || !m.skills) ||
      next.members.length + members.length > 12 ||
      new Set([...next.members, ...members].map((m) => m.name.toLowerCase()))
        .size !==
        next.members.length + members.length
    )
      return {
        workspace: next,
        answer:
          "Please use unique names and keep the team to 12 people or fewer. Each person needs a name and skills, or explicitly unknown skills.",
        accepted: false,
      };
    next.members = [...next.members, ...members];
  }
  if (stage === "experience") next.pastExperience = text.slice(0, 3000);
  if (stage === "goal") next.goal = text.slice(0, 3000);
  if (stage === "documents") {
    if (
      text.length < 80 ||
      /^(?:ideas?|give.*ideas?|make.*plan|find.*idea|skip|next|done)[.!?]?$/i.test(
        text.trim(),
      )
    )
      return { workspace: next, answer: questions.documents, accepted: false };
    next.documents = [
      ...next.documents.filter((d) => d.id !== "sample"),
      {
        id: crypto.randomUUID(),
        name: "Hackathon brief from conversation",
        mime: "text/plain",
        text,
      },
    ];
  }
  if (stage === "hours") {
    const hours = buildHours(text);
    if (!hours || hours > 1000)
      return {
        workspace: next,
        answer:
          "I haven’t been able to determine your coding hours from that answer. You can say “about four hours,” type “4 hours,” or tell me you aren’t sure.",
        accepted: false,
      };
    next.hours = hours;
  }
  next = advance(next);
  return {
    workspace: next,
    answer: questions[currentIntake(next).stage],
    accepted: true,
  };
}

export function removeMember(w: Workspace, id: string): Workspace {
  return {
    ...w,
    members: w.members.filter((m) => m.id !== id),
    tasks: w.tasks.map((t) => (t.ownerId === id ? { ...t, ownerId: "" } : t)),
  };
}

export function normalizeLevel(value: string): string {
  if (/^(learning|beginner|novice|new)$/i.test(value.trim())) return "Learning";
  if (/^intermediate$/i.test(value.trim())) return "Intermediate";
  if (/^(advanced|expert|experienced)$/i.test(value.trim())) return "Advanced";
  if (/^(unknown|unsure|not sure)$/i.test(value.trim())) return "Unknown";
  return "";
}
