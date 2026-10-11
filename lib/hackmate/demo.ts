import type { AIInput, AIResult, Idea, Workspace } from "./types";
import { demoConversation } from "./demo-conversation";

export function initialWorkspace(): Workspace {
  return {
    event: "Our next hackathon",
    hours: 24,
    goal: "Build something useful, finish a working demo, and explain it clearly.",
    provider: "demo",
    planProvider: "demo",
    companion: { name: "Pip", color: "#d2ef67" },
    members: [
      {
        id: "m1",
        name: "You",
        skills: "JavaScript, React",
        level: "Learning",
        role: "Frontend",
        interests: "AI assistants",
      },
      {
        id: "m2",
        name: "Alex",
        skills: "Python, APIs",
        level: "Intermediate",
        role: "Backend",
        interests: "Automation",
      },
      {
        id: "m3",
        name: "Sam",
        skills: "Figma, CSS",
        level: "Intermediate",
        role: "Design & pitch",
        interests: "Accessible design",
      },
    ],
    documents: [
      {
        id: "sample",
        name: "Sample brief · replace with your event",
        mime: "text/plain",
        text: "ILLUSTRATIVE BRIEF, NOT ACTUAL EVENT RULES. Build a useful prototype within 24 hours. Judging considers usefulness, technical execution, design, and clarity of the demo. Example sponsor: Google Gemini. Demonstrate a meaningful AI feature. Submit a repository link, README, and a short demo.",
      },
    ],
    ideas: [],
    selectedIdea: null,
    tasks: [
      {
        id: "t1",
        title: "Find a problem worth solving",
        ownerId: "m1",
        detail:
          "Write one sentence about the user and their problem. Validate it with a teammate.",
        status: "doing",
        hours: 1,
        dependsOn: [],
      },
      {
        id: "t2",
        title: "Read the brief & prize requirements",
        ownerId: "m2",
        detail:
          "Replace the sample brief with your actual event materials. Confirm eligibility and submission rules.",
        status: "todo",
        hours: 1,
        dependsOn: [],
      },
      {
        id: "t3",
        title: "Sketch the main user journey",
        ownerId: "m3",
        detail: "Choose one useful journey you can show in a two-minute demo.",
        status: "todo",
        hours: 1,
        dependsOn: [],
      },
    ],
    messages: [
      {
        role: "assistant",
        text: "Hey, I’m Pip. Let’s turn a good idea into a finished project. Start by adding your team and the actual hackathon brief. You’re exploring a sample workspace in Demo mode.",
      },
    ],
  };
}

