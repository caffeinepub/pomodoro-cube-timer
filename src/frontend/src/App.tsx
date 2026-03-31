import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Check,
  Settings as SettingsIcon,
  Share2,
  SkipForward,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────
type Phase = "study" | "break";
type TimerState = "idle" | "running" | "paused" | "done";

interface PomodoroSettings {
  studyMins: number;
  breakMins: number;
  totalSessions: number;
}

interface ColorSettings {
  studyColor: string;
  breakColor: string;
  bgColor: string;
  textColor: string;
  btnColor: string;
}

const STORAGE_KEY = "pomodoro-settings";
const COLOR_STORAGE_KEY = "pomodoro-colors";

const DEFAULT_SETTINGS: PomodoroSettings = {
  studyMins: 90,
  breakMins: 10,
  totalSessions: 7,
};

const DEFAULT_COLORS: ColorSettings = {
  studyColor: "#1c3d2a",
  breakColor: "#1c2e3d",
  bgColor: "#0a1a0f",
  textColor: "#ffffff",
  btnColor: "#22c55e",
};

// ─── Web Audio Alarm ──────────────────────────────────────────────────────────
function playAlarm(type: "study" | "break") {
  try {
    const ctx = new (
      window.AudioContext || (window as any).webkitAudioContext
    )();
    const freqs = type === "study" ? [660, 880, 1100] : [440, 550, 660];
    freqs.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, ctx.currentTime + i * 0.25);
      gain.gain.linearRampToValueAtTime(
        0.35,
        ctx.currentTime + i * 0.25 + 0.05,
      );
      gain.gain.exponentialRampToValueAtTime(
        0.001,
        ctx.currentTime + i * 0.25 + 0.4,
      );
      osc.start(ctx.currentTime + i * 0.25);
      osc.stop(ctx.currentTime + i * 0.25 + 0.45);
    });
    setTimeout(() => ctx.close(), 2000);
  } catch (_) {
    // silently fail
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function loadSettings(): PomodoroSettings {
  const params = new URLSearchParams(window.location.search);
  const study = Number.parseInt(params.get("study") || "0");
  const brk = Number.parseInt(params.get("break") || "0");
  const sessions = Number.parseInt(params.get("sessions") || "0");
  if (study > 0 || brk > 0 || sessions > 0) {
    return {
      studyMins: study > 0 ? study : DEFAULT_SETTINGS.studyMins,
      breakMins: brk > 0 ? brk : DEFAULT_SETTINGS.breakMins,
      totalSessions: sessions > 0 ? sessions : DEFAULT_SETTINGS.totalSessions,
    };
  }
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return { ...DEFAULT_SETTINGS, ...JSON.parse(saved) };
  } catch (_) {}
  return DEFAULT_SETTINGS;
}

function loadColors(): ColorSettings {
  const params = new URLSearchParams(window.location.search);
  const urlStudy = params.get("studyColor");
  const urlBreak = params.get("breakColor");
  const urlBg = params.get("bgColor");
  const urlText = params.get("textColor");
  const urlBtn = params.get("btnColor");

  // If any color param in URL, use URL params (with defaults for missing)
  if (urlStudy || urlBreak || urlBg || urlText || urlBtn) {
    return {
      studyColor: urlStudy || DEFAULT_COLORS.studyColor,
      breakColor: urlBreak || DEFAULT_COLORS.breakColor,
      bgColor: urlBg || DEFAULT_COLORS.bgColor,
      textColor: urlText || DEFAULT_COLORS.textColor,
      btnColor: urlBtn || DEFAULT_COLORS.btnColor,
    };
  }

  try {
    const saved = localStorage.getItem(COLOR_STORAGE_KEY);
    if (saved) return { ...DEFAULT_COLORS, ...JSON.parse(saved) };
  } catch (_) {}
  return DEFAULT_COLORS;
}

