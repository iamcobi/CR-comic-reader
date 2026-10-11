"use client";
import { useEffect, useRef, useState } from "react";
import { logEvent } from "@/lib/hackmate/diagnostics";
type Recognition = {
  start(): void;
  abort(): void;
  stop(): void;
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult:
    | ((e: {
        results: {
          length: number;
          [n: number]: {
            isFinal: boolean;
            [n: number]: { transcript: string };
          };
        };
      }) => void)
    | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
};
type VoiceWindow = Window & {
  SpeechRecognition?: new () => Recognition;
  webkitSpeechRecognition?: new () => Recognition;
};
export function useCompanionVoice(
  onTranscript: (text: string) => void,
  onState: (state: "listening" | "transcribing" | "speaking" | "idle") => void,
  onError: (text: string) => void,
  onPartial: (text: string) => void,
) {
  const [supported, setSupported] = useState(false),
    [listening, setListening] = useState(false),
    [transcribing, setTranscribing] = useState(false),
    [speaking, setSpeaking] = useState(false),
    [enabled, setEnabled] = useState(false),
    [voiceName, setVoiceName] = useState(""),
    [engine, setEngine] = useState<"browser" | "elevenlabs">("browser");
  const rec = useRef<Recognition | null>(null),
    audio = useRef<HTMLAudioElement | null>(null),
    url = useRef(""),
    generation = useRef(0),
    request = useRef<AbortController | null>(null),
    timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const capture = useRef(0);
  const starting = useRef(false);
  const converting = useRef(false);
  const hosted = useRef(false);
  const transcriptionRequest = useRef<AbortController | null>(null);
  function cancelRecording() {
    capture.current++;
    if (timer.current) clearTimeout(timer.current);
    starting.current = false;
    converting.current = false;
    transcriptionRequest.current?.abort();
    if (recorder.current?.state === "recording") recorder.current.stop();
    recorder.current = null;
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
    setListening(false);
    setTranscribing(false);
  }
  const callbacks = useRef({ onTranscript, onState, onError, onPartial });
  callbacks.current = { onTranscript, onState, onError, onPartial };
  const speechQueue = useRef<{ text: string; expression: string }[]>([]);
  const speechBusy = useRef(false);
  function stopSpeaking() {
    speechQueue.current = [];
    speechBusy.current = false;
    generation.current++;
    request.current?.abort();
    audio.current?.pause();
    audio.current?.remove();
    audio.current = null;
    if (url.current) {
      URL.revokeObjectURL(url.current);
      url.current = "";
    }
    window.speechSynthesis?.cancel();
    setSpeaking(false);
    callbacks.current.onState("idle");
  }
  useEffect(() => {
    const w = window as VoiceWindow;
    setSupported(!!(w.SpeechRecognition || w.webkitSpeechRecognition));
    const configRequest = new AbortController();
    fetch("/api/ai", { signal: configRequest.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((config: unknown) => {
        const status = config as {
          voice?: boolean;
          voiceName?: string;
          transcription?: boolean;
        } | null;
        if (configRequest.signal.aborted) return;
        hosted.current =
          !!status?.transcription &&
          typeof MediaRecorder !== "undefined" &&
          !!navigator.mediaDevices?.getUserMedia;
        setSupported(
          hosted.current ||
            !!(w.SpeechRecognition || w.webkitSpeechRecognition),
        );
        if (status?.voice) {
          setEngine("elevenlabs");
          setVoiceName(status.voiceName || "Configured voice");
        }
      })
      .catch(() => {});
    return () => {
      configRequest.abort();
      cancelRecording();
      const active = rec.current;
      rec.current = null;
      generation.current++;
      active?.abort();
      request.current?.abort();
      audio.current?.pause();
      audio.current?.remove();
      window.speechSynthesis?.cancel();
      if (url.current) URL.revokeObjectURL(url.current);
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);
  async function recordMessage() {
    const id = ++capture.current;
    starting.current = true;
    stopSpeaking();
    setEnabled(true);
    setListening(true);
    callbacks.current.onState("listening");
    try {
      const media = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (id !== capture.current) {
        media.getTracks().forEach((track) => track.stop());
        return;
      }
      stream.current = media;
      const mime = ["audio/webm", "audio/ogg", "audio/mp4"].find((type) =>
        MediaRecorder.isTypeSupported(type),
      );
      const recording = mime
        ? new MediaRecorder(media, { mimeType: mime })
        : new MediaRecorder(media);
      recorder.current = recording;
      const chunks: Blob[] = [];
      recording.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data);
      };
      recording.onerror = () => {
        if (id !== capture.current) return;
        cancelRecording();
        callbacks.current.onState("idle");
        callbacks.current.onError(
          "Recording stopped unexpectedly. Please try again.",
        );
      };
      recording.onstop = async () => {
        media.getTracks().forEach((track) => track.stop());
        if (id !== capture.current) return;
        if (timer.current) clearTimeout(timer.current);
        recorder.current = null;
        stream.current = null;
        setListening(false);
        converting.current = true;
        setTranscribing(true);
        callbacks.current.onState("transcribing");
        const controller = new AbortController();
        transcriptionRequest.current = controller;
        try {
          const body = new FormData();
          const type = recording.mimeType || mime || "audio/webm";
          body.set(
            "file",
            new Blob(chunks, { type }),
            "message." +
              (type.includes("mp4")
                ? "mp4"
                : type.includes("ogg")
                  ? "ogg"
                  : "webm"),
          );
          const response = await fetch("/api/transcribe", {
            method: "POST",
            body,
            signal: controller.signal,
          });
          const result = (await response.json()) as {
            text?: string;
            error?: string;
          };
          if (id !== capture.current) return;
          if (!response.ok || !result.text)
            throw new Error(
              result.error || "No speech was detected. Please try again.",
            );
          converting.current = false;
          setTranscribing(false);
          callbacks.current.onState("idle");
          callbacks.current.onPartial(result.text);
          callbacks.current.onTranscript(result.text);
        } catch (error) {
          if (id !== capture.current) return;
          converting.current = false;
          setTranscribing(false);
          callbacks.current.onState("idle");
          callbacks.current.onError(
            error instanceof Error ? error.message : "Transcription failed.",
          );
        }
      };
      recording.start();
      starting.current = false;
      timer.current = setTimeout(() => {
        if (recording.state === "recording") recording.stop();
      }, 30000);
    } catch (error) {
      if (id !== capture.current) return;
      cancelRecording();
      callbacks.current.onState("idle");
      callbacks.current.onError(
        error instanceof DOMException && error.name === "NotAllowedError"
          ? "Allow microphone access in your browser to talk to Pip. You can also type."
          : "The microphone could not start. Check that it is connected and not in use by another app.",
      );
    }
  }
  function toggleMic() {
    if (converting.current) return;
    if (starting.current) {
      cancelRecording();
      callbacks.current.onState("idle");
      return;
    }
    if (recorder.current?.state === "recording") {
      recorder.current.stop();
      return;
    }
    if (hosted.current) {
      void recordMessage();
      return;
    }
    setEnabled(true);
    if (rec.current) {
      rec.current.stop();
      return;
    }
    const C =
      (window as VoiceWindow).SpeechRecognition ||
      (window as VoiceWindow).webkitSpeechRecognition;
    if (!C) {
      callbacks.current.onError(
        "This browser does not support speech recognition. You can still type to me.",
      );
      return;
    }
    stopSpeaking();
    const r = new C();
    rec.current = r;
    let final = "";
    let failed = false;
    r.lang = "en-US";
    r.continuous = false;
    r.interimResults = true;
    r.onresult = (e) => {
      if (rec.current !== r) return;
      let text = "";
      final = "";
      for (let i = 0; i < e.results.length; i++) {
        text += e.results[i][0].transcript;
        if (e.results[i].isFinal) final += e.results[i][0].transcript;
      }
      callbacks.current.onPartial(text);
      callbacks.current.onState("transcribing");
    };
    r.onerror = (e) => {
      if (rec.current !== r) return;
      failed = true;
      callbacks.current.onError(
        e.error === "not-allowed"
          ? "Microphone access was denied. Allow it in your browser, or type your message."
          : `Speech recognition stopped (${e.error}). Please try again or type.`,
      );
    };
    r.onend = () => {
      if (rec.current !== r) return;
      if (timer.current) clearTimeout(timer.current);
      rec.current = null;
      setListening(false);
      callbacks.current.onState("idle");
      if (final.trim() && !failed) callbacks.current.onTranscript(final.trim());
    };
    try {
      r.start();
      setListening(true);
      callbacks.current.onState("listening");
      timer.current = setTimeout(() => r.stop(), 20000);
    } catch {
      rec.current = null;
      setListening(false);
      callbacks.current.onError(
        "The microphone could not start. Please try again.",
      );
    }
  }
  function appendSpeech(text: string, expression = "understanding") {
    if (speechBusy.current) speechQueue.current.push({ text, expression });
    else void speak(text, expression, true);
  }
  async function speak(
    text: string,
    expression = "understanding",
    continuation = false,
  ) {
    try {
      await playSpeech(text, expression, continuation);
    } catch {
      speechQueue.current = [];
      speechBusy.current = false;
      setSpeaking(false);
      callbacks.current.onState("idle");
      logEvent("voice.failed", { reason: "browser_initialization" });
      callbacks.current.onError("Voice could not start. You can keep chatting by text.");
    }
  }
  async function playSpeech(
    text: string,
    expression: string,
    continuation: boolean,
  ) {
    if (!continuation) stopSpeaking();
    speechBusy.current = true;
    logEvent("voice.requested", {
      characters: text.length,
      engine,
      continuation,
    });
    const current = generation.current;
    const content = text.slice(0, 1500);
    const finish = () => {
      if (current === generation.current) {
        speechBusy.current = false;
        setSpeaking(false);
        callbacks.current.onState("idle");
        logEvent("voice.ended");
        const next = speechQueue.current.shift();
        if (next) void speak(next.text, next.expression, true);
      }
    };
    const begin = () => {
      if (current === generation.current) {
        logEvent("voice.playing");
        setSpeaking(true);
        callbacks.current.onState("speaking");
      }
    };
    if (engine === "browser") {
      if (!window.speechSynthesis) {
        speechQueue.current = [];
        finish();
        callbacks.current.onError(
          "Voice playback is unavailable in this browser.",
        );
        return;
      }
      const utterance = new SpeechSynthesisUtterance(content);
      utterance.rate = 0.96;
      utterance.onstart = begin;
      utterance.onend = finish;
      utterance.onerror = (event) => {
        speechQueue.current = [];
        finish();
        if (
          current === generation.current &&
          event.error !== "canceled" &&
          event.error !== "interrupted"
        )
          callbacks.current.onError(
            "Browser voice could not play. Try another voice engine or keep chatting by text.",
          );
      };
      window.speechSynthesis.speak(utterance);
      return;
    }
    try {
      const controller = new AbortController();
      request.current = controller;
      const res = await fetch("/api/voice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: content, expression }),
        signal: controller.signal,
      });
      if (!res.ok) {
        const data = (await res.json()) as { error: string };
        throw new Error(data.error);
      }
      const blob = await res.blob();
      if (current !== generation.current) return;
      url.current = URL.createObjectURL(blob);
      const player = new Audio(url.current);
      player.hidden = true;
      player.setAttribute("aria-label", "Pip voice reply");
      player.dataset.playbackState = "loading";
      document.body.appendChild(player);
      audio.current = player;
      player.onplaying = () => {
        player.dataset.playbackState = "playing";
        begin();
      };
      player.onended = () => {
        if (current !== generation.current) return;
        player.remove();
        audio.current = null;
        URL.revokeObjectURL(url.current);
        url.current = "";
        finish();
      };
      player.onerror = () => {
        if (current !== generation.current) return;
        speechQueue.current = [];
        finish();
        player.remove();
        audio.current = null;
        if (url.current) URL.revokeObjectURL(url.current);
        url.current = "";
        callbacks.current.onError("Voice audio could not play.");
      };
      await player.play();
    } catch (e) {
      if (current === generation.current) {
        speechQueue.current = [];
        logEvent("voice.failed", { reason: "generation_or_playback" });
        finish();
        callbacks.current.onError(
          e instanceof Error ? e.message : "Voice could not connect.",
        );
      }
    }
  }
  function endSession() {
    cancelRecording();
    const active = rec.current;
    rec.current = null;
    active?.abort();
    if (timer.current) clearTimeout(timer.current);
    setListening(false);
    stopSpeaking();
    setEnabled(false);
  }
  return {
    supported,
    transcribing,
    listening,
    speaking,
    enabled,
    setEnabled,
    engine,
    voiceName,
    setEngine,
    toggleMic,
    speak,
    appendSpeech,
    stopSpeaking,
    endSession,
  };
}