// Demo mode is deterministic sample content, not an AI call or a prize prediction.
export function demoResponse(input: AIInput): AIResult {
  const w = input.workspace;
  if (input.action === "chat") {
    const conversational = demoConversation(input);
    if (conversational) return conversational;
  }
  if (input.action === "ideas") {
    const budget = Math.max(2, w.hours);
    const ideas: Idea[] = [
      {
        title: "HackMate",
        problem:
          "Hackathon teams lose time choosing ideas and coordinating work.",
        solution:
          "A companion that turns event materials and team skills into an achievable plan.",
        fit: "A clear end-to-end demo with practical AI. Verify its fit against your actual rules.",
        difficulty: "Moderate",
        hours: Math.min(18, budget),
        stack: ["JavaScript", "React", "AI API"],
        risks: [
          "Keep integrations optional.",
          "Test document accuracy against the source.",
        ],
        sources: [],
      },
      {
        title: "Campus Compass",
        problem:
          "Students struggle to find answers across scattered campus guides.",
        solution:
          "Ask questions about uploaded campus information and see supporting references.",
        fit: "Useful to a specific audience. A grounded answer makes the AI feature visible.",
        difficulty: "Approachable",
        hours: Math.min(14, budget),
        stack: ["React", "Document API"],
        risks: ["Use public information.", "Do not invent campus policies."],
        sources: [],
      },
      {
        title: "AccessLens",
        problem: "Teams miss accessibility issues in their first interface.",
        solution:
          "A guided checklist that explains issues and suggests small improvements.",
        fit: "A visual before-and-after demo. Confirm the event’s accessibility or social-impact criteria.",
        difficulty: "Moderate",
        hours: Math.min(16, budget),
        stack: ["JavaScript", "HTML", "CSS"],
        risks: [
          "Limit the checks to a few meaningful issues.",
          "AI suggestions need human review.",
        ],
        sources: [],
      },
    ];
    return {
      ideas: ideas.map((i) => ({ ...i, generatedBy: "demo" })),
      demo: true,
    };
  }
  if (input.action === "plan") {
    const members = w.members;
    const owners = [
      members.find((m) => /front|react|javascript/i.test(m.role + m.skills)),
      members.find((m) => /back|python|api/i.test(m.role + m.skills)),
      members.find((m) => /design|pitch/i.test(m.role + m.skills)),
    ];
    const owner = (n: number) =>
      owners[n]?.id || members[n % Math.max(1, members.length)]?.id || "";
    const title = w.selectedIdea?.title || "your project";
    const hours = Math.max(0.5, Math.min(4, w.hours / 6));
    return {
      tasks: [
        {
          id: "p1",
          title: "Agree on the smallest useful demo",
          ownerId: owner(0),
          detail: `For ${title}, write the one user journey you will finish. Confirm the event rules before building.`,
          status: "todo",
          hours: Math.min(1, hours),
          dependsOn: [],
        },
        {
          id: "p2",
          title: "Build the main screen",
          ownerId: owner(0),
          detail:
            "Create the input, result, loading, and error states. Use sample data while the API is being built.",
          status: "todo",
          hours,
          dependsOn: ["p1"],
        },
        {
          id: "p3",
          title: "Connect one real AI request",
          ownerId: owner(1),
          detail:
            "Keep the key on the server. Validate the response and handle quota errors visibly.",
          status: "todo",
          hours,
          dependsOn: ["p1"],
        },
        {
          id: "p4",
          title: "Refine the flow & visual design",
          ownerId: owner(2),
          detail:
            "Check mobile layout, keyboard navigation, and clear labels. Avoid adding scope.",
          status: "todo",
          hours,
          dependsOn: ["p2"],
        },
        {
          id: "p5",
          title: "Test the complete journey",
          ownerId: owner(1),
          detail:
            "Try a real input, an empty input, and an API failure. Fix what interrupts the demo.",
          status: "todo",
          hours,
          dependsOn: ["p2", "p3"],
        },
        {
          id: "p6",
          title: "Prepare the pitch & submission",
          ownerId: owner(2),
          detail:
            "Explain the user problem, show the working product, and include setup instructions and known limitations.",
          status: "todo",
          hours,
          dependsOn: ["p4", "p5"],
        },
      ],
      demo: true,
    };
  }
  const blocked = w.tasks.filter((t) => t.status === "blocked");
  const next = w.tasks.find(
    (t) =>
      t.status !== "done" &&
      t.status !== "blocked" &&
      t.dependsOn.every(
        (id) => w.tasks.find((x) => x.id === id)?.status === "done",
      ),
  );
  const q = (input.question || "").toLowerCase();
  const answer = /rule|sponsor|document/.test(q)
    ? `You have ${w.documents.length} document(s). In Demo mode I don’t analyze those files. Switch to a configured live provider for document-based answers. Confirm sponsor requirements in the actual brief, rather than the sample.`
    : /explain|code|teach/.test(q)
      ? "The interface collects your team and documents. It sends them to /api/ai on the server. A provider adapter translates that request for NVIDIA or Gemini. The server checks the response, then the interface displays it. Demo mode skips the external request and uses sample responses."
      : `${blocked.length ? `There ${blocked.length === 1 ? "is 1 blocked task" : `are ${blocked.length} blocked tasks`}. Resolve or reduce that scope first. ` : ""}${next ? `Next: ${next.title}. Assigned to: ${w.members.find((m) => m.id === next.ownerId)?.name || "no one yet"}. ${next.detail}` : "All available tasks are complete or waiting on dependencies. Review blocked tasks and prepare your submission."} This is a local demo suggestion; live AI can give you a more detailed answer.`;
  return { answer, sources: [], demo: true };
}