function formatTime(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function isOBSMode(): boolean {
  return new URLSearchParams(window.location.search).get("obs") === "1";
}

function updateURLColors(c: ColorSettings) {
  const url = new URL(window.location.href);
  url.searchParams.set("studyColor", c.studyColor);
  url.searchParams.set("breakColor", c.breakColor);
  url.searchParams.set("bgColor", c.bgColor);
  url.searchParams.set("textColor", c.textColor);
  url.searchParams.set("btnColor", c.btnColor);
  window.history.replaceState(null, "", url.toString());
}

// ─── App ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [settings, setSettings] = useState<PomodoroSettings>(loadSettings);
  const [colors, setColors] = useState<ColorSettings>(loadColors);
  const [draftColors, setDraftColors] = useState<ColorSettings>(colors);
  const [phase, setPhase] = useState<Phase>("study");
  const [timerState, setTimerState] = useState<TimerState>("idle");
  const [timeLeft, setTimeLeft] = useState(() => loadSettings().studyMins * 60);
  const [session, setSession] = useState(1);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [draft, setDraft] = useState<PomodoroSettings>(settings);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const phaseRef = useRef(phase);
  const sessionRef = useRef(session);
  const settingsRef = useRef(settings);

  phaseRef.current = phase;
  sessionRef.current = session;
  settingsRef.current = settings;

  const obsMode = isOBSMode();

  useEffect(() => {
    if (obsMode) {
      document.documentElement.classList.add("obs-mode");
      document.body.style.background = "transparent";
    }
    return () => document.documentElement.classList.remove("obs-mode");
  }, [obsMode]);

  const stopInterval = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const advancePhase = useCallback(() => {
    stopInterval();
    const currentPhase = phaseRef.current;
    const currentSession = sessionRef.current;
    const s = settingsRef.current;
    playAlarm(currentPhase);
    if (currentPhase === "study") {
      setPhase("break");
      setTimeLeft(s.breakMins * 60);
      setTimeout(() => setTimerState("running"), 100);
    } else {
      const nextSession = currentSession + 1;
      if (nextSession > s.totalSessions) {
        setTimerState("done");
        setPhase("study");
        setSession(s.totalSessions);
        setTimeLeft(0);
      } else {
        setSession(nextSession);
        setPhase("study");
        setTimeLeft(s.studyMins * 60);
        setTimeout(() => setTimerState("running"), 100);
      }
    }
  }, [stopInterval]);

  useEffect(() => {
    if (timerState === "running") {
      intervalRef.current = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            advancePhase();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      stopInterval();
    }
    return stopInterval;
  }, [timerState, advancePhase, stopInterval]);

  // Spacebar shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.code === "Space" && e.target === document.body) {
        e.preventDefault();
        setTimerState((s) => {
          if (s === "done") return s;
          return s === "running" ? "paused" : "running";
        });
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const handleStartPause = () => {
    if (timerState === "done") return;
    setTimerState((s) => (s === "running" ? "paused" : "running"));
  };

  const handleReset = () => {
    stopInterval();
    setTimerState("idle");
    setTimeLeft(
      phase === "study" ? settings.studyMins * 60 : settings.breakMins * 60,
    );
  };

  const handleSkip = () => {
    stopInterval();
    const s = settingsRef.current;
    const currentPhase = phaseRef.current;
    const currentSession = sessionRef.current;
    if (currentPhase === "study") {
      setPhase("break");
      setTimeLeft(s.breakMins * 60);
      setTimerState("idle");
    } else {
      const nextSession = currentSession + 1;
      if (nextSession > s.totalSessions) {
        setTimerState("done");
        setPhase("study");
        setSession(s.totalSessions);
        setTimeLeft(0);
      } else {
        setSession(nextSession);
        setPhase("study");
        setTimeLeft(s.studyMins * 60);
        setTimerState("idle");
      }
    }
  };

  const handleSaveSettings = () => {
    const validated: PomodoroSettings = {
      studyMins: Math.max(1, Math.min(999, draft.studyMins)),
      breakMins: Math.max(1, Math.min(999, draft.breakMins)),
      totalSessions: Math.max(1, Math.min(99, draft.totalSessions)),
    };
    setSettings(validated);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(validated));

    // Save colors
    const savedColors = { ...draftColors };
    setColors(savedColors);
    localStorage.setItem(COLOR_STORAGE_KEY, JSON.stringify(savedColors));
    updateURLColors(savedColors);

    stopInterval();
    setTimerState("idle");
    setSession(1);
    setPhase("study");
    setTimeLeft(validated.studyMins * 60);
    setSettingsOpen(false);
  };

  const handleShare = async () => {
    const url = new URL(window.location.href);
    url.searchParams.set("study", String(settings.studyMins));
    url.searchParams.set("break", String(settings.breakMins));
    url.searchParams.set("sessions", String(settings.totalSessions));
    url.searchParams.set("studyColor", colors.studyColor);
    url.searchParams.set("breakColor", colors.breakColor);
    url.searchParams.set("bgColor", colors.bgColor);
    url.searchParams.set("textColor", colors.textColor);
    url.searchParams.set("btnColor", colors.btnColor);
    try {
      await navigator.clipboard.writeText(url.toString());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (_) {
      prompt("Copy this link:", url.toString());
    }
  };

  const cardColor = phase === "study" ? colors.studyColor : colors.breakColor;
  const isDone = timerState === "done";

  return (
    <div
      data-ocid="app.page"
      className="pomo-page min-h-screen flex flex-col items-center justify-center p-4"
      style={{
        backgroundColor: obsMode ? "transparent" : colors.bgColor,
        transition: "background-color 0.6s ease",
      }}
    >
      {/* Main Card */}
      <motion.div
        layout
        className="pomo-card w-full max-w-md rounded-3xl flex flex-col items-center px-8 py-10 gap-6 relative"
        style={{
          backgroundColor: cardColor,
          transition: "background-color 0.6s ease",
        }}
      >
        {/* Top-right controls */}
        <div className="absolute top-5 right-5 flex gap-2">
          <button
            type="button"
            data-ocid="share.button"
            onClick={handleShare}
            className="p-2 rounded-xl transition-colors hover:bg-white/10"
            style={{ color: colors.textColor, opacity: 0.6 }}
            title="Share timer link"
          >
            {copied ? (
              <Check size={18} className="text-green-400" />
            ) : (
              <Share2 size={18} />
            )}
          </button>

          <Dialog
            open={settingsOpen}
            onOpenChange={(open) => {
              setSettingsOpen(open);
              if (open) {
                setDraft(settings);
                setDraftColors(colors);
              }
            }}
          >
            <DialogTrigger asChild>
              <button
                type="button"
                data-ocid="settings.open_modal_button"
                className="p-2 rounded-xl transition-colors hover:bg-white/10"
                style={{ color: colors.textColor, opacity: 0.6 }}
                title="Settings"
              >
                <SettingsIcon size={18} />
              </button>
            </DialogTrigger>
            <DialogContent
              data-ocid="settings.dialog"
              className="border-white/10 max-w-sm"
              style={{ backgroundColor: cardColor, color: "white" }}
            >
              <DialogHeader>
                <DialogTitle className="text-white text-xl font-bold tracking-wide">
                  SETTINGS
                </DialogTitle>
              </DialogHeader>
              <div className="flex flex-col gap-5 mt-2">
                <div className="flex flex-col gap-1.5">
                  <Label className="text-white/70 text-xs tracking-widest uppercase">
                    Study Time (minutes)
                  </Label>
                  <Input
                    data-ocid="settings.input"
                    type="number"
                    min={1}
                    max={999}
                    value={draft.studyMins}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        studyMins: Number.parseInt(e.target.value) || 1,
                      }))
                    }
                    className="bg-white/10 border-white/20 text-white text-lg font-semibold"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label className="text-white/70 text-xs tracking-widest uppercase">
                    Break Time (minutes)
                  </Label>
                  <Input
                    data-ocid="settings.textarea"
                    type="number"
                    min={1}
                    max={999}
                    value={draft.breakMins}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        breakMins: Number.parseInt(e.target.value) || 1,
                      }))
                    }
                    className="bg-white/10 border-white/20 text-white text-lg font-semibold"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label className="text-white/70 text-xs tracking-widest uppercase">
                    Total Sessions
                  </Label>
                  <Input
                    type="number"
                    min={1}
                    max={99}
                    value={draft.totalSessions}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        totalSessions: Number.parseInt(e.target.value) || 1,
                      }))
                    }
                    className="bg-white/10 border-white/20 text-white text-lg font-semibold"
                  />
                </div>

                {/* Color Settings */}
                <div className="h-px bg-white/10 my-1" />
                <p className="text-white/50 text-xs tracking-widest uppercase">
                  Colors
                </p>
                {(
                  [
                    { label: "Background", key: "bgColor" },
                    { label: "Study Mode", key: "studyColor" },
                    { label: "Break Mode", key: "breakColor" },
                    { label: "Text", key: "textColor" },
                    { label: "Button", key: "btnColor" },
                  ] as { label: string; key: keyof ColorSettings }[]
                ).map(({ label, key }) => (
                  <div key={key} className="flex items-center justify-between">
                    <Label className="text-white/70 text-xs tracking-widest uppercase">
                      {label}
                    </Label>
                    <input
                      type="color"
                      value={draftColors[key]}
                      onChange={(e) => {
                        const val = e.target.value;
                        setDraftColors((d) => ({ ...d, [key]: val }));
                        setColors((d) => ({ ...d, [key]: val }));
                      }}
                      className="w-10 h-10 rounded-lg cursor-pointer border-2 border-white/20 bg-transparent p-0.5"
                    />
                  </div>
                ))}

                <div className="flex gap-3 pt-1">
                  <Button
                    data-ocid="settings.save_button"
                    onClick={handleSaveSettings}
                    className="flex-1 font-bold tracking-wider text-sm h-11"
                    style={{
                      backgroundColor: colors.btnColor,
                      color: "#0a1a0f",
                    }}
                  >
                    SAVE
                  </Button>
                  <Button
                    data-ocid="settings.cancel_button"
                    variant="ghost"
                    onClick={() => setSettingsOpen(false)}
                    className="flex-1 font-bold tracking-wider text-sm h-11 text-white/70 hover:text-white hover:bg-white/10"
                  >
                    CANCEL
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Mode Label */}
        <AnimatePresence mode="wait">
          <motion.div
            key={isDone ? "done-label" : phase}
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            transition={{ duration: 0.3 }}
            data-ocid="timer.panel"
            className="text-center mt-4"
          >
            <span
              className="text-5xl font-extrabold tracking-[0.18em] uppercase"
              style={{ color: colors.btnColor, transition: "color 0.3s ease" }}
            >
              {isDone ? "ALL DONE!" : phase === "study" ? "STUDY" : "BREAK"}
            </span>
          </motion.div>
        </AnimatePresence>

        {/* Timer Display */}
        <motion.div
          key={`${phase}-timer`}
          initial={{ scale: 0.95, opacity: 0.6 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.25 }}
          className={`timer-display ${timerState === "running" ? "timer-running" : ""}`}
          style={{
            fontSize: "clamp(5rem, 20vw, 8rem)",
            color: colors.textColor,
            transition: "color 0.3s ease",
          }}
        >
          {formatTime(timeLeft)}
        </motion.div>

        {/* Session Counter */}
        <div data-ocid="timer.card" className="text-center">
          <span
            className="text-3xl font-extrabold tracking-[0.12em] uppercase"
            style={{
              color: colors.textColor,
              opacity: 0.9,
              transition: "color 0.3s ease",
            }}
          >
            SESSION {session}/{settings.totalSessions}
          </span>
        </div>

        {/* Divider */}
        <div
          className="w-full h-px"
          style={{ backgroundColor: "rgba(255,255,255,0.08)" }}
        />

        {/* Control Buttons */}
        <div className="flex gap-3 w-full">
          <button
            type="button"
            data-ocid="timer.primary_button"
            onClick={handleStartPause}
            disabled={isDone}
            className="flex-1 h-14 rounded-2xl font-extrabold text-base tracking-widest uppercase transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed active:scale-95"
            style={{
              backgroundColor:
                timerState === "running"
                  ? "rgba(255,255,255,0.12)"
                  : colors.btnColor,
              color: timerState === "running" ? "white" : "#0a1a0f",
              border:
                timerState === "running"
                  ? "2px solid rgba(255,255,255,0.2)"
                  : "none",
              transition: "background-color 0.3s ease, color 0.3s ease",
            }}
          >
            {timerState === "running" ? "PAUSE" : "START"}
          </button>

          <button
            type="button"
            data-ocid="timer.secondary_button"
            onClick={handleReset}
            className="h-14 px-5 rounded-2xl font-bold text-sm tracking-widest uppercase transition-all duration-200 active:scale-95"
            style={{
              backgroundColor: "rgba(255,255,255,0.08)",
              color: "rgba(255,255,255,0.75)",
              border: "2px solid rgba(255,255,255,0.12)",
            }}
          >
            RESET
          </button>

          <button
            type="button"
            data-ocid="timer.toggle"
            onClick={handleSkip}
            disabled={isDone}
            title="Skip current phase"
            className="h-14 px-4 rounded-2xl transition-all duration-200 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
            style={{
              backgroundColor: "rgba(255,255,255,0.06)",
              color: "rgba(255,255,255,0.5)",
              border: "2px solid rgba(255,255,255,0.08)",
            }}
          >
            <SkipForward size={18} />
          </button>
        </div>

        {/* Done state restart */}
        {isDone && (
          <button
            type="button"
            data-ocid="timer.restart_button"
            onClick={() => {
              setSession(1);
              setPhase("study");
              setTimerState("idle");
              setTimeLeft(settings.studyMins * 60);
            }}
            className="w-full h-12 rounded-2xl font-bold tracking-widest uppercase text-sm transition-all active:scale-95"
            style={{ backgroundColor: colors.btnColor, color: "#0a1a0f" }}
          >
            START OVER
          </button>
        )}

        <p
          className="text-xs tracking-widest uppercase"
          style={{ color: "rgba(255,255,255,0.25)" }}
        >
          SPACE to start / pause
        </p>
      </motion.div>

      {!obsMode && (
        <p className="mt-8 text-xs" style={{ color: "rgba(255,255,255,0.2)" }}>
          © {new Date().getFullYear()}. Built with love using{" "}
          <a
            href={`https://caffeine.ai?utm_source=caffeine-footer&utm_medium=referral&utm_content=${encodeURIComponent(window.location.hostname)}`}
            className="underline hover:opacity-70"
            target="_blank"
            rel="noopener noreferrer"
          >
            caffeine.ai
          </a>
        </p>
      )}
    </div>
  );
}
