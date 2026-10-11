import assert from "node:assert/strict";
import { build } from "esbuild";
const built = await build({
  stdin: {
    contents:
      "export * from './lib/hackmate/team-introduction'; export * from './lib/hackmate/intake'; export * from './lib/hackmate/ai';",
    resolveDir: process.cwd(),
    loader: "ts",
  },
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
});
const { saveIntroduction, freshWorkspace, validateResult, currentIntake } =
  await import(
    "data:text/javascript;base64," +
      Buffer.from(built.outputFiles[0].text).toString("base64")
  );
const w = {
  ...freshWorkspace(),
  event: "University of Houston hackathon",
  intake: { stage: "team", skipped: [] },
  messages: [
    {
      role: "user",
      text: "I used to work with a guy named Chris, but he left. Now it's only me. I'm a beginner at Python. I'm good at AI, APIs, designing front ends. I don't really know why he left.",
    },
  ],
};
const result = saveIntroduction(
  w,
  "Right now I'm a complete beginner. My name is Collins, C-O-L-L-I-N-S. You can call me Cobi. I'm a beginner in Python, but advanced in AI use and front-end design.",
);
assert.equal(result.workspace.members.length, 1);
assert.equal(result.workspace.members[0].name, "Collins");
assert.match(
  result.workspace.members[0].skills,
  /Python.*AI.*APIs.*front-end design/,
);
assert.equal(result.workspace.members[0].level, "Learning");
assert.equal(currentIntake(result.workspace).stage, "experience");
assert.match(result.answer, /attach the hackathon documents/);
assert.equal(w.members.length, 0);
console.log(
  "PASS Failed real introduction saves only Collins, preserves supplied skills, and advances solo intake",
);
const twice = saveIntroduction(
  { ...result.workspace, intake: { stage: "team", skipped: [] } },
  "My name is Collins. I am a beginner at Python.",
);
assert.equal(twice.workspace.members.length, 1);
console.log(
  "PASS Repeating an introduction updates rather than duplicates a teammate",
);
const incomplete = saveIntroduction(
  { ...freshWorkspace(), intake: { stage: "team", skipped: [] } },
  "My name is Alex.",
);
assert.equal(incomplete.workspace.members.length, 1);
assert.equal(incomplete.workspace.members[0].skills, "");
assert.equal(currentIntake(incomplete.workspace).stage, "team");
assert.match(incomplete.answer, /What coding skills/);
console.log(
  "PASS Names save immediately; missing skills remain empty and prompt a question",
);
assert.equal(saveIntroduction(w, "Chris left our team."), null);
console.log(
  "PASS A former teammate is never added by the self-introduction parser",
);
for (const answer of [
  "I'll add you to the team now.",
  "I've added you to the team.",
  "I have saved you on the team.",
]) {
  assert.throws(() =>
    validateResult(
      { answer, sources: [], operations: [] },
      {
        action: "chat",
        provider: "nvidia",
        workspace: w,
        question: "My name is Collins",
      },
    ),
  );
}
console.log(
  "PASS An AI promise or false success without a saving operation is rejected",
);
assert.equal(
  validateResult(
    { answer: "What is your name?", sources: [], operations: [] },
    { action: "chat", provider: "nvidia", workspace: w, question: "Only me." },
  ).answer,
  "What is your name?",
);
console.log("PASS Questions without mutations remain valid");
