import type { Workspace } from "./types";
import { advance, currentIntake, questions, normalizeLevel } from "./intake";
// Common self-introductions save locally before any AI confirmation is shown.
// Ambiguous introductions stay with the AI, which must return a validated operation.
export function saveIntroduction(w: Workspace, text: string) {
  if (currentIntake(w).stage !== "team") return null;
  const named = text.match(/\bmy name is\s+([A-Za-z][A-Za-z'-]{0,59})/i);
  if (!named) return null;
  const name = named[1];
  const earlier = w.messages
    .filter((m) => m.role === "user")
    .slice(-3)
    .map((m) => m.text)
    .join(" ");
  const supplied = `${earlier} ${text}`;
  const labels = [
    "Python",
    "JavaScript",
    "TypeScript",
    "React",
    "Java",
    "C++",
    "AI",
    "APIs",
    "front-end design",
    "backend",
    "SQL",
    "Figma",
  ];
  const skills = labels
    .filter((label) =>
      label === "front-end design"
        ? /front[ -]?ends?(?: design)?/i.test(supplied)
        : new RegExp(
            "\\b" + label.replace(/[+]/g, "\\+") + "(?:\\b|$)",
            "i",
          ).test(supplied),
    )
    .join(", ");
  const levelMatch = text.match(
    /\b(beginner|learner|learning|intermediate|advanced|expert|unknown)\b/i,
  );
  const level = levelMatch
    ? normalizeLevel(levelMatch[1] === "learner" ? "learning" : levelMatch[1])
    : "";
  const existing = w.members.find(
    (m) => m.name.toLowerCase() === name.toLowerCase(),
  );
  if (!existing && w.members.length >= 12) return null;
  const member = {
    id: existing?.id || crypto.randomUUID(),
    name,
    skills: skills || existing?.skills || "",
    level: level || existing?.level || "",
    role: existing?.role || "",
    interests: existing?.interests || "",
  };
  let next: Workspace = {
    ...w,
    intake: currentIntake(w),
    members: existing
      ? w.members.map((m) => (m.id === existing.id ? member : m))
      : [...w.members, member],
  };
  const complete = next.members.every((m) => m.name && m.skills && m.level);
  const solo = /(?:only me|just me|by myself|solo|only myself)/i.test(supplied);
  if (complete && solo) next = advance(next);
  const answer = !member.skills
    ? `You’re saved on our team, ${name}. What coding skills do you have?`
    : !member.level
      ? `You’re saved on our team, ${name}. What is your experience level?`
      : complete && solo
        ? `You’re saved on our team, ${name}. ${questions[currentIntake(next).stage]} You can attach the hackathon documents with the paperclip now, too.`
        : `You’re saved on our team, ${name}. Is that everyone? Say “team is ready” when we’re all included.`;
  return { workspace: next, answer, accepted: true };
}
