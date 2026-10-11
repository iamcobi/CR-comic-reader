export type Provider = "demo" | "nvidia" | "gemini";
export type Member = {
  id: string;
  name: string;
  skills: string;
  level: string;
  role: string;
  interests: string;
};
export type Brief = {
  id: string;
  name: string;
  mime: string;
  text?: string;
  data?: string;
};
export type Source = { documentId: string; page: number | null; quote: string };
export type Idea = {
  title: string;
  problem: string;
  solution: string;
  fit: string;
  difficulty: string;
  hours: number;
  stack: string[];
  risks: string[];
  sources: Source[];
  generatedBy?: Provider;
};
export type Task = {
  id: string;
  title: string;
  ownerId: string;
  detail: string;
  status: "todo" | "doing" | "blocked" | "done";
  hours: number;
  dependsOn: string[];
};
export type Message = {
  role: "user" | "assistant";
  text: string;
  provider?: Provider;
};
export type Workspace = {
  intake?: import("./intake").Intake;
  pastExperience?: string;
  research?: { title: string; url: string; summary: string }[];
  event: string;
  hours: number;
  goal: string;
  members: Member[];
  documents: Brief[];
  ideas: Idea[];
  selectedIdea: Idea | null;
  tasks: Task[];
  messages: Message[];
  companion: { name: string; color: string };
  provider: Provider;
  planProvider?: Provider;
};
export type AIInput = {
  action: "ideas" | "plan" | "chat";
  provider: Provider;
  workspace: Workspace;
  question?: string;
  history?: Message[];
};
export type AIResult = {
  ideas?: Idea[];
  tasks?: Task[];
  answer?: string;
  sources?: Source[];
  demo?: boolean;
  operations?: AssistantOperation[];
};

export type AssistantOperation =
  | { type: "remove_member"; memberId: string }
  | {
      type: "update_member";
      memberId: string;
      name?: string;
      skills?: string;
      level?: string;
      role?: string;
      interests?: string;
    }
  | { type: "add_member"; member: Member }
  | { type: "add_tasks"; tasks: Task[] }
  | {
      type: "update_task";
      taskId: string;
      status?: Task["status"];
      ownerId?: string;
    }
  | { type: "set_event"; event?: string; hours?: number; goal?: string }
  | { type: "select_idea"; title: string }
  | { type: "rename_companion"; name: string };
