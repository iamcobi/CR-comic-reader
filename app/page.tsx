"use client";
import { useEffect, useRef, useState } from "react";
import {
  ArrowUp,
  Mic,
  Paperclip,
  Volume2,
  VolumeX,
  X,
  Settings2,
  Check,
  ArrowDownToLine,
  MessageCircle,
  Pause,
} from "lucide-react";
import {
  freshWorkspace,
  currentIntake,
  questions,
  answerIntake,
  advance,
  removeMember,
  isUnknown,
  normalizeLevel,
} from "@/lib/hackmate/intake";
import { readDocuments } from "@/lib/hackmate/read-documents";
import { saveIntroduction } from "@/lib/hackmate/team-introduction";
import {
  logEvent,
  installRequestLogging,
  exportLogs,
} from "@/lib/hackmate/diagnostics";
import { loadWorkspace, saveWorkspace } from "@/lib/hackmate/storage";
import { applyOperations } from "@/lib/hackmate/operations";
import {
  motions,
  conversationMotion,
  operationMotions,
  intakeMotion,
  type Motion,
} from "@/lib/hackmate/motions";
import { useCompanionVoice } from "@/hooks/use-companion-voice";
import type {
  Workspace,
  AIResult,
  Task,
  Brief,
  Provider,
  Source,
} from "@/lib/hackmate/types";
type Sheet = "team" | "plan" | "settings" | "history" | "motions" | null;
import { Companion } from "@/components/companion";
export default function Home() {
  const [w, setW] = useState<Workspace>(freshWorkspace),
    [ready, setReady] = useState(false),
    [serverStatus, setServerStatus] = useState<{
      nvidia: { ready: boolean };
      gemini: { ready: boolean };
    } | null>(null),
    [sheet, setSheet] = useState<Sheet>(null),
    [motion, setMotion] = useState<Motion>("greeting"),
    [draft, setDraft] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [reply, setReply] = useState(questions.event),
    [pending, setPending] = useState<Task[] | null>(null),
    [pendingProvider, setPendingProvider] = useState<Provider>("demo"),
    [sources, setSources] = useState<Source[]>([]),
    [showIdeas, setShowIdeas] = useState(false),
    [receipt, setReceipt] = useState(""),
    [newName, setNewName] = useState(""),
    [newSkills, setNewSkills] = useState(""),
    [newLevel, setNewLevel] = useState(""),
    [researchLinks, setResearchLinks] = useState<
      { title: string; url: string; summary: string }[]
    >([]),
    [preview, setPreview] = useState<Motion>("greeting");
  const state = useRef(w),
    timeout = useRef<ReturnType<typeof setTimeout> | null>(null),
    input = useRef<HTMLInputElement>(null),
    composerInput = useRef<HTMLInputElement>(null),
    sending = useRef(false),
    voiceEnabled = useRef(false),
    talking = useRef(false),
    speechGesture = useRef<Motion | null>(null),
    dialog = useRef<HTMLDialogElement>(null),
    request = useRef<AbortController | null>(null),
    session = useRef(0),
    motionRef = useRef<Motion>("greeting"),
    journey = useRef<ReturnType<typeof setInterval> | null>(null);
  motionRef.current = motion;
  state.current = w;
  useEffect(() => installRequestLogging(), []);
  function animate(next: Motion, persistent = false, minimum = 0) {
    logEvent("motion", { name: next });
    if (timeout.current) clearTimeout(timeout.current);
    motionRef.current = next;
    setMotion(next);
    if (!persistent)
      timeout.current = setTimeout(
        () => setMotion(talking.current ? "speaking" : "idle"),
        Math.max(minimum, motions.find((m) => m.id === next)!.duration),
      );
  }
  function animateSequence(steps: Motion[]) {
    speechGesture.current = null;
    if (timeout.current) clearTimeout(timeout.current);
    const queue = [...steps];
    function next() {
      const gesture = queue.shift();
      if (!gesture) {
        setMotion(talking.current ? "speaking" : "idle");
        return;
      }
      setMotion(gesture);
      motionRef.current = gesture;
      timeout.current = setTimeout(
        next,
        Math.max(
          1400,
          Math.min(2200, motions.find((m) => m.id === gesture)!.duration),
        ),
      );
    }
    next();
  }
  const voice = useCompanionVoice(
    (text) => {
      setDraft("");
      void send(text);
    },
    (m) => {
      if (m === "speaking" && speechGesture.current) {
        const gesture = speechGesture.current;
        speechGesture.current = null;
        animate(gesture, false, 2500);
        return;
      }
      if (m === "listening" || m === "transcribing")
        speechGesture.current = null;
      if (
        m === "idle" &&
        !["speaking", "listening", "transcribing"].includes(motionRef.current)
      )
        return;
      if (
        m === "speaking" &&
        !["idle", "thinking", "searching", "reading", "speaking"].includes(
          motionRef.current,
        )
      )
        return;
      animate(m, m !== "idle");
    },
    (msg) => {
      logEvent("voice.error");
      speechGesture.current = null;
      setError(msg);
      animate("error");
    },
    setDraft,
  );
  voiceEnabled.current = voice.enabled;
  talking.current = voice.speaking;
  useEffect(() => {
    let active = true;
    fetch("/api/ai")
      .then((response) => (response.ok ? response.json() : null))
      .then((status: unknown) => {
        if (active) setServerStatus(status as typeof serverStatus);
      })
      .catch(() => {});
    loadWorkspace()
      .then((saved) => {
        if (!active) return;
        if (saved) {
          let restored: Workspace = {
            ...saved,
            members: saved.members.map((member) => ({
              ...member,
              level: normalizeLevel(member.level),
            })),
            documents: saved.documents.filter((d) => d.id !== "sample"),
            intake: currentIntake(saved),
          };
          const introductionText = saved.messages
            .filter((m) => m.role === "user" && /\bmy name is\b/i.test(m.text))
            .at(-1)?.text;
          const recovered =
            !restored.members.length && introductionText
              ? saveIntroduction(restored, introductionText)
              : null;
          if (recovered) {
            restored = recovered.workspace;
            logEvent("team.recovered_introduction", {
              members: restored.members.length,
            });
          }
          state.current = restored;
          setW(restored);
          setResearchLinks(saved.research || []);
          setReply(
            recovered
              ? recovered.answer
              : currentIntake(restored).stage !== "done"
                ? questions[currentIntake(restored).stage]
                : `Welcome back. I’ve kept our team and plan. What do you need today?`,
          );
          animate("remembering");
        }
        setReady(true);
      })
      .catch(() => {
        setReady(true);
        setError("Could not load saved workspace. Changes may not persist.");
      });
    return () => {
      active = false;
      if (timeout.current) clearTimeout(timeout.current);
      if (journey.current) clearInterval(journey.current);
      request.current?.abort();
    };
  }, []);
  useEffect(() => {
    if (ready)
      saveWorkspace(w).catch(() =>
        setError(
          "Your browser could not save this change. Export your plan to keep a copy.",
        ),
      );
  }, [w, ready]);
  useEffect(() => {
    if (sheet && !dialog.current?.open) dialog.current?.showModal();
    if (!sheet && dialog.current?.open) dialog.current.close();
  }, [sheet]);
  useEffect(() => {
    function shortcut(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSheet(null);
        composerInput.current?.focus();
      }
    }
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, []);
  function say(text: string, next: Motion = "understanding") {
    setReply(text);
    animate(next, voiceEnabled.current);
    speechGesture.current = voiceEnabled.current ? next : null;
    if (voiceEnabled.current) void voice.speak(text, next);
  }

  function recordLocal(
    next: Workspace,
    text: string,
    answer: string,
    gesture: Motion = "asking",
  ) {
    setDraft("");
    setError("");
    setReceipt("");
    next = {
      ...next,
      messages: [
        ...next.messages,
        { role: "user" as const, text },
        { role: "assistant" as const, text: answer },
      ].slice(-100),
    };
    logEvent("conversation.local", {
      stage: currentIntake(next).stage,
      members: next.members.length,
      inputLength: text.length,
    });
    state.current = next;
    setW(next);
    setSources([]);
    setShowIdeas(false);
    say(answer, gesture);
  }
  async function researchEvent(event: string) {
    if (!event) return;
    const version = session.current;
    try {
      const response = await fetch("/api/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event }),
      });
      const data = (await response.json()) as {
        findings?: { title: string; url: string; summary: string }[];
        error?: string;
      };
      if (version !== session.current || state.current.event !== event) return;
      if (!response.ok) {
        setReceipt(
          data.error || "Web search unavailable; share the event brief.",
        );
        return;
      }
      const findings = data.findings || [];
      setResearchLinks(findings);
      if (!findings.length)
        setReceipt(
          "I couldn’t verify relevant public research yet. Please share the official event link or brief.",
        );
      if (findings.length) {
        const document: Brief = {
          id: "research-" + crypto.randomUUID(),
          name: "Public research leads and past hackathon projects",
          mime: "text/plain",
          text:
            "SEARCH EXCERPTS ONLY. Not verified current rules. Past projects are inspiration. Confirm against the user's official brief.\n" +
            findings
              .map((f) => `${f.title}\n${f.url}\n${f.summary}`)
              .join("\n\n"),
        };
        const next = {
          ...state.current,
          research: findings,
          documents: [
            ...state.current.documents.filter(
              (d) => !d.id.startsWith("research-"),
            ),
            document,
          ],
        };
        state.current = next;
        setW(next);
        setReceipt(
          "I found public research leads. I still need your official hackathon materials to confirm the rules.",
        );
      }
    } catch {
      if (version === session.current)
        setReceipt(
          "Web research is unavailable. Share the official event brief when you can.",
        );
    }
  }
  function resetWorkspace() {
    if (!ready) return;
    speechGesture.current = null;
    session.current++;
    request.current?.abort();
    voice.endSession();
    if (journey.current) clearInterval(journey.current);
    if (timeout.current) clearTimeout(timeout.current);
    const next = freshWorkspace(state.current.provider);
    state.current = next;
    setW(next);
    setBusy(false);
    sending.current = false;
    setPending(null);
    setSources([]);
    setShowIdeas(false);
    setDraft("");
    setError("");
    setReceipt("");
    setResearchLinks([]);
    setNewName("");
    setNewSkills("");
    setNewLevel("");
    setSheet(null);
    say(questions.event, "greeting");
  }
  function addTeammate() {
    if (!newName.trim() || !newSkills.trim() || !newLevel) {
      setError(
        "Give the teammate’s name, skills, and level, or explicitly choose Unknown.",
      );
      return;
    }
    try {
      const next = applyOperations(state.current, [
        {
          type: "add_member",
          member: {
            id: crypto.randomUUID(),
            name: newName.trim(),
            skills: newSkills.trim(),
            level: newLevel,
            role: "",
            interests: "",
          },
        },
      ]);
      state.current = next;
      setW(next);
      setNewName("");
      setNewSkills("");
      setNewLevel("");
      setError("");
      animate("welcoming-member");
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Could not add teammate.",
      );
    }
  }
  async function send(text: string) {
    if (!text.trim() || sending.current || !ready) return;
    if (
      /^(?:reset everything|reset (?:the )?workspace|start (?:a )?new hackathon|new hackathon(?: team)?|new team)[.!]?$/i.test(
        text.trim(),
      )
    ) {
      resetWorkspace();
      return;
    }
    const introduction = saveIntroduction(state.current, text);
    if (introduction) {
      recordLocal(
        introduction.workspace,
        text,
        introduction.answer,
        "welcoming-member",
      );
      logEvent("team.introduction_saved", {
        members: introduction.workspace.members.length,
      });
      animateSequence(["welcoming-member", "saving", "asking"]);
      return;
    }
    const intake = currentIntake(state.current);
    if (/bond|check.?in|team morale/i.test(text)) {
      recordLocal(
        state.current,
        text,
        "Let’s do a quick team round: each person share their name, one thing they can help with, and one thing they’re excited or worried about. Then we’ll choose a small first win together.",
        "team-checkin",
      );
      return;
    }
    if (
      intake.stage !== "done" &&
      !(
        intake.stage === "team" &&
        !text.includes("|") &&
        !/^(?:I (?:don['’]?t|do not) (?:know|have)(?: (?:a |my )?team)?|unknown|not sure|unsure|no team)[.!]?$/i.test(
          text.trim(),
        ) &&
        !/^(?:done|that['’]?s everyone|team is ready)$/i.test(text.trim()) &&
        !/\b(ideas?|projects?|plan)\b/i.test(text)
      )
    ) {
      let result;
      if (
        /^(?:done|that['’]?s everyone|team is ready)$/i.test(text.trim()) &&
        intake.stage === "team" &&
        state.current.members.length &&
        state.current.members.every((m) => m.name && m.skills && m.level)
      ) {
        const next = advance(state.current);
        result = {
          workspace: next,
          answer: questions[currentIntake(next).stage],
          accepted: true,
        };
      } else if (
        /^(?:give|find|suggest|recommend|show|make|create).*\b(?:ideas?|projects?|plan)\b/i.test(
          text.trim(),
        ) ||
        /^ideas?[.!?]?$/i.test(text.trim())
      ) {
        result = {
          workspace: state.current,
          answer: questions[intake.stage],
          accepted: false,
        };
      } else result = answerIntake(state.current, text);
      recordLocal(
        result.workspace,
        text,
        result.answer,
        intakeMotion(intake.stage, result.accepted),
      );
      if (result.accepted && intake.stage === "event")
        void researchEvent(result.workspace.event);
      return;
    }
    sending.current = true;
    setReply("Let me check that.");
    setBusy(true);
    setError("");
    setReceipt("");
    voice.stopSpeaking();
    setDraft("");
    const snapshot = { ...state.current, intake: currentIntake(state.current) };
    const version = session.current;
    const controller = new AbortController();
    request.current = controller;
    const action =
      /^(add|assign|complete|finish|mark done|block|unblock|choose|select|let['’]?s build)\b/i.test(
        text,
      )
        ? "chat"
        : /\b(ideas?|suggest projects?|recommend projects?)\b/i.test(text)
          ? "ideas"
          : /\b(game plan|make.*plan|create.*plan|build.*plan)\b/i.test(text)
            ? "plan"
            : "chat";
    if (action === "plan" && !snapshot.selectedIdea) {
      say(
        "Let’s choose an idea first. Ask me for project ideas, then pick one to plan.",
        "asking",
      );
      setBusy(false);
      sending.current = false;
      return;
    }
    setW({
      ...snapshot,
      messages: [...snapshot.messages, { role: "user" as const, text }].slice(
        -100,
      ),
    });
    animate(
      action === "plan"
        ? "planning"
        : action === "ideas"
          ? "thinking"
          : snapshot.documents.length && /brief|document|sponsor/.test(text)
            ? "reading"
            : "thinking",
      true,
    );
    let step = 0;
    const progress: Motion[] = snapshot.documents.length
      ? ["reading", "searching", "thinking"]
      : ["understanding", "thinking"];
    journey.current = setInterval(() => {
      if (!voice.listening && !voice.transcribing)
        animate(progress[step++ % progress.length], true);
    }, 1800);
    let spokenPrefix = "";
    const maySpeakEarly =
      action === "chat" &&
      snapshot.intake?.stage === "done" &&
      !/\b(add|delete|remove|save|update|assign|complete|finish|mark|choose|select|build|change|create|team|member)\b/i.test(
        text,
      );
    logEvent("assistant.started", {
      stage: snapshot.intake?.stage || "legacy",
      action,
      members: snapshot.members.length,
    });
    try {
      const response = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          stream: action === "chat",
          provider: snapshot.provider,
          workspace: snapshot,
          question: text,
          history: snapshot.messages.slice(-6),
        }),
        signal: controller.signal,
      });
      let result: AIResult & { error?: string };
      if (
        response.headers
          .get("content-type")
          ?.includes("application/x-ndjson") &&
        response.body
      ) {
        const reader = response.body.getReader(),
          decoder = new TextDecoder();
        let buffer = "",
          final: AIResult | undefined;
        try {
          while (true) {
            const { value, done } = await reader.read();
            buffer += decoder.decode(value, { stream: !done });
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";
            for (const line of lines) {
              if (!line.trim()) continue;
              const event = JSON.parse(line) as {
                text?: string;
                result?: AIResult;
                error?: string;
              };
              if (version !== session.current) return;
              if (event.error) throw new Error(event.error);
              if (event.text !== undefined) {
                // Mutation previews are withheld until their operations validate.
                if (
                  maySpeakEarly &&
                  !/\b(add|added|saved|updated|removed|assigned|created)\b/i.test(
                    event.text,
                  )
                ) {
                  setReply(event.text);
                  const first = event.text.match(
                    /^([\s\S]+?[.!?])(?:\s|$)/,
                  )?.[1];
                  if (first && !spokenPrefix && voiceEnabled.current) {
                    spokenPrefix = first;
                    void voice.speak(first, "understanding");
                    logEvent("voice.first_sentence", {
                      characters: first.length,
                    });
                  }
                }
                if (journey.current) clearInterval(journey.current);
                animate("understanding", true);
              }
              if (event.result) final = event.result;
            }
            if (done) break;
          }
        } finally {
          reader.releaseLock();
        }
        if (!final)
          throw new Error("The reply was interrupted. Please try again.");
        result = final;
      } else result = await response.json();
      if (version !== session.current) return;
      if (journey.current) clearInterval(journey.current);
      if (!response.ok)
        throw new Error(result.error || "The assistant could not respond.");
      let next = state.current;
      let answer = result.answer || "";
      let nextMotion = conversationMotion(text + " " + answer);
      if (result.ideas) {
        setShowIdeas(true);
        next = {
          ...next,
          ideas: result.ideas.map((i) => ({
            ...i,
            generatedBy: snapshot.provider,
          })),
        };
        answer =
          "Here are a few directions for our team. Pick one that feels useful, and I’ll help us turn it into a game plan.";
        nextMotion = "suggesting";
      }
      if (result.tasks) {
        setPending(
          result.tasks.map((task) =>
            task.ownerId &&
            !state.current.members.some((member) => member.id === task.ownerId)
              ? { ...task, ownerId: "" }
              : task,
          ),
        );
        setPendingProvider(snapshot.provider);
        answer =
          "I’ve drafted a game plan with owners and dependencies. Open the plan to review it together before using it.";
        nextMotion = "planning";
      }
      if (result.operations?.length) {
        next = applyOperations(next, result.operations);
        const op = result.operations[0];
        if (result.operations.some((op) => op.type === "remove_member"))
          setPending(
            (previous) =>
              previous?.map((t) =>
                next.members.some((m) => m.id === t.ownerId)
                  ? t
                  : { ...t, ownerId: "" },
              ) || null,
          );
        if (op.type === "select_idea") setShowIdeas(false);
        nextMotion =
          op.type === "add_member"
            ? "welcoming-member"
            : op.type === "add_tasks"
              ? "adding-task"
              : op.type === "select_idea"
                ? "choosing"
                : op.type === "update_task"
                  ? op.status === "done"
                    ? "completing-task"
                    : op.status === "blocked"
                      ? "spotting-blocker"
                      : op.status === "todo"
                        ? "resolving-blocker"
                        : "assigning-task"
                  : "saving";
        setReceipt(
          `${result.operations.length} change${result.operations.length > 1 ? "s" : ""} saved · Open ${["add_member", "update_member", "remove_member"].includes(op.type) ? "team" : "plan"} to see it`,
        );
        if (next.tasks.length && next.tasks.every((t) => t.status === "done"))
          nextMotion = "celebrating";
      }
      if (
        snapshot.intake?.stage === "team" &&
        next.members.length &&
        next.members.every((m) => m.name && m.skills && m.level) &&
        /(?:that(?:['’]s| is) (?:everyone|all)|everyone on|team is (?:ready|complete)|no (?:one else|other teammates)|only me|just me|solo)/i.test(
          text +
            " " +
            snapshot.messages
              .filter((m) => m.role === "user")
              .slice(-3)
              .map((m) => m.text)
              .join(" "),
        )
      ) {
        next = advance(next);
        answer = questions[currentIntake(next).stage];
      }
      next = {
        ...next,
        messages: [
          ...next.messages,
          {
            role: "assistant" as const,
            text: answer,
            provider: snapshot.provider,
          },
        ].slice(-100),
      };
      state.current = next;
      setW(next);
      logEvent("assistant.committed", {
        operations: (result.operations || []).map((op) => op.type).join(","),
        members: next.members.length,
        stage: currentIntake(next).stage,
      });
      setSources(result.sources || []);
      if (spokenPrefix && answer.startsWith(spokenPrefix)) {
        setReply(answer);
        const remainder = answer.slice(spokenPrefix.length).trim();
        if (remainder) voice.appendSpeech(remainder, nextMotion);
        animate(nextMotion);
      } else say(answer, nextMotion);
      if (result.operations?.length) {
        const gestures = operationMotions(result.operations);
        if (next.tasks.length && next.tasks.every((t) => t.status === "done"))
          gestures.push("celebrating");
        if (result.sources?.length) gestures.unshift("reading");
        animateSequence(gestures);
      }
    } catch (e) {
      logEvent("assistant.failed", { canceled: controller.signal.aborted });
      if (version !== session.current) return;
      setError(e instanceof Error ? e.message : "Something went wrong.");
      animate("error");
    } finally {
      if (version === session.current) {
        if (journey.current) clearInterval(journey.current);
        setBusy(false);
        sending.current = false;
      }
    }
  }
  async function upload(files: FileList | null) {
    if (!files?.length || !ready || sending.current) return;
    sending.current = true;
    setBusy(true);
    setError("");
    setReceipt("");
    voice.stopSpeaking();
    animate("reading", true);
    const version = session.current;
    const controller = new AbortController();
    request.current = controller;
    setReply("I’m reading your documents. Image pages will use local OCR.");
    try {
      const { added, failures } = await readDocuments(
        Array.from(files),
        state.current.documents.filter((d) => d.id !== "sample"),
        state.current.provider,
        {
          signal: controller.signal,
          onProgress: (filename, event) => {
            if (version !== session.current) return;
            setReply(
              `${filename} · page ${event.page} of ${event.total} · ${event.phase === "ocr" ? `reading image text${event.percent === undefined ? "" : ` (${event.percent}%)`}` : "extracting text"}`,
            );
          },
        },
      );
      if (version !== session.current) return;
      if (!added.length)
        throw new Error(failures.join("\n") || "No documents could be read.");
      let next = {
        ...state.current,
        documents: [
          ...state.current.documents.filter((d) => d.id !== "sample"),
          ...added,
        ],
      };
      if (currentIntake(next).stage === "documents") next = advance(next);
      const answer =
        currentIntake(next).stage === "done"
          ? `I’ve read ${added.length} document${added.length === 1 ? "" : "s"}. I’ll use the actual brief before recommending projects. What would you like to explore?`
          : `I’ve read ${added.length} document${added.length === 1 ? "" : "s"}. ${questions[currentIntake(next).stage]}`;
      next = {
        ...next,
        messages: [
          ...next.messages,
          { role: "assistant" as const, text: answer },
        ].slice(-100),
      };
      state.current = next;
      setW(next);
      setError(failures.join("\n"));
      setReceipt(
        `${added.length} document${added.length === 1 ? "" : "s"} read and saved`,
      );
      say(answer, "reading");
      animateSequence(["reading", "understanding", "saving"]);
    } catch (e) {
      if (version !== session.current || controller.signal.aborted) return;
      setError(e instanceof Error ? e.message : "Could not read the file.");
      setReply(
        "I couldn’t finish reading those documents. Your existing work is kept.",
      );
      animate("error");
    } finally {
      if (version === session.current) {
        setBusy(false);
        sending.current = false;
      }
      if (input.current) input.current.value = "";
    }
  }
  function selectIdea(index: number) {
    const idea = w.ideas[index];
    setShowIdeas(false);
    setW({ ...w, selectedIdea: idea });
    say(
      `Let’s build ${idea.title}. Ask me to make a game plan when you’re ready.`,
      "choosing",
    );
  }
  function updateTask(task: Task, status: Task["status"]) {
    try {
      const next = applyOperations(w, [
        { type: "update_task", taskId: task.id, status },
      ]);
      setW(next);
      animate(
        next.tasks.every((t) => t.status === "done")
          ? "celebrating"
          : status === "done"
            ? "completing-task"
            : status === "blocked"
              ? "spotting-blocker"
              : task.status === "blocked"
                ? "resolving-blocker"
                : "saving",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update task.");
    }
  }
  function exportPlan() {
    const content =
      `# ${w.event || "Your hackathon"}\n\n${w.selectedIdea?.title || "Team plan"}\n\n` +
      w.tasks
        .map(
          (t) =>
            `- [${t.status === "done" ? "x" : " "}] ${t.title} — ${w.members.find((m) => m.id === t.ownerId)?.name || "Unassigned"} (${t.status})\n  ${t.detail}`,
        )
        .join("\n");
    const url = URL.createObjectURL(
      new Blob([content], { type: "text/markdown" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "hackmate-plan.md";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    animate("exporting");
  }
  const label = motions.find((m) => m.id === motion)!;
  const done = w.tasks.filter((t) => t.status === "done").length;
  return (
    <main className="app">
      <header>
        <a className="brand" href="/">
          h<span>m</span>
          <small>hackmate</small>
        </a>
        <nav aria-label="Workspace">
          <button disabled={!ready} onClick={resetWorkspace}>
            New hackathon
          </button>
          <button
            disabled={!ready}
            onClick={() => {
              setSheet("team");
              animate("asking");
            }}
          >
            Our team <span>{w.members.length}</span>
          </button>
          <button
            disabled={!ready}
            onClick={() => {
              setSheet("plan");
              animate("searching");
            }}
          >
            The plan{" "}
            <span>
              {done}/{w.tasks.length}
            </span>
          </button>
          <button
            className="icon"
            aria-label="Settings"
            onClick={() => setSheet("settings")}
          >
            <Settings2 size={18} />
          </button>
        </nav>
      </header>
      <div className="mode-label">
        <span className="status-dot" />
        {w.provider === "demo"
          ? "Demo conversation · sample workspace"
          : `${w.provider === "gemini" ? "Gemini" : "NVIDIA"} · ${serverStatus ? (serverStatus[w.provider].ready ? "live assistant ready" : "add a server API key") : "checking setup"}`}
      </div>
      <section className="stage" aria-label="Your assistant">
        <div className="stage-eyebrow">
          A LITTLE COMPANION. A SHARED AMBITION.
        </div>
        <button
          className="companion-tap"
          aria-label={`Talk to ${w.companion.name}`}
          disabled={!ready || busy || voice.listening || voice.transcribing}
          onClick={() => {
            composerInput.current?.focus();
            say("Hey, what do you need me for?", "greeting");
          }}
        >
          <Companion motion={motion} talking={voice.speaking} />
        </button>
        <div className="state-label" role="status">
          {motion === "idle"
            ? `${w.companion.name} is here for you`
            : label.name}
        </div>
        <h1>
          {busy
            ? "Let me think that through."
            : voice.listening
              ? "I’m listening."
              : w.companion.name + " · your teammate"}
        </h1>
        <p className="reply" aria-live="polite">
          {reply}
        </p>
        {sources.length > 0 && (
          <details className="citations">
            <summary>From your brief · {sources.length} references</summary>
            {sources.map((source, i) => (
              <p key={i}>
                {w.documents.find((d) => d.id === source.documentId)?.name}
                {source.page ? ` · page ${source.page}` : ""}
                <br />“{source.quote}”
              </p>
            ))}
          </details>
        )}
        {receipt && (
          <p className="receipt">
            <Check size={14} />
            {receipt}
          </p>
        )}
        {showIdeas && w.ideas.length > 0 && !busy && (
          <div className="idea-choices" aria-label="Suggested projects">
            {w.ideas.map((idea, i) => (
              <button
                key={idea.title}
                onClick={() => selectIdea(i)}
                className={
                  w.selectedIdea?.title === idea.title ? "selected" : ""
                }
              >
                <small>0{i + 1}</small>
                {idea.title}
                <span>{idea.hours}h</span>
              </button>
            ))}
          </div>
        )}
        {pending && (
          <button className="text-button" onClick={() => setSheet("plan")}>
            Review the proposed plan →
          </button>
        )}
      </section>
      <section className="conversation">
        <div className="suggestions">
          <button
            disabled={busy || !ready}
            onClick={() => {
              setSheet("team");
              animate("asking");
            }}
          >
            Meet our team
          </button>
          <button
            disabled={busy || !ready}
            onClick={() => void send("Give us project ideas")}
          >
            Find our idea
          </button>
          <button
            disabled={busy || !ready}
            onClick={() => void send("Let’s do a team bonding check-in")}
          >
            Team check-in
          </button>
        </div>
        {error && (
          <div className="error" role="alert">
            {error}
            <button aria-label="Dismiss error" onClick={() => setError("")}>
              <X size={14} />
            </button>
          </div>
        )}
        <form
          className="composer"
          onSubmit={(e) => {
            e.preventDefault();
            void send(draft);
          }}
        >
          <button
            type="button"
            className="icon"
            aria-label="Attach hackathon documents"
            disabled={busy || !ready}
            onClick={() => input.current?.click()}
          >
            <Paperclip size={20} />
          </button>
          <input
            ref={composerInput}
            aria-label="Message your assistant"
            placeholder={
              voice.listening
                ? "Listening… tap the microphone to finish"
                : "Talk to me. We’ll figure it out together."
            }
            value={draft}
            maxLength={4000}
            onChange={(e) => setDraft(e.target.value)}
            disabled={!ready || busy || voice.listening || voice.transcribing}
          />
          <button
            type="button"
            className={`icon mic ${voice.listening ? "active" : ""}`}
            aria-label={
              voice.transcribing
                ? "Transcribing message"
                : voice.listening
                  ? "Stop listening"
                  : "Start microphone"
            }
            disabled={!ready || busy || voice.transcribing || !voice.supported}
            onClick={voice.toggleMic}
          >
            <Mic size={20} />
          </button>
          <button
            className="send"
            aria-label="Send message"
            disabled={busy || !draft.trim() || !ready}
          >
            <ArrowUp size={20} />
          </button>
        </form>
        <input
          hidden
          type="file"
          multiple
          ref={input}
          accept=".txt,.md,.csv,.pdf,.png,.jpg,.jpeg,.webp"
          onChange={(e) => void upload(e.target.files)}
        />
        <div className="conversation-footer">
          <button
            disabled={!ready}
            onClick={() => {
              if (voice.enabled) {
                speechGesture.current = null;
                voice.endSession();
                animate("goodbye");
              } else {
                voice.setEnabled(true);
                void voice.speak(reply);
              }
            }}
          >
            {voice.enabled ? <Volume2 size={14} /> : <VolumeX size={14} />}Voice{" "}
            {voice.enabled ? "on" : "off"}
          </button>
          {voice.speaking && (
            <button
              onClick={() => {
                speechGesture.current = null;
                voice.stopSpeaking();
                animate("idle");
              }}
            >
              <Pause size={14} />
              Stop speaking
            </button>
          )}
          <span>
            {voice.listening
              ? "Tap mic to finish · sends after you stop"
              : voice.supported
                ? voice.transcribing
                  ? "Turning your voice into words…"
                  : "Tap mic · speak · tap again to send"
                : "Type here · microphone needs a supporting browser"}
          </span>
          <button onClick={() => setSheet("history")}>
            <MessageCircle size={14} />
            Conversation
          </button>
        </div>
      </section>
      <footer>
        <span>{w.event || "Your hackathon"}</span>
        <button onClick={() => setSheet("motions")}>
          30 ways to be here for you ↗
        </button>
      </footer>
      {researchLinks.length > 0 && (
        <details className="research-links">
          <summary>Research sources · verify against your brief</summary>
          {researchLinks.map((link) => (
            <p key={link.url}>
              <a href={link.url} target="_blank" rel="noreferrer">
                {link.title}
              </a>
            </p>
          ))}
        </details>
      )}
      <dialog
        ref={dialog}
        onCancel={() => setSheet(null)}
        onClick={(e) => {
          if (e.target === dialog.current) setSheet(null);
        }}
      >
        <div className="sheet">
          <div className="sheet-header">
            <h2>
              {sheet === "team"
                ? "People before projects."
                : sheet === "plan"
                  ? "Our game plan."
                  : sheet === "settings"
                    ? "Make yourself at home."
                    : sheet === "history"
                      ? "Our conversation."
                      : "A companion with character."}
            </h2>
            <button
              className="icon"
              aria-label="Close panel"
              onClick={() => setSheet(null)}
            >
              <X size={22} />
            </button>
          </div>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          {sheet === "team" && (
            <>
              <p>
                Tell me who’s here, what they know, and what excites them. These
                details help me suggest realistic work.
              </p>
              {w.members.map((member) => (
                <div className="member" key={member.id}>
                  <b className="avatar">{member.name.slice(0, 1)}</b>
                  <div>
                    <input
                      aria-label={`${member.name} name`}
                      value={member.name}
                      maxLength={60}
                      onChange={(e) =>
                        setW({
                          ...w,
                          members: w.members.map((m) =>
                            m.id === member.id
                              ? { ...m, name: e.target.value }
                              : m,
                          ),
                        })
                      }
                    />
                    <input
                      aria-label={`${member.name} skills`}
                      value={member.skills}
                      onChange={(e) =>
                        setW({
                          ...w,
                          members: w.members.map((m) =>
                            m.id === member.id
                              ? { ...m, skills: e.target.value }
                              : m,
                          ),
                        })
                      }
                    />
                    <select
                      aria-label={`${member.name} level`}
                      value={member.level}
                      onChange={(e) =>
                        setW({
                          ...w,
                          members: w.members.map((m) =>
                            m.id === member.id
                              ? { ...m, level: e.target.value }
                              : m,
                          ),
                        })
                      }
                    >
                      <option value="">Experience needed</option>
                      {["Unknown", "Learning", "Intermediate", "Advanced"].map(
                        (l) => (
                          <option key={l}>{l}</option>
                        ),
                      )}
                    </select>
                  </div>
                  <button
                    aria-label={`Delete ${member.name}`}
                    onClick={() => {
                      const next = removeMember(state.current, member.id);
                      state.current = next;
                      setW(next);
                      setPending(
                        (previous) =>
                          previous?.map((t) =>
                            t.ownerId === member.id ? { ...t, ownerId: "" } : t,
                          ) || null,
                      );
                      animate("saving");
                    }}
                  >
                    <X size={16} />
                  </button>
                </div>
              ))}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  addTeammate();
                }}
                className="team-add"
              >
                <label>
                  Name
                  <input
                    aria-label="New teammate name"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    maxLength={60}
                  />
                </label>
                <label>
                  Skills
                  <input
                    aria-label="New teammate skills"
                    value={newSkills}
                    onChange={(e) => setNewSkills(e.target.value)}
                    placeholder="Python, React, or unknown"
                    maxLength={1000}
                  />
                </label>
                <label>
                  Experience
                  <select
                    aria-label="New teammate level"
                    value={newLevel}
                    onChange={(e) => setNewLevel(e.target.value)}
                  >
                    <option value="">Choose level</option>
                    {["Unknown", "Learning", "Intermediate", "Advanced"].map(
                      (level) => (
                        <option key={level}>{level}</option>
                      ),
                    )}
                  </select>
                </label>
                <button type="submit">Add teammate</button>
              </form>
              {currentIntake(w).stage === "team" && (
                <button
                  disabled={!w.members.length}
                  onClick={() => {
                    setSheet(null);
                    void send("Team is ready");
                  }}
                >
                  Team is ready →
                </button>
              )}
              <button
                onClick={() => {
                  setSheet(null);
                  setDraft("Add Jordan to our team, skills: Python and APIs");
                  animate("asking");
                }}
              >
                Add someone through conversation →
              </button>
              <button
                onClick={() => {
                  setSheet(null);
                  void send("Let’s do a team bonding check-in");
                }}
              >
                Start a team check-in →
              </button>
              <small className="note">
                Add your real teammates above, or tell Pip about your team.
                Deleting someone keeps their tasks and makes them unassigned.
                Check-ins happen here; messages are not sent to Discord.
              </small>
            </>
          )}
          {sheet === "plan" && (
            <>
              {pending && (
                <div className="proposal">
                  <strong>
                    Proposed plan ·{" "}
                    {pendingProvider === "demo" ? "sample" : "AI-generated"}
                  </strong>
                  {pending.map((t) => (
                    <div className="proposed-task" key={t.id}>
                      <strong>{t.title}</strong>
                      <p>{t.detail}</p>
                      <small>
                        {w.members.find((m) => m.id === t.ownerId)?.name ||
                          "Unassigned"}{" "}
                        · {t.hours}h estimate
                        {t.dependsOn.length
                          ? " · after " +
                            t.dependsOn
                              .map(
                                (id) => pending.find((x) => x.id === id)?.title,
                              )
                              .join(", ")
                          : ""}
                      </small>
                    </div>
                  ))}
                  <p>
                    Using this plan replaces the current task list. Review it
                    with your team first.
                  </p>
                  <button
                    onClick={() => {
                      setW({
                        ...w,
                        tasks: pending,
                        planProvider: pendingProvider,
                      });
                      setPending(null);
                      animate("saving");
                    }}
                  >
                    Use this plan
                  </button>
                  <button onClick={() => setPending(null)}>
                    Keep current plan
                  </button>
                </div>
              )}
              <p>
                {w.selectedIdea?.title || "No project selected yet"} · {done} of{" "}
                {w.tasks.length} done
              </p>
              {w.selectedIdea && (
                <details className="idea-details">
                  <summary>Why this idea fits</summary>
                  <p>{w.selectedIdea.problem}</p>
                  <p>{w.selectedIdea.solution}</p>
                  <p>{w.selectedIdea.fit}</p>
                  <p>Stack: {w.selectedIdea.stack.join(", ")}</p>
                  <p>Risks: {w.selectedIdea.risks.join("; ")}</p>
                  <small>
                    {w.selectedIdea.generatedBy === "demo"
                      ? "Illustrative demo idea"
                      : "AI suggestion · verify sponsor eligibility in your event brief"}
                  </small>
                </details>
              )}
              {w.tasks.map((t) => (
                <div className="task" key={t.id}>
                  <div>
                    <strong>{t.title}</strong>
                    <p>{t.detail}</p>
                    <small>
                      {w.members.find((m) => m.id === t.ownerId)?.name ||
                        "Unassigned"}{" "}
                      · {t.hours}h estimate
                      {t.dependsOn.length
                        ? " · depends on " +
                          t.dependsOn
                            .map(
                              (id) => w.tasks.find((x) => x.id === id)?.title,
                            )
                            .join(", ")
                        : ""}
                    </small>
                  </div>
                  <select
                    aria-label={`Status for ${t.title}`}
                    value={t.status}
                    onChange={(e) =>
                      updateTask(t, e.target.value as Task["status"])
                    }
                  >
                    {["todo", "doing", "blocked", "done"].map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </div>
              ))}
              {!w.tasks.length && !pending && (
                <p>
                  No tasks yet. This panel only shows your plan; tell Pip when
                  you’re ready to create one.
                </p>
              )}
              <button disabled={!w.tasks.length} onClick={exportPlan}>
                <ArrowDownToLine size={16} />
                Export plan
              </button>
              <button
                onClick={() => {
                  setSheet(null);
                  void send("Make a game plan");
                }}
              >
                Ask me to draft a plan →
              </button>
            </>
          )}
          {sheet === "settings" && (
            <>
              <button
                onClick={() =>
                  void exportLogs().catch(() =>
                    setError("Diagnostics could not be exported."),
                  )
                }
              >
                Export diagnostic logs
              </button>
              <p className="note">
                The last 500 request, save, action, motion, and voice events
                stay in this browser across reloads and workspace resets. Logs
                exclude messages, documents, audio, and API keys.
              </p>
              <button onClick={resetWorkspace}>
                Reset everything & start fresh
              </button>
              <p className="note">
                Clears this workspace’s team, documents, ideas, tasks, and
                conversation. Server API keys stay configured.
              </p>
              <label>
                Companion name
                <input
                  maxLength={40}
                  value={w.companion.name}
                  onChange={(e) =>
                    setW({
                      ...w,
                      companion: { ...w.companion, name: e.target.value },
                    })
                  }
                />
              </label>
              <label>
                AI provider
                <select
                  aria-label="AI provider"
                  value={w.provider}
                  onChange={(e) =>
                    setW({ ...w, provider: e.target.value as Provider })
                  }
                >
                  <option value="demo">Demo · no API key</option>
                  <option value="nvidia">NVIDIA · text documents</option>
                  <option value="gemini">Gemini · text, PDFs & images</option>
                </select>
              </label>
              <p>
                Demo uses scripted replies and sample ideas. Live providers
                require server API keys in .env or .env.local. Changing the
                provider keeps your workspace.
              </p>
              <label>
                Voice engine
                <select
                  value={voice.engine}
                  onChange={(e) =>
                    voice.setEngine(e.target.value as "browser" | "elevenlabs")
                  }
                >
                  <option value="browser">Browser voice · no API key</option>
                  <option value="elevenlabs">
                    ElevenLabs · {voice.voiceName || "server key required"}
                  </option>
                </select>
              </label>
              <p>
                Tap the microphone, speak, then tap again to send. Spoken
                replies turn on automatically. Audio goes to ElevenLabs for
                transcription and is not saved by this app. Your transcript goes
                to NVIDIA for the reply. Microphone access starts only after you
                tap it. Chris uses the expressive ElevenLabs V4 Turbo voice.
              </p>
              <p className="note">
                GitHub and Discord account connections are future work. This
                version keeps the team’s context and plan in this browser.
              </p>
              <button onClick={() => setSheet("motions")}>
                Explore all 30 animations →
              </button>
            </>
          )}
          {sheet === "history" && (
            <div className="history">
              {w.messages.map((m, i) => (
                <article key={i} className={m.role}>
                  <small>
                    {m.role === "user" ? "You" : w.companion.name}
                    {m.provider === "demo" ? " · demo" : ""}
                  </small>
                  <p>{m.text}</p>
                </article>
              ))}
            </div>
          )}
          {sheet === "motions" && (
            <>
              <p>
                One gesture at a time. Each responds to a different moment in
                our conversation. Reduced motion follows your device preference.
              </p>
              <div className="motion-preview">
                <Companion motion={preview} />
                <strong>{motions.find((m) => m.id === preview)?.name}</strong>
              </div>
              <div className="motion-grid">
                {motions.map((m, i) => (
                  <button
                    key={m.id}
                    aria-pressed={preview === m.id}
                    onClick={() => {
                      setPreview(m.id);
                      animate(m.id);
                    }}
                  >
                    <small>{String(i + 1).padStart(2, "0")}</small>
                    <strong>{m.name}</strong>
                    <span>{m.trigger}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </dialog>
    </main>
  );
}
