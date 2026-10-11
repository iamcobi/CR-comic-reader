import type { AIInput, AIResult } from "./types";

// A small, explicit demo command parser. Live providers handle broader phrasing.
export function demoConversation(input: AIInput): AIResult | null {
  const q = (input.question || "").trim(),
    w = input.workspace;
  const member = q.match(
    /^add\s+([\w '-]{1,60}?)\s+to\s+(?:the|our|my)\s+team(?:[.,;]\s*(?:skills?:\s*)?(.+))?$/i,
  );
  if (member) {
    const name = member[1].trim();
    if (w.members.some((m) => m.name.toLowerCase() === name.toLowerCase()))
      return {
        answer: `${name} is already in our crew. What role would they like to take?`,
        operations: [],
        demo: true,
      };
    return {
      answer: `Welcome, ${name}. I’ve added them to our crew${member[2] ? ` with ${member[2]}` : ""}. What’s one thing they’re excited to build?`,
      operations: [
        {
          type: "add_member",
          member: {
            id: `member-${Date.now()}`,
            name,
            skills: member[2] || "",
            level: "Learning",
            role: "",
            interests: "",
          },
        },
      ],
      demo: true,
    };
  }
  const add = q.match(
    /^(?:add (?:a )?(?:task|to-do|todo)|put (?:this|something) on (?:our|my|the) list)\s*:\s*(.+)$/i,
  );
  if (add)
    return {
      answer: `Added “${add[1]}” to our list. It’s unassigned for now; tell me who should take it. The one-hour estimate is a starting point you can change.`,
      operations: [
        {
          type: "add_tasks",
          tasks: [
            {
              id: `task-${Date.now()}`,
              title: add[1].slice(0, 200),
              detail:
                "Added through the conversation. Review the estimate and owner.",
              ownerId: "",
              status: "todo",
              hours: 1,
              dependsOn: [],
            },
          ],
        },
      ],
      demo: true,
    };
  const finish = q.match(/^(?:complete|finish|mark done)\s*:?\s*(.+)$/i);
  const assign = q.match(/^assign\s+(.+?)\s+to\s+(.+)$/i);
  const block = q.match(/^(?:block|unblock)\s*:?\s*(.+)$/i);
  if (finish || assign || block) {
    const title = (finish?.[1] || assign?.[1] || block?.[1] || "")
      .trim()
      .toLowerCase();
    const tasks = w.tasks.filter((t) => t.title.toLowerCase() === title);
    if (tasks.length !== 1)
      return {
        answer:
          "Which task do you mean? Use its full title so I update the right one.",
        operations: [],
        demo: true,
      };
    const task = tasks[0];
    if (assign) {
      const owner = w.members.find(
        (m) => m.name.toLowerCase() === assign[2].trim().toLowerCase(),
      );
      if (!owner)
        return {
          answer:
            "I don’t have that person on our team yet. Tell me their name and skills first.",
          operations: [],
          demo: true,
        };
      return {
        answer: `${owner.name} has “${task.title}”. Let’s make sure they have what they need to get started.`,
        operations: [
          { type: "update_task", taskId: task.id, ownerId: owner.id },
        ],
        demo: true,
      };
    }
    const status = finish ? "done" : /^unblock/i.test(q) ? "todo" : "blocked";
    if (
      status === "done" &&
      task.dependsOn.some(
        (id) => w.tasks.find((t) => t.id === id)?.status !== "done",
      )
    )
      return {
        answer:
          "That step is still waiting on its dependencies. Finish those first, then we can check it off.",
        operations: [],
        demo: true,
      };
    return {
      answer:
        status === "done"
          ? `Checked off “${task.title}”. That’s one more piece in place. Nice work, team.`
          : status === "blocked"
            ? `I’ve marked “${task.title}” as blocked. What’s missing: a decision, someone’s help, or a technical fix?`
            : `“${task.title}” is back on our list. Let’s take the smallest useful next step.`,
      operations: [{ type: "update_task", taskId: task.id, status }],
      demo: true,
    };
  }
  const choose = q.match(/^(?:let['’]?s build|choose|select)\s+(.+)$/i);
  if (choose) {
    const idea = w.ideas.find(
      (i) => i.title.toLowerCase() === choose[1].trim().toLowerCase(),
    );
    if (idea)
      return {
        answer: `${idea.title} it is. Let’s keep our first version small and useful. Say “make a game plan” and I’ll suggest a set of steps for the team.`,
        operations: [{ type: "select_idea", title: idea.title }],
        demo: true,
      };
  }
  const rename = q.match(/^(?:your name is|call yourself)\s+(.{1,40})$/i);
  if (rename)
    return {
      answer: `${rename[1]} it is. Same teammate, new name. What should we tackle next?`,
      operations: [{ type: "rename_companion", name: rename[1] }],
      demo: true,
    };
  const hours = q.match(
    /^(?:we have|set (?:our )?(?:time|budget) to)\s+(\d+)\s+hours?$/i,
  );
  if (hours && Number(hours[1]) > 0 && Number(hours[1]) <= 1000)
    return {
      answer: `Our build budget is ${hours[1]} hours. Let’s leave time for testing and the pitch, then choose one journey we can finish.`,
      operations: [{ type: "set_event", hours: Number(hours[1]) }],
      demo: true,
    };
  if (/bond|check.?in|team morale/i.test(q)) {
    const names = w.members.map((m) => m.name).join(", ");
    return {
      answer: `Let’s do a quick team check-in${names ? `: ${names}` : ""}. Each person shares one win, one blocker, and one thing they need help with. Then give a teammate a specific thank-you. Who wants to go first?`,
      operations: [],
      demo: true,
    };
  }
  if (/introduce|meet my team|our team|my teammates/i.test(q))
    return {
      answer:
        "Tell me about one teammate at a time. Try “Add Jordan to our team, skills: Python and APIs.” What’s their name and what do they enjoy building?",
      operations: [],
      demo: true,
    };
  if (/overwhelm|stress|motivat|encourag/i.test(q))
    return {
      answer:
        "Take a breath. We only need one small next step, not the whole project at once. Which part feels hardest right now? We can shrink it or ask a teammate to pair up.",
      operations: [],
      demo: true,
    };
  if (/thank|nice|awesome|great/i.test(q))
    return {
      answer:
        "We’re getting somewhere. Let’s keep the momentum gentle and the next step clear. What would help your team most right now?",
      operations: [],
      demo: true,
    };
  if (/bye|goodbye|see you/i.test(q))
    return {
      answer:
        "Take a break. Your plan is saved in this browser, and I’ll be here when you’re ready to keep building.",
      operations: [],
      demo: true,
    };
  return null;
}
