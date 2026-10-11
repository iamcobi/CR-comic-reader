import type { Workspace } from "./types";
import { advance, currentIntake, questions, normalizeLevel } from "./intake";

export function teamComplete(text: string) {
  return /\b(?:that(?:['’]s| is) (?:everyone|all)|team is (?:ready|complete)|no (?:one else|other teammates)|only me|just me|by myself|solo|only (?:person|one|member) (?:in|on) (?:the |our |this )?team)\b/i.test(text) || /^done[.!]?$/i.test(text.trim());
}
function facts(text: string) {
  const labels = ["Python", "JavaScript", "TypeScript", "React", "Java", "C++", "AI", "APIs", "front-end design", "backend", "SQL", "Figma", "HTML", "CSS", "C#", "Rust", "Go"];
  const skills = labels.filter(label => label === "APIs" ? /\bAPIs?\b/i.test(text)
    : label === "Go" ? /\b(?:Golang|(?:code|coding|programming|in|with|know)\s+Go)\b/i.test(text)
    : label === "front-end design" ? /front[ -]?ends?(?: design)?/i.test(text)
    : new RegExp("\\b" + label.replace(/[+#]/g, "\\$&") + "(?=$|[^A-Za-z0-9])", "i").test(text)).join(", ");
  const levelMatch = text.match(/\b(beginner|novice|learner|learning|intermediate|advanced|expert|experienced|unknown|not sure|unsure)\b/i);
  return { skills, level: levelMatch ? normalizeLevel(levelMatch[1] === "learner" ? "learning" : levelMatch[1]) : "" };
}
// Clear names and follow-up facts save locally before any success message.
// Ambiguous introductions stay with the live model's validated operations.
export function saveTeamConversation(w: Workspace, text: string) {
  const stage = currentIntake(w).stage;
  if (stage !== "team" && !/\badd\s+[A-Za-z][A-Za-z'-]*\s+to\s+(?:the |our |my )?team\b/i.test(text)) return null;
  const next: Workspace = { ...w, members: [...w.members], intake: currentIntake(w) };
  const saved: string[] = [];
  const chunks = text.split(/;|\n|\band\s+(?=(?:my name is|I['’]m|I am|add)\b|[A-Z][a-z'-]+\s+(?:is|knows|codes|can))/i);
  for (const chunk of chunks) {
    if (/\b(?:left|quit|former|used to|stepped away|remove|delete)\b/i.test(chunk)) continue;
    const named = chunk.match(/\bmy name is\s+([A-Za-z][A-Za-z'-]{0,59})/i)
      || chunk.match(/^\s*(?:I['’]m|I am)\s+([A-Z][a-z'-]{1,59})(?=[,.!]|\s+(?:and|a |an |I |with|who|beginner|intermediate|advanced)|$)/)
      || chunk.match(/\badd\s+([A-Za-z][A-Za-z'-]{0,59})(?=\s+(?:to|who|with|is|and)|[,.;!]|$)/i)
      || (stage === "team" ? chunk.match(/^\s*(?:(?:my |our )?teammate\s+)?([A-Z][a-z'-]{1,59})\s+(?:is|knows|codes|can code|can use)\b/i) : null);
    let existing = named ? next.members.find(m => m.name.toLowerCase() === named[1].toLowerCase()) : undefined;
    const supplied = facts(chunk);
    if (!named && stage === "team") {
      const mentioned = next.members.filter(m => new RegExp("\\b" + m.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "i").test(chunk));
      const missing = next.members.filter(m => !m.skills || !m.level);
      existing = mentioned.length === 1 ? mentioned[0] : missing.length === 1 ? missing[0] : undefined;
      if (!existing || (!supplied.skills && !supplied.level)) continue;
      if (!existing.skills && /^(?:unknown|unsure|not sure|I don['’]?t know)[.!]?$/i.test(chunk.trim())) {
        supplied.skills = "Unknown";
        supplied.level = "";
      }
    }
    const name = named?.[1] || existing?.name;
    if (!name || /^(?:beginner|intermediate|advanced|learning|expert|solo|the|not|unsure|more|a|an|task|ideas?)$/i.test(name)) continue;
    if (!existing && next.members.length >= 12) return null;
    const earlier = /my name is/i.test(chunk)
      ? facts(w.messages.filter(m => m.role === "user" && /\bI(?:['’]m| am| know| can| have)|\bmy\b/i.test(m.text)).slice(-3).map(m => m.text).join(" ")) : { skills: "", level: "" };
    const member = { id: existing?.id || crypto.randomUUID(), name,
      skills: [...new Set([...(existing?.skills || earlier.skills).split(", "), ...supplied.skills.split(", ")])].filter(Boolean).join(", "),
      level: supplied.level || existing?.level || earlier.level,
      role: existing?.role || "", interests: existing?.interests || "" };
    next.members = existing ? next.members.map(m => m.id === existing!.id ? member : m) : [...next.members, member];
    saved.push(name);
  }
  const completion = teamComplete(text) || w.messages.filter(m => m.role === "user").slice(-3).some(m => teamComplete(m.text));
  if (!saved.length && !(stage === "team" && completion && next.members.length)) return null;
  const incomplete = next.members.find(m => !m.skills || !m.level);
  let workspace = next;
  if (stage === "team" && completion && !incomplete) workspace = advance(next);
  const names = [...new Set(saved)];
  const acknowledgement = names.length ? `${names.join(", ")} ${names.length === 1 ? "is" : "are"} saved on our team.` : "Our team is saved.";
  const question = incomplete ? !incomplete.skills ? `What coding skills does ${incomplete.name} have?` : `What is ${incomplete.name}’s experience level?`
    : stage === "team" && !completion ? 'Who else is on our team? If everyone is included, say “team is ready”.'
    : stage === "team" ? `${questions[currentIntake(workspace).stage]} You can attach the hackathon documents with the paperclip now, too.` : "You can review them in Our team.";
  return { workspace, answer: `${acknowledgement} ${question}`, accepted: true };
}
