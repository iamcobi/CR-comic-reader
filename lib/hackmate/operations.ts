import { z } from "zod";
import { normalizeLevel } from "./intake";
import type { AssistantOperation, Workspace } from "./types";

const id = z.string().min(1).max(100);
export const operationSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("remove_member"), memberId: id }),
  z.object({
    type: z.literal("update_member"),
    memberId: id,
    name: z.string().trim().min(1).max(100).optional(),
    skills: z.string().max(1000).optional(),
    level: z.string().max(100).optional(),
    role: z.string().max(200).optional(),
    interests: z.string().max(1000).optional(),
  }),
  z.object({
    type: z.literal("add_member"),
    member: z.object({
      id,
      name: z.string().trim().min(1).max(100),
      skills: z.string().max(1000),
      level: z.string().max(100),
      role: z.string().max(200),
      interests: z.string().max(1000),
    }),
  }),
  z.object({
    type: z.literal("add_tasks"),
    tasks: z
      .array(
        z.object({
          id,
          title: z.string().trim().min(1).max(200),
          ownerId: z.string().max(100),
          detail: z.string().max(2000),
          status: z.literal("todo"),
          hours: z.number().positive().max(1000),
          dependsOn: z.array(id).max(20),
        }),
      )
      .min(1)
      .max(15),
  }),
  z.object({
    type: z.literal("update_task"),
    taskId: id,
    status: z.enum(["todo", "doing", "blocked", "done"]).optional(),
    ownerId: z.string().max(100).optional(),
  }),
  z.object({
    type: z.literal("set_event"),
    event: z.string().trim().min(1).max(200).optional(),
    hours: z.number().positive().max(1000).optional(),
    goal: z.string().max(3000).optional(),
  }),
  z.object({
    type: z.literal("select_idea"),
    title: z.string().min(1).max(120),
  }),
  z.object({
    type: z.literal("rename_companion"),
    name: z.string().trim().min(1).max(40),
  }),
]);

// Apply a complete action batch to a copy. Invalid actions never partly modify the workspace.
export function applyOperations(
  workspace: Workspace,
  raw: AssistantOperation[],
): Workspace {
  const operations = z.array(operationSchema).max(10).parse(raw);
  const next: Workspace = structuredClone(workspace);
  for (const op of operations) {
    if (op.type === "remove_member") {
      if (!next.members.some((m) => m.id === op.memberId))
        throw new Error("That teammate does not exist.");
      next.members = next.members.filter((m) => m.id !== op.memberId);
      next.tasks = next.tasks.map((t) =>
        t.ownerId === op.memberId ? { ...t, ownerId: "" } : t,
      );
    }
    if (op.type === "update_member") {
      const member = next.members.find((m) => m.id === op.memberId);
      if (!member) throw new Error("That teammate does not exist.");
      if (
        op.name &&
        next.members.some(
          (m) =>
            m.id !== member.id &&
            m.name.toLowerCase() === op.name!.toLowerCase(),
        )
      )
        throw new Error("A teammate already has that name.");
      for (const key of [
        "name",
        "skills",
        "level",
        "role",
        "interests",
      ] as const)
        if (op[key] !== undefined)
          member[key] = key === "level" ? normalizeLevel(op[key]!) : op[key]!;
    }
    if (op.type === "add_member") {
      if (
        next.members.length >= 12 ||
        next.members.some(
          (m) =>
            m.id === op.member.id ||
            m.name.toLowerCase() === op.member.name.toLowerCase(),
        )
      )
        throw new Error("This teammate already exists or the team is full.");
      next.members.push({
        ...op.member,
        level: normalizeLevel(op.member.level),
      });
    }
    if (op.type === "add_tasks") {
      if (next.tasks.length + op.tasks.length > 100)
        throw new Error("Keep at most 100 tasks.");
      for (const task of op.tasks) {
        if (next.tasks.some((t) => t.id === task.id))
          throw new Error("Task IDs must be unique.");
        if (task.ownerId && !next.members.some((m) => m.id === task.ownerId))
          throw new Error("The task owner is not on your team.");
        next.tasks.push(task);
      }
    }
    if (op.type === "update_task") {
      const task = next.tasks.find((t) => t.id === op.taskId);
      if (!task) throw new Error("That task does not exist.");
      if (op.ownerId !== undefined) {
        if (op.ownerId && !next.members.some((m) => m.id === op.ownerId))
          throw new Error("The task owner is not on your team.");
        task.ownerId = op.ownerId;
      }
      if (op.status) {
        if (
          ["done", "doing"].includes(op.status) &&
          task.dependsOn.some(
            (id) => next.tasks.find((t) => t.id === id)?.status !== "done",
          )
        )
          throw new Error(
            "Finish the dependencies before starting or completing this task.",
          );
        task.status = op.status;
      }
    }
    if (op.type === "set_event") {
      if (op.event !== undefined) next.event = op.event;
      if (op.hours !== undefined) {
        next.hours = op.hours;
        if (next.intake) next.intake.confirmed = [...new Set([...(next.intake.confirmed || []), "hours"])];
      }
      if (op.goal !== undefined) next.goal = op.goal;
    }
    if (op.type === "select_idea") {
      const idea = next.ideas.find(
        (i) => i.title.toLowerCase() === op.title.toLowerCase(),
      );
      if (!idea)
        throw new Error("Choose an idea that has already been suggested.");
      next.selectedIdea = idea;
    }
    if (op.type === "rename_companion") next.companion.name = op.name;
  }
  const visiting = new Set<string>(),
    visited = new Set<string>();
  function visit(id: string) {
    if (visiting.has(id))
      throw new Error("Task dependencies cannot form a cycle.");
    if (visited.has(id)) return;
    const task = next.tasks.find((t) => t.id === id);
    if (!task) throw new Error("A task dependency does not exist.");
    visiting.add(id);
    task.dependsOn.forEach(visit);
    visiting.delete(id);
    visited.add(id);
  }
  next.tasks.forEach((t) => visit(t.id));
  return next;
}
