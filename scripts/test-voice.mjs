import { build } from "esbuild";
import assert from "node:assert/strict";
const cleanups = [];
// The hook reads local configuration; lifecycle tests make no network calls.
globalThis.fetch = async () => ({
  ok: true,
  json: async () => ({ voice: false }),
});
globalThis.__voiceCleanups = cleanups;
const bundle = await build({
  entryPoints: ["hooks/use-companion-voice.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
  plugins: [
    {
      name: "mock-react-lifecycle",
      setup(b) {
        b.onResolve({ filter: /^react$/ }, () => ({
          path: "react",
          namespace: "stub",
        }));
        b.onLoad({ filter: /.*/, namespace: "stub" }, () => ({
          contents:
            'export const useRef=x=>({current:x});export const useState=x=>[x==="browser"?(globalThis.__voiceTestEngine||x):x,()=>{}];export const useEffect=f=>{const cleanup=f();if(cleanup)globalThis.__voiceCleanups.push(cleanup);};',
          loader: "js",
        }));
      },
    },
  ],
});
let currentRecognition,
  utterance,
  canceled = 0;
class Recognition {
  start() {
    currentRecognition = this;
  }
  stop() {
    this.onend?.();
  }
  abort() {
    this.onend?.();
  }
}
globalThis.window = {
  SpeechRecognition: Recognition,
  speechSynthesis: {
    cancel() {
      canceled++;
    },
    speak(u) {
      utterance = u;
    },
  },
};
globalThis.SpeechSynthesisUtterance = class {
  constructor(text) {
    this.text = text;
  }
};
const { useCompanionVoice } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`
);
let passed = 0;
async function test(name, fn) {
  await fn();
  console.log("PASS " + name);
  passed++;
}
function setup() {
  const transcript = [],
    states = [],
    errors = [],
    partial = [];
  const voice = useCompanionVoice(
    (t) => transcript.push(t),
    (s) => states.push(s),
    (e) => errors.push(e),
    (t) => partial.push(t),
  );
  return { voice, transcript, states, errors, partial };
}
try {
  await test("Recognition starts only on a deliberate mic action", () => {
    currentRecognition = undefined;
    const s = setup();
    assert.equal(currentRecognition, undefined);
    s.voice.toggleMic();
    assert.ok(currentRecognition);
    assert.equal(s.states.at(-1), "listening");
    s.voice.endSession();
  });
  await test("Final transcript sends once after recognition ends", () => {
    const s = setup();
    s.voice.toggleMic();
    const r = currentRecognition;
    const event = {
      results: [
        { 0: { transcript: "Add a task: prepare pitch" }, isFinal: true },
      ],
    };
    r.onresult(event);
    r.onresult(event);
    assert.equal(s.transcript.length, 0);
    assert.equal(s.partial.at(-1), "Add a task: prepare pitch");
    s.voice.toggleMic();
    assert.deepEqual(s.transcript, ["Add a task: prepare pitch"]);
    r.onend();
    assert.equal(s.transcript.length, 1);
  });
  await test("Permission denial stays visible without submitting", () => {
    const s = setup();
    s.voice.toggleMic();
    currentRecognition.onerror({ error: "not-allowed" });
    currentRecognition.onend();
    assert.match(s.errors[0], /denied/);
    assert.equal(s.transcript.length, 0);
  });
  await test("Ending a session cancels unfinished microphone input", () => {
    const s = setup();
    s.voice.toggleMic();
    currentRecognition.onresult({
      results: [{ 0: { transcript: "Do not send this" }, isFinal: true }],
    });
    s.voice.endSession();
    assert.equal(s.transcript.length, 0);
  });
  await test("Speaking gesture waits for actual audio start and ignores canceled callbacks", async () => {
    const s = setup();
    await s.voice.speak("Hello team");
    assert.notEqual(s.states.at(-1), "speaking");
    utterance.onstart();
    assert.equal(s.states.at(-1), "speaking");
    const old = utterance;
    s.voice.stopSpeaking();
    old.onstart();
    assert.equal(s.states.at(-1), "idle");
    assert.ok(canceled > 0);
  });
  await test("Streamed speech chunks queue without interrupting or repeating the first sentence", async () => {
    const s = setup();
    await s.voice.speak("First sentence.");
    const first = utterance;
    s.voice.appendSpeech("Second sentence.");
    assert.equal(utterance, first);
    first.onend();
    assert.equal(utterance.text, "Second sentence.");
    const second = utterance;
    s.voice.appendSpeech("Canceled sentence.");
    s.voice.stopSpeaking();
    second.onend();
    assert.equal(utterance, second);
  });
  await test("Unsupported browser gives a text fallback", () => {
    delete window.SpeechRecognition;
    const s = setup();
    s.voice.toggleMic();
    assert.match(s.errors[0], /still type/);
  });
  await test("ElevenLabs attaches its audio element before playback and removes it on stop", async () => {
    globalThis.__voiceTestEngine = "elevenlabs";
    const attached = [];
    globalThis.document = {
      body: {
        appendChild(player) {
          attached.push(player);
        },
      },
    };
    globalThis.Audio = class {
      dataset = {};
      setAttribute() {}
      remove() {
        this.removed = true;
      }
      pause() {
        this.paused = true;
      }
      async play() {
        assert.ok(attached.includes(this));
        this.onplaying();
      }
    };
    globalThis.fetch = async (path) =>
      path === "/api/ai"
        ? { ok: true, json: async () => ({ voice: false }) }
        : new Response(new Uint8Array([73, 68, 51, 0]), {
            headers: { "Content-Type": "audio/mpeg" },
          });
    const s = setup();
    await s.voice.speak("Hello team");
    assert.equal(s.states.at(-1), "speaking");
    assert.equal(attached[0].dataset.playbackState, "playing");
    s.voice.stopSpeaking();
    assert.equal(attached[0].removed, true);
    assert.equal(s.states.at(-1), "idle");
    delete globalThis.__voiceTestEngine;
  });

  // MediaRecorder tests use synthetic blobs, never a real microphone.
  let recorded,
    stoppedTracks = 0,
    transcriptionCalls = 0;
  const flush = () => new Promise((resolve) => setImmediate(resolve));
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: {
      mediaDevices: {
        getUserMedia: async () => ({
          getTracks: () => [{ stop: () => stoppedTracks++ }],
        }),
      },
    },
  });
  globalThis.MediaRecorder = class {
    state = "inactive";
    mimeType = "audio/webm";
    static isTypeSupported(type) {
      return type === "audio/webm";
    }
    constructor() {
      recorded = this;
    }
    start() {
      this.state = "recording";
    }
    stop() {
      this.state = "inactive";
      this.ondataavailable?.({
        data: new Blob([new Uint8Array(200)], { type: this.mimeType }),
      });
      void this.onstop?.();
    }
  };
  const hostedFetch = async (path, options) => {
    if (path === "/api/ai")
      return {
        ok: true,
        json: async () => ({
          voice: true,
          transcription: true,
          voiceName: "Chris",
        }),
      };
    assert.equal(path, "/api/transcribe");
    assert.ok(options.body.get("file").size >= 200);
    transcriptionCalls++;
    return {
      ok: true,
      json: async () => ({ text: "Help us make a game plan" }),
    };
  };
  await test("Hosted recording sends once, transcribes, and releases the microphone", async () => {
    globalThis.fetch = hostedFetch;
    const s = setup();
    await flush();
    s.voice.toggleMic();
    await flush();
    assert.equal(recorded.state, "recording");
    s.voice.toggleMic();
    await flush();
    assert.deepEqual(s.transcript, ["Help us make a game plan"]);
    assert.ok(s.states.includes("transcribing"));
    assert.equal(transcriptionCalls, 1);
    assert.ok(stoppedTracks > 0);
    s.voice.endSession();
  });
  await test("Canceling a recording never submits its audio", async () => {
    globalThis.fetch = hostedFetch;
    const s = setup();
    await flush();
    s.voice.toggleMic();
    await flush();
    s.voice.endSession();
    await flush();
    assert.equal(transcriptionCalls, 1);
    assert.equal(s.transcript.length, 0);
  });
  await test("Permission denial explains how to recover", async () => {
    navigator.mediaDevices.getUserMedia = async () => {
      throw new DOMException("Denied", "NotAllowedError");
    };
    const s = setup();
    await flush();
    s.voice.toggleMic();
    await flush();
    assert.match(s.errors[0], /Allow microphone/);
    assert.equal(s.transcript.length, 0);
  });
  await test("Canceling while permission is pending releases a late microphone stream", async () => {
    let allow;
    navigator.mediaDevices.getUserMedia = () =>
      new Promise((resolve) => {
        allow = resolve;
      });
    const s = setup();
    await flush();
    s.voice.toggleMic();
    s.voice.endSession();
    const before = stoppedTracks;
    allow({ getTracks: () => [{ stop: () => stoppedTracks++ }] });
    await flush();
    assert.equal(stoppedTracks, before + 1);
    assert.equal(s.transcript.length, 0);
  });
  await test("Transcription provider failures stay visible without sending a chat", async () => {
    navigator.mediaDevices.getUserMedia = async () => ({
      getTracks: () => [{ stop: () => stoppedTracks++ }],
    });
    globalThis.fetch = async (path, options) =>
      path === "/api/ai"
        ? hostedFetch(path, options)
        : {
            ok: false,
            json: async () => ({ error: "Transcription quota exhausted" }),
          };
    const s = setup();
    await flush();
    s.voice.toggleMic();
    await flush();
    s.voice.toggleMic();
    await flush();
    assert.match(s.errors[0], /quota/);
    assert.equal(s.transcript.length, 0);
    s.voice.endSession();
  });
  await test("Browser speech initialization failure is caught without rejecting", async () => {
    const Constructor = globalThis.SpeechSynthesisUtterance;
    globalThis.SpeechSynthesisUtterance = class { constructor() { throw new Error("Fixture browser speech failure"); } };
    try {
      const s = setup();
      await assert.doesNotReject(s.voice.speak("Test reply"));
      assert.match(s.errors.at(-1), /Voice could not start/);
      s.voice.endSession();
    } finally { globalThis.SpeechSynthesisUtterance = Constructor; }
  });
  console.log(
    `${passed} mocked voice lifecycle checks passed. No microphone was recorded.`,
  );
} finally {
  for (const cleanup of cleanups) cleanup();
  delete globalThis.__voiceCleanups;
}
