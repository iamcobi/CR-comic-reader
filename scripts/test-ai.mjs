import assert from "node:assert/strict";
import { build } from "esbuild";

// Bundle TypeScript for Node without requiring a second test framework.
const built = await build({
  stdin: {
    contents:
      "export * from './lib/hackmate/ai'; export * from './lib/hackmate/demo';",
    resolveDir: process.cwd(),
    loader: "ts",
  },
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
});
const { initialWorkspace, runAI, validateResult, inputSchema } = await import(
  `data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString("base64")}`
);
const input = (action = "ideas", provider = "demo") => ({
  action,
  provider,
  workspace: initialWorkspace(),
});
let passed = 0;
async function test(name, fn) {
  try {
    await fn();
  } catch (error) {
    throw new Error(`${name}: ${error.message.slice(0, 500)}`);
  }
  passed++;
  console.log(`PASS ${name}`);
}
const originalFetch = globalThis.fetch;
const oldNvidia = process.env.NVIDIA_API_KEY,
  oldGemini = process.env.GEMINI_API_KEY;
try {
  await test("Demo never calls an external provider", async () => {
    globalThis.fetch = () => {
      throw new Error("External call");
    };
    const r = await runAI(input());
    assert.equal(r.demo, true);
    assert.equal(r.ideas.length, 3);
  });
  await test("Plan requires a selected idea", async () => {
    await assert.rejects(runAI(input("plan")), /Choose an idea/);
  });
  const planInput = input("plan");
  planInput.workspace.selectedIdea = (await runAI(input())).ideas[0];
  const tasks = (await runAI(planInput)).tasks;
  await test("Plan contains valid team owners and dependencies", () => {
    const r = validateResult({ tasks }, planInput);
    assert.equal(r.tasks.length, 6);
  });
  await test("Unknown task owner is rejected", () => {
    assert.throws(
      () =>
        validateResult(
          { tasks: [{ ...tasks[0], ownerId: "invented" }] },
          planInput,
        ),
      /unexpected format/,
    );
  });
  await test("Dependency cycles are rejected", () => {
    assert.throws(
      () =>
        validateResult(
          {
            tasks: [
              { ...tasks[0], dependsOn: ["p2"] },
              { ...tasks[1], dependsOn: ["p1"] },
            ],
          },
          planInput,
        ),
      /unexpected format/,
    );
  });
  await test("Missing dependencies are rejected", () => {
    assert.throws(
      () =>
        validateResult(
          { tasks: [{ ...tasks[0], dependsOn: ["missing"] }] },
          planInput,
        ),
      /unexpected format/,
    );
  });
  await test("Invented text citations are removed", () => {
    const r = validateResult(
      {
        answer: "A suggestion",
        sources: [
          { documentId: "sample", page: null, quote: "Fake sponsor guarantee" },
        ],
      },
      input("chat"),
    );
    assert.deepEqual(r.sources, []);
  });
  await test("Real text excerpts survive validation", () => {
    const r = validateResult(
      {
        answer: "A suggestion",
        sources: [
          { documentId: "sample", page: null, quote: "ILLUSTRATIVE BRIEF" },
        ],
      },
      input("chat"),
    );
    assert.equal(r.sources.length, 1);
  });
  await test("Oversized or invalid input is rejected", () => {
    const i = input();
    i.workspace.hours = -1;
    assert.equal(inputSchema.safeParse(i).success, false);
  });
  await test("Missing NVIDIA key fails instead of silently using Demo", async () => {
    delete process.env.NVIDIA_API_KEY;
    await assert.rejects(runAI(input("ideas", "nvidia")), /not configured/);
  });
  process.env.NVIDIA_API_KEY = "test-only-not-a-real-key";
  await test("NVIDIA adapter sends context and reads chat completion", async () => {
    let called = false;
    globalThis.fetch = async (url, options) => {
      assert.equal(url, "https://integrate.api.nvidia.com/v1/chat/completions");
      const b = JSON.parse(options.body);
      assert.ok(b.messages[0].content.includes("Our next hackathon"));
      assert.equal(b.response_format.type, "json_schema");
      assert.equal(
        b.response_format.json_schema.schema.properties.ideas.minItems,
        3,
      );
      assert.equal(b.messages[1].role, "user");
      assert.equal(
        options.headers.Authorization,
        "Bearer test-only-not-a-real-key",
      );
      called = true;
      return Response.json({
        choices: [
          {
            message: {
              content: JSON.stringify({ ideas: (await runAI(input())).ideas }),
            },
          },
        ],
      });
    };
    const r = await runAI(input("ideas", "nvidia"));
    assert.equal(r.ideas.length, 3);
    assert.equal(called, true);
    assert.equal(r.demo, undefined);
  });
  await test("NVIDIA rejects binary documents visibly", async () => {
    const i = input("ideas", "nvidia");
    i.workspace.documents.push({
      id: "pdf",
      name: "brief.pdf",
      mime: "application/pdf",
      data: "JVBERg==",
    });
    await assert.rejects(runAI(i), /readable text PDF/);
  });
  process.env.GEMINI_API_KEY = "test-only-not-a-real-key";
  await test("Gemini adapter includes the PDF attachment and its ID", async () => {
    const i = input("chat", "gemini");
    i.workspace.documents.push({
      id: "pdf",
      name: "brief.pdf",
      mime: "application/pdf",
      data: "JVBERg==",
    });
    globalThis.fetch = async (url, options) => {
      assert.ok(url.includes(":generateContent"));
      const parts = JSON.parse(options.body).contents[0].parts;
      assert.equal(parts[2].inlineData.mimeType, "application/pdf");
      assert.ok(parts[1].text.includes("documentId=pdf"));
      return Response.json({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    answer: "A grounded answer",
                    sources: [],
                  }),
                },
              ],
            },
          },
        ],
      });
    };
    const r = await runAI(i);
    assert.equal(r.answer, "A grounded answer");
  });
  await test("Provider quota errors are visible", async () => {
    globalThis.fetch = async () => new Response("", { status: 429 });
    await assert.rejects(
      runAI(input("ideas", "nvidia")),
      /quota or rate limit/,
    );
  });
  await test("Malformed AI output never becomes a plan", async () => {
    globalThis.fetch = async () =>
      Response.json({ choices: [{ message: { content: "not valid JSON" } }] });
    await assert.rejects(runAI(input("ideas", "nvidia")), /valid JSON/);
  });
  console.log(
    `\n${passed} checks passed. Provider calls were mocked; no live keys were used.`,
  );
} finally {
  globalThis.fetch = originalFetch;
  if (oldNvidia === undefined) delete process.env.NVIDIA_API_KEY;
  else process.env.NVIDIA_API_KEY = oldNvidia;
  if (oldGemini === undefined) delete process.env.GEMINI_API_KEY;
  else process.env.GEMINI_API_KEY = oldGemini;
}
