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
const smallNumbers: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
  seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
  seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20,
  thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70,
  eighty: 80, ninety: 90,
};
function spokenNumber(words: string): number | null {
  const tokens = words.toLowerCase().replace(/-/g, " ").split(/\s+/).filter(Boolean);
  if (tokens.length === 1) return smallNumbers[tokens[0]] ?? null;
  if (tokens.length === 2 && (smallNumbers[tokens[0]] ?? 0) >= 20 &&
      (smallNumbers[tokens[1]] ?? 0) > 0 && smallNumbers[tokens[1]] < 10)
    return smallNumbers[tokens[0]] + smallNumbers[tokens[1]];
  return null;
}
export function buildHours(text: string): number | null {
  const explicit = text.match(/\b(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|h)\b/i);
  const bare = text.trim().match(/^(\d+(?:\.\d+)?)[.!]?$/);
  let n = Number(explicit?.[1] || bare?.[1]);
  if (!n) {
    const numberWords = Object.keys(smallNumbers).join("|");
    const spoken = text.match(new RegExp(`\\b((?:${numberWords})(?:[ -](?:${numberWords}))?)(?: and (?:a |one )?half)?\\s+hours?\\b`, "i"));
    if (spoken) n = (spokenNumber(spoken[1]) ?? 0) + (/ and .*half/i.test(spoken[0]) ? 0.5 : 0);
    else if (/\b(?:half an hour|half hour)\b/i.test(text)) n = 0.5;
    else n = spokenNumber(text.trim().replace(/^(?:about|around|roughly)\s+/i, "").replace(/[.!]$/, "")) ?? 0;
  }
  return n > 0 && n <= 1000 ? n : null;
}

// An answer already supplied in speech must survive a parser update or reload.
export function recoverPendingHours(w: Workspace): Workspace {
  if (w.intake?.stage !== "hours") return w;
  const latest = w.messages.filter(m => m.role === "user").at(-1);
  const hours = latest ? buildHours(latest.text) : null;
  return hours === null ? w : { ...w, hours, intake: { ...w.intake, stage: "done" } };
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
