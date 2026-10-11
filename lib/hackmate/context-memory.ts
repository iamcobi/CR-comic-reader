import type { Workspace } from "./types";
import { buildHours } from "./conversation-route";
import { currentIntake } from "./intake";

// Save explicit facts even when they arrive before the matching intake question.
// Ambiguous statements still go through the current question or the AI.
export function rememberContext(w: Workspace, text: string) {
  const next: Workspace = { ...w, intake: { ...currentIntake(w) } };
  const fields: string[] = [];
  if (/\b(?:I|we) (?:can|have|will be able to) (?:work|code|build)(?: for)?\b/i.test(text)) {
    const hours = buildHours(text);
    if (hours !== null) {
      next.hours = hours;
      next.intake!.confirmed = [...new Set([...(next.intake!.confirmed || []), "hours"])];
      fields.push("hours");
    }
  }
  const goal = text.match(/\b(?:my|our) (?:specific )?goal(?: for (?:this|the) hackathon)? (?:is|will be)\s+([^.!?]+)/i);
  if (goal) { next.goal = goal[1].trim().slice(0, 3000); fields.push("goal"); }
  if (/\b(?:this is|it['’]s) (?:my|our) first hackathon\b/i.test(text)) {
    next.pastExperience = "This is our first hackathon."; fields.push("experience");
  }
  next.intake = currentIntake(next);
  return { workspace: fields.length ? next : w, fields };
}
