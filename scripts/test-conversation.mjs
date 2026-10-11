import assert from "node:assert/strict";
import { build } from "esbuild";
import fs from "node:fs";
const built = await build({
  stdin: {
    contents:
      "export * from './lib/hackmate/operations';export * from './lib/hackmate/demo';export * from './lib/hackmate/motions';export * from './lib/hackmate/ai';",
    resolveDir: process.cwd(),
    loader: "ts",
  },
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
});
const {
  applyOperations,
  initialWorkspace,
  demoResponse,
  motions,
  validateResult,
} = await import(
  `data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString("base64")}`
);
let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log("PASS " + name);
}
const input = {
  action: "chat",
  provider: "demo",
  workspace: initialWorkspace(),
};
test("Spoken-style team command produces an actual teammate", () => {
  const r = demoResponse({
    ...input,
    question: "Add Jordan to our team, skills: Python and APIs",
  });
  const w = applyOperations(input.workspace, r.operations);
  assert.equal(w.members.at(-1).name, "Jordan");
  assert.equal(w.members.at(-1).skills, "Python and APIs");
  assert.equal(input.workspace.members.length, 3);
});
test("Task command changes the list and assignment persists", () => {
  const r = demoResponse({
    ...input,
    question: "Add a task: write the README",
  });
  let w = applyOperations(input.workspace, r.operations);
  const assignment = demoResponse({
    ...input,
    workspace: w,
    question: "Assign write the README to Alex",
  });
  w = applyOperations(w, assignment.operations);
  assert.equal(w.tasks.at(-1).ownerId, "m2");
});
test("Team bonding asks people to speak, never invents their replies", () => {
  const r = demoResponse({ ...input, question: "Team bonding check-in" });
  assert.match(r.answer, /one win, one blocker/);
  assert.equal(r.operations.length, 0);
});
test("Invalid operation batch leaves original unchanged", () => {
  const original = JSON.stringify(input.workspace);
  assert.throws(() =>
    applyOperations(input.workspace, [
      { type: "rename_companion", name: "Test" },
      { type: "update_task", taskId: "missing", status: "done" },
    ]),
  );
  assert.equal(JSON.stringify(input.workspace), original);
});
test("Duplicate teammates are rejected", () =>
  assert.throws(() =>
    applyOperations(input.workspace, [
      {
        type: "add_member",
        member: { ...input.workspace.members[0], id: "new" },
      },
    ]),
  ));
test("Unknown owner is rejected", () =>
  assert.throws(() =>
    applyOperations(input.workspace, [
      { type: "update_task", taskId: "t1", ownerId: "missing" },
    ]),
  ));
test("Chat cannot finish a dependent task early", () => {
  const w = initialWorkspace();
  w.tasks[1].dependsOn = ["t1"];
  assert.throws(() =>
    applyOperations(w, [{ type: "update_task", taskId: "t2", status: "done" }]),
  );
});
test("Malformed live operations are rejected before reaching the UI", () =>
  assert.throws(() =>
    validateResult(
      {
        answer: "Done",
        sources: [],
        operations: [
          { type: "update_task", taskId: "missing", status: "done" },
        ],
      },
      input,
    ),
  ));
test("All 30 events have distinct animation recipes", () => {
  assert.equal(motions.length, 30);
  assert.equal(new Set(motions.map((m) => m.id)).size, 30);
  const css = fs.readFileSync("app/globals.css", "utf8");
  for (const m of motions) assert.ok(css.includes("@keyframes motion-" + m.id));
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
});
console.log(`${passed} conversation and motion checks passed.`);

