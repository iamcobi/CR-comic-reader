import type { AIInput, Workspace } from "./types";

// Answer a question about saved material before resuming the intake question.
export function isContextQuestion(text: string) {
  return /\b(?:documents?|pdfs?|slides?|sponsors?|rules|judging|prizes?)\b/i.test(text) &&
    /\?|\b(?:did|do|does|have|what|which|who|tell|explain|read|know|about)\b/i.test(text) &&
    !/\b(?:don't have|do not have|no documents|no rules)\b/i.test(text);
}
export function conversationAction(text: string, w: Workspace): AIInput["action"] {
  if (isContextQuestion(text) && !/\b(?:make|create|generate|suggest|recommend)\b/i.test(text)) return "chat";
  if (w.ideas.length && /\b(?:explain|elaborate|describe|compare|details|see|show|made up|already)\b/i.test(text) &&
      !/\b(?:new|different|more ideas|another)\b/i.test(text)) return "chat";
  if (/^(add|assign|complete|finish|mark done|block|unblock|choose|select|let['’]?s build)\b/i.test(text)) return "chat";
  if (/\b(ideas?|suggest projects?|recommend projects?)\b/i.test(text)) return "ideas";
  if (/\b(game plan|make.*plan|create.*plan|build.*plan)\b/i.test(text)) return "plan";
  return "chat";
}

// Clock times and dates are not durations. Ask for the usable coding hours instead.
export function buildHours(text: string): number | null {
  const explicit = text.match(/\b(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|h)\b/i);
  const bare = text.trim().match(/^(\d+(?:\.\d+)?)[.!]?$/);
  const n = Number(explicit?.[1] || bare?.[1]);
  return n > 0 && n <= 1000 ? n : null;
}

// Repair the previous first-number parser only when its original intake answer proves the mistake.
export function repairClockHours(w: Workspace): Workspace {
  if (w.intake?.stage !== "done" || w.intake.skipped.includes("hours")) return w;
  const i = w.messages.findLastIndex(m => m.role === "assistant" && m.text.startsWith("I have our starting context."));
  const answer = i > 0 ? w.messages[i - 1] : undefined;
  if (answer?.role === "user" && /\d+:\d+|\b(?:am|pm|tomorrow)\b/i.test(answer.text) && buildHours(answer.text) === null) {
    return { ...w, intake: { ...w.intake, stage: "hours" } };
  }
  return w;
}
