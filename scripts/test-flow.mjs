import assert from "node:assert/strict";
import { build } from "esbuild";
const built = await build({
  stdin: {
    contents:
      "export * from './lib/hackmate/intake'; export * from './lib/hackmate/ai';export * from './lib/hackmate/stream';export * from './lib/hackmate/operations';export * from './lib/hackmate/motions'; export {parseFindings} from './app/api/research/route';",
    resolveDir: process.cwd(),
    loader: "ts",
  },
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
});
const {
  freshWorkspace,
  answerIntake,
  currentIntake,
  removeMember,
  advance,
  partialAnswer,
  runAI,
  validateResult,
  streamChat,
  applyOperations,
  operationMotions,
  normalizeLevel,
  parseFindings,
} = await import(
  "data:text/javascript;base64," +
    Buffer.from(built.outputFiles[0].text).toString("base64")
);
let passed = 0;
async function test(name, fn) {
  await fn();
  passed++;
  console.log("PASS " + name);
}
const original = globalThis.fetch;
try {
  await test("New hackathon has no invented teammates, documents, or selected project", () => {
    const w = freshWorkspace();
    assert.equal(w.members.length + w.documents.length + w.tasks.length, 0);
    assert.equal(w.selectedIdea, null);
    assert.equal(w.intake.stage, "event");
  });
  let w = freshWorkspace();
  await test("Intake asks for event then team then goal then official materials", () => {
    w = answerIntake(w, "Cougar Hackathon at University of Houston").workspace;
    assert.equal(w.intake.stage, "team");
    w = answerIntake(
      w,
      "Collins | React | beginner; Alex | Python | intermediate",
    ).workspace;
    assert.equal(w.intake.stage, "experience");
    w = answerIntake(
      w,
      "Our last hackathon went well, but we ran out of demo rehearsal time.",
    ).workspace;
    assert.equal(w.intake.stage, "goal");
    assert.equal(w.members.length, 2);
    w = answerIntake(w, "A tool that helps students study together").workspace;
    assert.equal(w.intake.stage, "documents");
  });
  await test("Asking for ideas never skips the official brief", () => {
    const answer = answerIntake(w, "Give me ideas");
    assert.equal(answer.accepted, false);
    assert.equal(answer.workspace.intake.stage, "documents");
  });
  await test("Search excerpts are never accepted as the official brief", () => {
    const next = {
      ...w,
      documents: [
        {
          id: "research-1",
          name: "search",
          mime: "text/plain",
          text: "search excerpts",
        },
      ],
      intake: { stage: "done", skipped: [] },
    };
    assert.equal(currentIntake(next).stage, "documents");
  });
  await test("Unknown individual skills do not skip adding the entire team", () => {
    const next = answerIntake(
      { ...freshWorkspace(), intake: { stage: "team", skipped: [] } },
      "Collins | unknown | unknown",
    ).workspace;
    assert.equal(next.members.length, 1);
    assert.equal(next.members[0].level, "Unknown");
  });
  await test("Explicitly unavailable documents are recorded as unknown", () => {
    w = answerIntake(w, "I don't have the documents").workspace;
    assert.equal(w.intake.stage, "hours");
    assert.ok(w.intake.skipped.includes("documents"));
    w = answerIntake(w, "36 hours").workspace;
    assert.equal(currentIntake(w).stage, "done");
    assert.equal(w.hours, 36);
  });
  await test("Deleting a teammate keeps tasks and clears their ownership", () => {
    const m = w.members[0];
    const next = removeMember(
      {
        ...w,
        tasks: [
          {
            id: "task",
            title: "Build",
            detail: "",
            ownerId: m.id,
            status: "todo",
            hours: 1,
            dependsOn: [],
          },
        ],
      },
      m.id,
    );
    assert.equal(next.tasks[0].ownerId, "");
    assert.equal(next.members.length, 1);
  });
  await test("Natural language member updates and removals validate atomically", () => {
    const m = w.members[0];
    const next = applyOperations(w, [
      { type: "update_member", memberId: m.id, skills: "TypeScript" },
      { type: "remove_member", memberId: w.members[1].id },
    ]);
    assert.equal(next.members.length, 1);
    assert.equal(next.members[0].skills, "TypeScript");
    assert.equal(w.members.length, 2);
  });
  await test("Server blocks recommendations before intake is done", async () => {
    let called = false;
    globalThis.fetch = () => {
      called = true;
      throw new Error("Unexpected call");
    };
    await assert.rejects(
      runAI({
        action: "ideas",
        provider: "nvidia",
        workspace: freshWorkspace(),
      }),
      /hackathon first/,
    );
    assert.equal(called, false);
  });
  await test("Opening or asking about a plan cannot select a project", () => {
    const idea = {
      title: "Study Buddy",
      problem: "",
      solution: "",
      fit: "",
      difficulty: "",
      hours: 1,
      stack: [],
      risks: [],
      sources: [],
    };
    assert.throws(
      () =>
        validateResult(
          {
            answer: "Selected",
            sources: [],
            operations: [{ type: "select_idea", title: idea.title }],
          },
          {
            action: "chat",
            provider: "nvidia",
            workspace: { ...w, ideas: [idea] },
            question: "Show me the plan",
          },
        ),
      /unexpected format/,
    );
  });
  await test("Streaming handles escaped quotes, newlines, and incomplete unicode", () => {
    assert.equal(
      partialAnswer('{"answer":"Hi \\"Pip\\"\\nteam"'),
      'Hi "Pip"\nteam',
    );
    assert.equal(partialAnswer('{"answer":"A\\u00'), "A");
    assert.equal(partialAnswer('{"answer":"A\\u0042"}'), "AB");
  });
  await test("Streaming shows partial text before validated final operations", async () => {
    process.env.NVIDIA_API_KEY = "mock-key";
    const answer = JSON.stringify({
      answer: "Hello, team!",
      sources: [],
      operations: [],
    });
    globalThis.fetch = async (_url, options) => {
      assert.equal(JSON.parse(options.body).stream, true);
      return new Response(
        new ReadableStream({
          start(controller) {
            for (const chunk of [answer.slice(0, 16), answer.slice(16)]) {
              const line =
                "data: " +
                JSON.stringify({ choices: [{ delta: { content: chunk } }] }) +
                "\n\n";
              controller.enqueue(new TextEncoder().encode(line));
            }
            controller.close();
          },
        }),
      );
    };
    const events = [];
    await streamChat(
      { action: "chat", provider: "nvidia", workspace: w, question: "hello" },
      (event) => events.push(event),
      new AbortController().signal,
    );
    assert.ok(events[0].text);
    assert.equal(events.at(-1).result.answer, "Hello, team!");
    assert.equal(
      events.slice(0, -1).some((event) => event.result),
      false,
    );
  });
  await test("Malformed streamed actions never become a final workspace change", async () => {
    globalThis.fetch = async () =>
      new Response(
        "data: " +
          JSON.stringify({
            choices: [
              {
                delta: {
                  content: JSON.stringify({
                    answer: "Done",
                    sources: [],
                    operations: [
                      { type: "remove_member", memberId: "invented" },
                    ],
                  }),
                },
              },
            ],
          }) +
          "\n\n",
      );
    const events = [];
    await assert.rejects(
      streamChat(
        {
          action: "chat",
          provider: "nvidia",
          workspace: w,
          question: "Delete invented",
        },
        (event) => events.push(event),
        new AbortController().signal,
      ),
    );
    assert.equal(
      events.some((event) => event.result),
      false,
    );
  });
  await test("Multi-action replies produce distinct action gestures", () => {
    assert.deepEqual(
      operationMotions([
        { type: "add_member", member: {} },
        { type: "add_tasks", tasks: [] },
        { type: "update_task", taskId: "t", ownerId: "m" },
        { type: "update_task", taskId: "t", status: "done" },
      ]),
      ["welcoming-member", "adding-task", "assigning-task", "completing-task"],
    );
  });

  await test("Previous hackathon lessons are retained for recommendations", () => {
    const next = answerIntake(
      { ...freshWorkspace(), intake: { stage: "experience", skipped: [] } },
      "Last time we spent too long on features and skipped the demo rehearsal.",
    ).workspace;
    assert.match(next.pastExperience, /rehearsal/);
    assert.equal(next.intake.stage, "goal");
  });
  await test("Experience labels preserve supplied facts in the team editor", () => {
    assert.equal(normalizeLevel("beginner"), "Learning");
    assert.equal(normalizeLevel("intermediate"), "Intermediate");
    assert.equal(normalizeLevel(""), "");
    assert.equal(normalizeLevel("unknown"), "Unknown");
  });
  await test("Malformed streaming output is repaired once before committing", async () => {
    let calls = 0;
    globalThis.fetch = async () => {
      calls++;
      if (calls === 1)
        return new Response(
          "data: " +
            JSON.stringify({
              choices: [
                { delta: { content: '{"answer":"Hello","operations":null}' } },
              ],
            }) +
            "\n\n",
        );
      return Response.json({
        choices: [
          {
            message: {
              content: JSON.stringify({
                answer: "Hello team",
                sources: [],
                operations: [],
              }),
            },
          },
        ],
      });
    };
    const events = [];
    await streamChat(
      { action: "chat", provider: "nvidia", workspace: w, question: "hello" },
      (event) => events.push(event),
      new AbortController().signal,
    );
    assert.equal(calls, 2);
    assert.equal(events.at(-1).result.answer, "Hello team");
  });
  await test("Public research links decode redirects and readable excerpts", () => {
    const html =
      '<a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.org%2Fhackathon">Example &#x27;Hackathon&#x27;</a><a class="result__snippet">Past winning <b>projects</b>.</a>';
    const found = parseFindings(html);
    assert.equal(found[0].url, "https://example.org/hackathon");
    assert.match(found[0].title, /'Hackathon'/);
    assert.match(found[0].summary, /winning/);
  });
  console.log(passed + " intake, streaming, team, and motion checks passed.");
} finally {
  globalThis.fetch = original;
  delete process.env.NVIDIA_API_KEY;
}
