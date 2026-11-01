import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Editor, { type BeforeMount, type OnMount } from "@monaco-editor/react";
import {
  BadgeCheck,
  Braces,
  ChevronLeft,
  ChevronRight,
  CirclePause,
  CirclePlay,
  Clapperboard,
  Code2,
  Download,
  ExternalLink,
  FileCode2,
  FileJson2,
  Gauge,
  GitBranch,
  Grip,
  Headphones,
  Import,
  Layers3,
  LoaderCircle,
  Mic,
  Pause,
  Play,
  Plus,
  Redo2,
  Save,
  SkipBack,
  Sparkles,
  Square,
  TimerReset,
  Upload,
  Volume2,
  WandSparkles,
} from "lucide-react";
import { demoSession } from "./core/demo";
import { parseImportedSession } from "./core/import";
import { SessionRecorder } from "./core/recorder";
import {
  applyEvent,
  cloneWorkspace,
  createId,
  eventIndexAt,
  FILE_IDS,
  fileDefinitions,
  stateAt,
  type EditorSelection,
  type FileId,
  type LearnerBranch,
  type PlaybackStatus,
  type ScrimEvent,
  type ScrimSession,
  type TextChange,
  type WorkspaceState,
} from "./core/session";
import { PreviewFrame } from "./preview/PreviewFrame";
import {
  getAudio,
  listBranches,
  saveAudio,
  saveBranch,
  saveSession,
} from "./storage/db";
import "./styles.css";

type RecordingStatus = "off" | "recording" | "paused" | "finishing";

const speeds = [0.5, 1, 1.5, 2] as const;

const PdfAnnotationDemo = lazy(async () => {
  const module = await import("./pdf/PdfAnnotationDemo");
  return { default: module.PdfAnnotationDemo };
});

const configureLiquidEditor: BeforeMount = (monaco) => {
  monaco.editor.defineTheme("scrim-liquid", {
    base: "vs-dark",
    inherit: true,
    rules: [
      { token: "comment", foreground: "8D8D93", fontStyle: "italic" },
      { token: "keyword", foreground: "FFD44F" },
      { token: "string", foreground: "FFB0BD" },
      { token: "number", foreground: "FF9DA5" },
      { token: "tag", foreground: "FF6F83" },
      { token: "delimiter.html", foreground: "D6D6D6" },
    ],
    colors: {
      "editor.background": "#101010",
      "editor.foreground": "#F1F1EF",
      "editor.lineHighlightBackground": "#252525",
      "editorLineNumber.foreground": "#6F6F75",
      "editorLineNumber.activeForeground": "#F4F4F2",
      "editorCursor.foreground": "#FFD44F",
      "editor.selectionBackground": "#57303A",
      "editor.inactiveSelectionBackground": "#352328",
      "editorIndentGuide.background1": "#2A2A2A",
      "editorIndentGuide.activeBackground1": "#5E5E5E",
      "editorWidget.background": "#1B1B1B",
      "editorWidget.border": "#6D6D70",
      "editorGutter.background": "#101010",
      "scrollbarSlider.background": "#55555A80",
      "scrollbarSlider.hoverBackground": "#77777C99",
      "scrollbarSlider.activeBackground": "#FFACB899",
    },
  });
};

function formatTime(milliseconds: number): string {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

type TimelineVersion = {
  id: string;
  at: number;
  kind: "root" | "recording" | "branch";
  label: string;
  detail: string;
  branchId?: string;
  lane?: number;
};

/** Every content edit becomes a visible version. Branch edits stack at their fork,
 * just as several Git commits share the same point in the source video. */
function buildTimelineVersions(
  session: ScrimSession,
  branches: LearnerBranch[],
  eventSource: ScrimEvent[] = session.events,
): TimelineVersion[] {
  const versions: TimelineVersion[] = [
    {
      id: "main-root",
      at: 0,
      kind: "root",
      label: "main",
      detail: "État initial de la leçon",
    },
  ];

  eventSource
    .filter((event): event is Extract<ScrimEvent, { kind: "edit" }> => event.kind === "edit")
    .forEach((event, index) => {
      versions.push({
        id: `recording-v${index + 1}`,
        at: event.at,
        kind: "recording",
        label: `v${index + 1}`,
        detail: `Version ${index + 1} · ${fileDefinitions[event.fileId].label} modifié · ${formatTime(event.at)}`,
      });
    });

  branches.forEach((branch, branchIndex) => {
    const edits = branch.operations.filter(
      (event): event is Extract<ScrimEvent, { kind: "edit" }> => event.kind === "edit",
    );

    if (edits.length === 0) {
      versions.push({
        id: `branch-${branch.id}`,
        at: branch.forkAt,
        kind: "branch",
        label: `essai ${branchIndex + 1}`,
        detail: `${branch.label} · branche créée à ${formatTime(branch.forkAt)}`,
        branchId: branch.id,
        lane: branchIndex % 3,
      });
      return;
    }

    edits.forEach((event, revisionIndex) => {
      versions.push({
        id: `branch-${branch.id}-v${revisionIndex + 1}`,
        at: branch.forkAt,
        kind: "branch",
        label: `b${branchIndex + 1}.${revisionIndex + 1}`,
        detail: `Version de branche ${revisionIndex + 1} · ${fileDefinitions[event.fileId].label} modifié · ${branch.label}`,
        branchId: branch.id,
        lane: (branchIndex + revisionIndex) % 3,
      });
    });
  });

  return versions.sort((left, right) => left.at - right.at || left.kind.localeCompare(right.kind));
}

function selectionFromMonaco(selection: {
  startLineNumber: number;
  startColumn: number;
  endLineNumber: number;
  endColumn: number;
}): EditorSelection {
  return {
    startLineNumber: selection.startLineNumber,
    startColumn: selection.startColumn,
    endLineNumber: selection.endLineNumber,
    endColumn: selection.endColumn,
  };
}

function downloadJson(session: ScrimSession): void {
  const exportable = { ...session, audio: session.audio ? { ...session.audio, blobId: "local-audio-not-exported" } : undefined };
  const blob = new Blob([JSON.stringify(exportable, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${session.title.toLowerCase().replace(/[^a-z0-9]+/gi, "-") || "scrim"}.scrim.json`;
  link.click();
  URL.revokeObjectURL(link.href);
}

export default function App() {
  const [studioMode, setStudioMode] = useState<"code" | "pdf">("code");
  const [session, setSession] = useState<ScrimSession>(demoSession);
  const [workspace, setWorkspace] = useState<WorkspaceState>(() => cloneWorkspace(demoSession.initialWorkspace));
  const [playbackStatus, setPlaybackStatus] = useState<PlaybackStatus>("idle");
  const [recordingStatus, setRecordingStatus] = useState<RecordingStatus>("off");
  const [recordingElapsed, setRecordingElapsed] = useState(0);
  const [recordingDraftEvents, setRecordingDraftEvents] = useState<ScrimEvent[]>([]);
  const [playbackTime, setPlaybackTime] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState<(typeof speeds)[number]>(1);
  const [lessonTitle, setLessonTitle] = useState(demoSession.title);
  const [notice, setNotice] = useState("Prêt à rejouer chaque action, pas chaque pixel.");
  const [branches, setBranches] = useState<LearnerBranch[]>([]);
  const [currentBranchId, setCurrentBranchId] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [compilerMenuOpen, setCompilerMenuOpen] = useState(false);
  const [restoreNonce, setRestoreNonce] = useState(0);

  const editorRef = useRef<Parameters<OnMount>[0] | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const recorderRef = useRef<SessionRecorder | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const sessionRef = useRef(session);
  const workspaceRef = useRef(workspace);
  const playbackWorkspaceRef = useRef(workspace);
  const playbackTimeRef = useRef(playbackTime);
  const nextEventIndexRef = useRef(0);
  const playbackStatusRef = useRef(playbackStatus);
  const recordingStatusRef = useRef(recordingStatus);
  const currentBranchRef = useRef<string | null>(currentBranchId);
  const branchesRef = useRef(branches);
  const applyingRef = useRef(false);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);
  useEffect(() => {
    workspaceRef.current = workspace;
  }, [workspace]);
  useEffect(() => {
    playbackTimeRef.current = playbackTime;
  }, [playbackTime]);
  useEffect(() => {
    playbackStatusRef.current = playbackStatus;
  }, [playbackStatus]);
  useEffect(() => {
    recordingStatusRef.current = recordingStatus;
  }, [recordingStatus]);
  useEffect(() => {
    currentBranchRef.current = currentBranchId;
  }, [currentBranchId]);
  useEffect(() => {
    branchesRef.current = branches;
  }, [branches]);

  const commitWorkspace = useCallback((nextWorkspace: WorkspaceState) => {
    workspaceRef.current = nextWorkspace;
    setWorkspace(nextWorkspace);
  }, []);

  const restoreOriginalAt = useCallback(
    (time: number) => {
      const activeSession = sessionRef.current;
      const safeTime = Math.max(0, Math.min(time, activeSession.duration));
      applyingRef.current = true;
      const nextWorkspace = stateAt(activeSession, safeTime);
      playbackWorkspaceRef.current = nextWorkspace;
      nextEventIndexRef.current = eventIndexAt(activeSession.events, safeTime);
      playbackTimeRef.current = safeTime;
      commitWorkspace(nextWorkspace);
      setPlaybackTime(safeTime);
      setRestoreNonce((value) => value + 1);
      window.requestAnimationFrame(() => {
        applyingRef.current = false;
      });
    },
    [commitWorkspace],
  );

  const pausePlayback = useCallback(() => {
    setPlaybackStatus("paused");
    audioRef.current?.pause();
  }, []);

  const appendBranchEvent = useCallback((event: ScrimEvent) => {
    const activeSession = sessionRef.current;
    let branchId = currentBranchRef.current;
    let nextBranches = branchesRef.current;

    if (!branchId) {
      if (event.kind !== "edit") return;
      const forkTime = playbackTimeRef.current;
      const branch: LearnerBranch = {
        id: createId("branch"),
        sessionId: activeSession.id,
        createdAt: new Date().toISOString(),
        forkAt: forkTime,
        baseSnapshot: {
          at: forkTime,
          eventIndex: eventIndexAt(activeSession.events, forkTime),
          workspace: stateAt(activeSession, forkTime),
        },
        operations: [event],
        label: `Mon essai · ${new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`,
      };
      branchId = branch.id;
      nextBranches = [...nextBranches, branch];
      currentBranchRef.current = branchId;
      setCurrentBranchId(branchId);
      setNotice("Nouvelle branche créée : l’original reste intact.");
      void saveBranch(branch);
    } else {
      nextBranches = nextBranches.map((branch) =>
        branch.id === branchId ? { ...branch, operations: [...branch.operations, event] } : branch,
      );
      const changed = nextBranches.find((branch) => branch.id === branchId);
      if (changed) void saveBranch(changed);
    }

    branchesRef.current = nextBranches;
    setBranches(nextBranches);
  }, []);

  const finishRecording = useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder) return;

    const recordedSession = recorder.finish(workspaceRef.current);
    const mediaRecorder = mediaRecorderRef.current;
    const mimeType = mediaRecorder?.mimeType || "audio/webm";
    const audio = audioChunksRef.current.length
      ? new Blob(audioChunksRef.current, { type: mimeType })
      : null;

    if (audio && audio.size > 0) {
      const blobId = createId("audio");
      recordedSession.audio = { blobId, mimeType, duration: recordedSession.duration };
      void saveAudio(blobId, audio);
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      setAudioUrl(URL.createObjectURL(audio));
    }

    recorderRef.current = null;
    mediaRecorderRef.current = null;
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
    audioChunksRef.current = [];
    sessionRef.current = recordedSession;
    setSession(recordedSession);
    setLessonTitle(recordedSession.title);
    void saveSession(recordedSession);
    setRecordingStatus("off");
    setRecordingDraftEvents([]);
    setRecordingElapsed(recordedSession.duration);
    setPlaybackStatus("paused");
    setCurrentBranchId(null);
    currentBranchRef.current = null;
    setBranches([]);
    branchesRef.current = [];
    restoreOriginalAt(recordedSession.duration);
    setNotice(audio ? "Scrim enregistré avec sa piste audio locale." : "Scrim enregistré en mode code-only.");
  }, [audioUrl, restoreOriginalAt]);

  const startRecording = useCallback(async () => {
    if (recordingStatusRef.current !== "off") return;
    pausePlayback();
    setCurrentBranchId(null);
    currentBranchRef.current = null;
    const recorder = new SessionRecorder(
      workspaceRef.current,
      lessonTitle || "Leçon sans titre",
    );
    recorder.start();
    recorderRef.current = recorder;
    audioChunksRef.current = [];
    setRecordingDraftEvents([]);
    setRecordingElapsed(0);
    setRecordingStatus("recording");
    setNotice("Enregistrement en cours : éditez comme d’habitude.");

    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setNotice("Enregistrement code-only : l’audio n’est pas disponible dans ce navigateur.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (recorderRef.current !== recorder) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      mediaStreamRef.current = stream;
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };
      mediaRecorder.onstop = () => finishRecording();
      mediaRecorder.start(1_000);
    } catch {
      setNotice("Micro non autorisé : la session sera tout de même enregistrée sans audio.");
    }
  }, [finishRecording, lessonTitle, pausePlayback]);

  const toggleRecordingPause = useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder || recordingStatusRef.current === "finishing") return;
    const mediaRecorder = mediaRecorderRef.current;

    if (recordingStatusRef.current === "recording") {
      recorder.pause();
      if (mediaRecorder?.state === "recording") mediaRecorder.pause();
      setRecordingStatus("paused");
      setNotice("Enregistrement en pause. L’horloge et l’audio sont gelés ensemble.");
    } else if (recordingStatusRef.current === "paused") {
      recorder.resume();
      if (mediaRecorder?.state === "paused") mediaRecorder.resume();
      setRecordingStatus("recording");
      setNotice("Enregistrement repris.");
    }
  }, []);

  const requestFinishRecording = useCallback(() => {
    if (recordingStatusRef.current === "off" || recordingStatusRef.current === "finishing") return;
    setRecordingStatus("finishing");
    const mediaRecorder = mediaRecorderRef.current;
    if (mediaRecorder && mediaRecorder.state !== "inactive") {
      mediaRecorder.stop();
    } else {
      finishRecording();
    }
  }, [finishRecording]);

  useEffect(() => {
    if (recordingStatus !== "recording" && recordingStatus !== "paused") return;
    const interval = window.setInterval(() => {
      setRecordingElapsed(recorderRef.current?.elapsed ?? 0);
    }, 120);
    return () => window.clearInterval(interval);
  }, [recordingStatus]);

  useEffect(() => {
    let animationFrame = 0;
    if (playbackStatus !== "playing") return undefined;

    const sessionAtStart = sessionRef.current;
    const startedAt = performance.now() - playbackTimeRef.current / playbackSpeed;
    const tick = (now: number) => {
      const audio = audioRef.current;
      const fromAudio = audio && !audio.paused && Number.isFinite(audio.currentTime) && audio.currentTime > 0
        ? audio.currentTime * 1_000
        : null;
      const nextTime = Math.min(
        sessionAtStart.duration,
        fromAudio ?? (now - startedAt) * playbackSpeed,
      );
      let nextWorkspace = playbackWorkspaceRef.current;
      let changed = false;

      while (
        nextEventIndexRef.current < sessionAtStart.events.length &&
        sessionAtStart.events[nextEventIndexRef.current].at <= nextTime
      ) {
        nextWorkspace = applyEvent(nextWorkspace, sessionAtStart.events[nextEventIndexRef.current]);
        nextEventIndexRef.current += 1;
        changed = true;
      }

      if (changed) {
        playbackWorkspaceRef.current = nextWorkspace;
        commitWorkspace(nextWorkspace);
        setRestoreNonce((value) => value + 1);
      }
      playbackTimeRef.current = nextTime;
      setPlaybackTime(nextTime);

      if (nextTime >= sessionAtStart.duration) {
        setPlaybackStatus("paused");
        audio?.pause();
        setNotice("Fin de la leçon. Mettez-la en pause, puis tentez votre version.");
        return;
      }
      animationFrame = window.requestAnimationFrame(tick);
    };

    animationFrame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(animationFrame);
  }, [commitWorkspace, playbackSpeed, playbackStatus]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const selection = workspace.selections[workspace.activeFileId];
    applyingRef.current = true;
    window.requestAnimationFrame(() => {
      editor.setSelection(selection);
      applyingRef.current = false;
    });
  }, [restoreNonce, workspace.activeFileId]);

  useEffect(() => {
    void saveSession(session);
    void listBranches(session.id).then((savedBranches) => {
      branchesRef.current = savedBranches;
      setBranches(savedBranches);
    });
    if (session.audio?.blobId) {
      void getAudio(session.audio.blobId).then((audio) => {
        if (!audio) return;
        if (audioUrl) URL.revokeObjectURL(audioUrl);
        setAudioUrl(URL.createObjectURL(audio));
      });
    }
  // Loading is intentional per session, rather than for every title/text update.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.id]);

  useEffect(() => () => {
    if (audioUrl) URL.revokeObjectURL(audioUrl);
  }, [audioUrl]);

  const handleEditorMount: OnMount = (editor) => {
    editorRef.current = editor;

    // The editor is the interaction surface: clicking it takes control of the
    // scrim immediately, exactly as pausing a lesson before trying an idea.
    editor.onMouseDown(() => {
      if (playbackStatusRef.current === "playing") {
        pausePlayback();
        setNotice("Lecture mise en pause : vous avez la main sur le code.");
      }
    });

    editor.onDidChangeModelContent((event) => {
      if (applyingRef.current || playbackStatusRef.current === "playing") return;
      const modelPath = editor.getModel()?.uri.path;
      const fileId = FILE_IDS.find((id) => fileDefinitions[id].path.endsWith(modelPath ?? ""))
        ?? workspaceRef.current.activeFileId;
      const changes: TextChange[] = event.changes.map((change) => ({
        offset: change.rangeOffset,
        deleteCount: change.rangeLength,
        insertText: change.text,
      }));
      const nextWorkspace = cloneWorkspace(workspaceRef.current);
      nextWorkspace.files[fileId] = {
        ...nextWorkspace.files[fileId],
        content: editor.getValue(),
      };
      commitWorkspace(nextWorkspace);

      if (recordingStatusRef.current === "recording") {
        recorderRef.current?.recordEdit(fileId, changes);
        setRecordingDraftEvents(recorderRef.current?.eventsPreview ?? []);
      } else if (recordingStatusRef.current === "off") {
        appendBranchEvent({
          id: createId("branch-edit"),
          at: playbackTimeRef.current,
          kind: "edit",
          fileId,
          changes,
        });
      }
    });

    editor.onDidChangeCursorSelection((event) => {
      if (applyingRef.current || playbackStatusRef.current === "playing") return;
      const fileId = workspaceRef.current.activeFileId;
      const selection = selectionFromMonaco(event.selection);
      const nextWorkspace = cloneWorkspace(workspaceRef.current);
      nextWorkspace.selections[fileId] = selection;
      commitWorkspace(nextWorkspace);

      if (recordingStatusRef.current === "recording") {
        recorderRef.current?.recordSelection(fileId, selection);
      } else if (currentBranchRef.current) {
        appendBranchEvent({
          id: createId("branch-selection"),
          at: playbackTimeRef.current,
          kind: "selection",
          fileId,
          selection,
        });
      }
    });
  };

  const selectFile = (fileId: FileId) => {
    if (workspaceRef.current.activeFileId === fileId) return;
    const nextWorkspace = cloneWorkspace(workspaceRef.current);
    nextWorkspace.activeFileId = fileId;
    commitWorkspace(nextWorkspace);
    setRestoreNonce((value) => value + 1);
    if (recordingStatusRef.current === "recording") recorderRef.current?.recordFileSwitch(fileId);
  };

  const seekTo = (time: number) => {
    pausePlayback();
    setCurrentBranchId(null);
    currentBranchRef.current = null;
    restoreOriginalAt(time);
  };

  const play = async () => {
    if (recordingStatusRef.current !== "off") return;

    // Playing is an explicit checkpoint: persist the current lesson and the
    // active learner branch before the timeline starts moving again.
    const autosavedSession = {
      ...sessionRef.current,
      title: lessonTitle.trim() || "Leçon sans titre",
    };
    sessionRef.current = autosavedSession;
    setSession(autosavedSession);
    const activeBranch = branchesRef.current.find(
      (branch) => branch.id === currentBranchRef.current,
    );
    try {
      await Promise.all([
        saveSession(autosavedSession),
        activeBranch ? saveBranch(activeBranch) : Promise.resolve(),
      ]);
    } catch {
      setNotice("Lecture lancée, mais la sauvegarde locale doit être réessayée.");
    }

    if (currentBranchRef.current || playbackTimeRef.current >= sessionRef.current.duration) {
      setCurrentBranchId(null);
      currentBranchRef.current = null;
      restoreOriginalAt(playbackTimeRef.current >= sessionRef.current.duration ? 0 : playbackTimeRef.current);
    }
    const audio = audioRef.current;
    if (audioUrl && audio) {
      audio.currentTime = playbackTimeRef.current / 1_000;
      audio.playbackRate = playbackSpeed;
      void audio.play().catch(() => setNotice("Lecture vidéo active ; l’audio requiert une interaction navigateur."));
    }
    setPlaybackStatus("playing");
    setNotice("Lecture de la session originale. L’éditeur est protégé pendant la lecture.");
  };

  const selectBranch = (branch: LearnerBranch) => {
    pausePlayback();
    applyingRef.current = true;
    const nextWorkspace = branch.operations.reduce(
      (state, event) => applyEvent(state, event),
      cloneWorkspace(branch.baseSnapshot.workspace),
    );
    commitWorkspace(nextWorkspace);
    playbackWorkspaceRef.current = nextWorkspace;
    playbackTimeRef.current = branch.forkAt;
    setPlaybackTime(branch.forkAt);
    setCurrentBranchId(branch.id);
    currentBranchRef.current = branch.id;
    setRestoreNonce((value) => value + 1);
    window.requestAnimationFrame(() => { applyingRef.current = false; });
    setNotice(`Branche « ${branch.label} » ouverte.`);
  };

  const takeControl = () => {
    if (recordingStatusRef.current !== "off") return;
    if (playbackStatusRef.current === "playing") pausePlayback();
    window.setTimeout(() => editorRef.current?.focus(), 0);
    setNotice(
      currentBranchRef.current
        ? "Vous êtes dans votre branche : testez librement vos idées."
        : "À vous de jouer : votre première modification créera une branche personnelle.",
    );
  };

  const openExternalCompiler = (target: "rust" | "godbolt") => {
    const activeWorkspace = workspaceRef.current;
    const file = activeWorkspace.files[activeWorkspace.activeFileId];
    const destination = target === "rust"
      ? "https://play.rust-lang.org/"
      : "https://godbolt.org/";
    const destinationLabel = target === "rust" ? "Rust Playground" : "Compiler Explorer";

    // Open synchronously in the click handler so browsers do not block the tab,
    // then copy the active source file for a deliberate paste into the compiler.
    window.open(destination, "_blank", "noopener,noreferrer");
    setCompilerMenuOpen(false);

    if (navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(file.content)
        .then(() => setNotice(`${file.label} a été copié · collez-le dans ${destinationLabel}.`))
        .catch(() => setNotice(`${destinationLabel} est ouvert. Copiez ${file.label} manuellement.`));
    } else {
      setNotice(`${destinationLabel} est ouvert. Copiez ${file.label} manuellement.`);
    }
  };

  const importSession = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const nextSession = parseImportedSession(JSON.parse(await file.text()));
      pausePlayback();
      sessionRef.current = nextSession;
      setSession(nextSession);
      setLessonTitle(nextSession.title);
      setCurrentBranchId(null);
      currentBranchRef.current = null;
      setBranches([]);
      branchesRef.current = [];
      setAudioUrl(null);
      restoreOriginalAt(0);
      void saveSession(nextSession);
      setNotice("Session importée. Les fichiers audio doivent être réattachés séparément.");
    } catch {
      setNotice("Impossible d’importer ce fichier : le format .scrim.json est invalide.");
    } finally {
      event.target.value = "";
    }
  };

  const saveCurrent = () => {
    const updated = { ...sessionRef.current, title: lessonTitle.trim() || "Leçon sans titre" };
    sessionRef.current = updated;
    setSession(updated);
    void saveSession(updated);
    setNotice("Session sauvegardée dans ce navigateur.");
  };

  const currentBranch = branches.find((branch) => branch.id === currentBranchId);
  const timelineEventSource = recordingStatus === "off" ? session.events : recordingDraftEvents;
  const timelineVersions = useMemo(
    () => buildTimelineVersions(session, branches, timelineEventSource),
    [session, branches, timelineEventSource],
  );
  const timelineDuration = recordingStatus === "off"
    ? session.duration
    : Math.max(recordingElapsed, 1);
  const timelineTime = recordingStatus === "off" ? playbackTime : recordingElapsed;
  const activeFile = workspace.files[workspace.activeFileId];
  const isEditorReadOnly = playbackStatus === "playing" || recordingStatus === "finishing";

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand" aria-label="Scrim Studio">
          <div className="brand-mark"><Clapperboard size={19} /></div>
          <span>scrim<span>studio</span></span>
          <b>BÊTA</b>
        </div>
        <div className="topbar-center">
          <div className="mode-switch" aria-label="Choisir une démonstration">
            <button className={studioMode === "code" ? "active" : ""} onClick={() => setStudioMode("code")}>Code</button>
            <button className={studioMode === "pdf" ? "active" : ""} onClick={() => setStudioMode("pdf")}>PDF annoté</button>
          </div>
          <span className={`recording-indicator ${studioMode === "code" && recordingStatus === "recording" ? "is-live" : ""}`} />
          {studioMode === "pdf" ? "DÉMO DOCUMENT INTERACTIF" : recordingStatus === "recording" ? `REC ${formatTime(recordingElapsed)}` : currentBranch ? "BRANCHE PERSONNELLE" : "LEÇON INTERACTIVE"}
        </div>
        <div className="topbar-actions">
          {studioMode === "code" && <>
            <button className="quiet-button" onClick={() => fileInputRef.current?.click()}><Upload size={15} /> Importer</button>
            <input ref={fileInputRef} onChange={importSession} accept="application/json,.json,.scrim.json" type="file" hidden />
            <button className="quiet-button" onClick={() => downloadJson(session)}><Download size={15} /> Exporter</button>
            <button className="quiet-button" onClick={saveCurrent}><Save size={15} /> Sauvegarder</button>
          </>}
        </div>
      </header>

      {studioMode === "pdf" ? (
        <Suspense fallback={<div className="pdf-demo-loading">Chargement de la démonstration PDF…</div>}>
          <PdfAnnotationDemo />
        </Suspense>
      ) : (
        <>
      <main className="studio-layout">
        <aside className="lesson-sidebar">
          <div className="lesson-badge"><Sparkles size={14} /> Atelier interactif</div>
          <input
            className="lesson-title-input"
            aria-label="Titre de la leçon"
            value={lessonTitle}
            onChange={(event) => setLessonTitle(event.target.value)}
            disabled={recordingStatus !== "off"}
          />
          <p className="lesson-copy">Le code est le support : pausez, explorez, puis revenez à la leçon sans perdre le fil.</p>

          <div className="metric-row">
            <div><TimerReset size={15} /><span>{formatTime(session.duration)}</span><small>durée</small></div>
            <div><Layers3 size={15} /><span>{session.events.length}</span><small>événements</small></div>
            <div><Headphones size={15} /><span>{session.audio ? "Oui" : "—"}</span><small>audio</small></div>
          </div>

          <section className="sidebar-section">
            <div className="section-heading"><FileCode2 size={15} /> Fichiers du projet</div>
            <div className="file-list">
              {FILE_IDS.map((fileId) => {
                const file = workspace.files[fileId];
                const Icon = fileId === "html" ? Braces : fileId === "css" ? WandSparkles : FileJson2;
                return (
                  <button
                    key={fileId}
                    className={`file-tab ${workspace.activeFileId === fileId ? "active" : ""}`}
                    onClick={() => selectFile(fileId)}
                  >
                    <Icon size={15} />
                    <span>{file.label}</span>
                    {workspace.activeFileId === fileId && <span className="file-dot" />}
                  </button>
                );
              })}
            </div>
          </section>

          <section className="privacy-note">
            <BadgeCheck size={16} />
            <span><b>Local-first.</b> Les sessions et votre audio restent dans ce navigateur.</span>
          </section>
        </aside>

        <section className="workspace-area">
          <div className="workspace-toolbar">
            <div className="breadcrumb"><Code2 size={16} /> projet <ChevronRight size={14} /> <strong>{activeFile.label}</strong></div>
            <div className="workspace-toolbar-actions">
              <div className="compiler-menu">
                <button
                  className="compiler-button"
                  aria-expanded={compilerMenuOpen}
                  aria-haspopup="menu"
                  onClick={() => setCompilerMenuOpen((open) => !open)}
                >
                  <Braces size={14} /> Compiler <ChevronRight size={13} />
                </button>
                {compilerMenuOpen && (
                  <div className="compiler-popover" role="menu" aria-label="Ouvrir un compilateur externe">
                    <p>Copie le fichier actif, puis ouvre :</p>
                    <button role="menuitem" onClick={() => openExternalCompiler("rust")}>
                      <span><strong>Rust Playground</strong><small>Rust · play.rust-lang.org</small></span>
                      <ExternalLink size={14} />
                    </button>
                    <button role="menuitem" onClick={() => openExternalCompiler("godbolt")}>
                      <span><strong>Compiler Explorer</strong><small>C / C++ / Rust · godbolt.org</small></span>
                      <ExternalLink size={14} />
                    </button>
                  </div>
                )}
              </div>
              <div className="workspace-status">
                <span className="workspace-status-copy">
                  {isEditorReadOnly ? <><CirclePlay size={14} /> Lecture : édition verrouillée</> : currentBranch ? <><GitBranch size={14} /> Modification dans votre branche</> : <><Grip size={14} /> Prêt à explorer</>}
                </span>
                {!isEditorReadOnly && (
                  <button className="take-control-button" onClick={takeControl}>
                    <Code2 size={13} /> Essayer le code
                  </button>
                )}
              </div>
            </div>
          </div>
          <div className="editor-frame">
            <Editor
              height="100%"
              path={activeFile.path}
              language={activeFile.language}
              value={activeFile.content}
              theme="scrim-liquid"
              beforeMount={configureLiquidEditor}
              onMount={handleEditorMount}
              options={{
                fontSize: 14,
                fontFamily: "'JetBrains Mono', 'SFMono-Regular', Consolas, monospace",
                fontLigatures: true,
                lineHeight: 22,
                minimap: { enabled: false },
                padding: { top: 20, bottom: 20 },
                scrollBeyondLastLine: false,
                automaticLayout: true,
                readOnly: isEditorReadOnly,
                renderLineHighlight: "all",
                cursorBlinking: "smooth",
                smoothScrolling: true,
                roundedSelection: true,
              }}
            />
            <div className="editor-corner-label">{activeFile.language}</div>
          </div>
        </section>

        <PreviewFrame workspace={workspace} />
      </main>

      <section className="control-deck">
        <div className="deck-notice"><span className="notice-pulse" />{notice}</div>
        <div className="timeline-row">
          <span>{formatTime(timelineTime)}</span>
          <div className="timeline-stack">
            <div className="git-version-track" aria-label="Historique des versions enregistrées">
              <span className="git-trunk" aria-hidden="true" />
              {timelineVersions.map((version) => {
                const position = timelineDuration > 0 ? (version.at / timelineDuration) * 100 : 0;
                const branch = version.branchId
                  ? branches.find(({ id }) => id === version.branchId)
                  : undefined;
                const isCurrentBranch = version.branchId === currentBranchId;
                return (
                  <button
                    key={version.id}
                    className={`git-version ${version.kind} ${isCurrentBranch ? "current" : ""}`}
                    style={{
                      "--at": `${position}%`,
                      "--branch-offset": `${(version.lane ?? 0) * 7}px`,
                    } as React.CSSProperties}
                    title={version.detail}
                    aria-label={version.detail}
                    disabled={recordingStatus !== "off"}
                    onClick={() => branch ? selectBranch(branch) : seekTo(version.at)}
                  >
                    <span className="git-version-dot" />
                    <span className="git-version-label">{version.label}</span>
                  </button>
                );
              })}
            </div>
            <input
              aria-label="Position dans la leçon"
              className="timeline"
              type="range"
              min="0"
              max={timelineDuration}
              value={timelineTime}
              disabled={recordingStatus !== "off"}
              onChange={(event) => seekTo(Number(event.target.value))}
            />
          </div>
          <span>{formatTime(timelineDuration)}</span>
        </div>
        <div className="deck-controls">
          <div className="control-cluster record-controls">
            {recordingStatus === "off" ? (
              <button className="record-button" onClick={startRecording} title="Enregistrer une nouvelle session"><Mic size={16} /> Enregistrer</button>
            ) : (
              <>
                <button className={`record-button active ${recordingStatus === "paused" ? "paused" : ""}`} onClick={toggleRecordingPause} disabled={recordingStatus === "finishing"}>
                  {recordingStatus === "paused" ? <Mic size={16} /> : <Pause size={16} />}
                  {recordingStatus === "finishing" ? "Finalisation…" : recordingStatus === "paused" ? "Reprendre" : "Pause"}
                </button>
                <button className="finish-button" onClick={requestFinishRecording} disabled={recordingStatus === "finishing"}><Square size={14} /> Terminer</button>
              </>
            )}
          </div>
          <div className="playback-controls">
            <button className="deck-icon" onClick={() => seekTo(Math.max(0, playbackTime - 5_000))} disabled={recordingStatus !== "off"} aria-label="Reculer de cinq secondes"><SkipBack size={18} /></button>
            <button className="play-button" onClick={playbackStatus === "playing" ? pausePlayback : play} disabled={recordingStatus !== "off"} aria-label={playbackStatus === "playing" ? "Mettre en pause" : "Lire"}>
              {playbackStatus === "playing" ? <CirclePause size={25} /> : <CirclePlay size={25} />}
            </button>
            <button className="deck-icon" onClick={() => seekTo(Math.min(session.duration, playbackTime + 5_000))} disabled={recordingStatus !== "off"} aria-label="Avancer de cinq secondes"><Redo2 size={18} /></button>
          </div>
          <div className="speed-controls">
            <Gauge size={15} />
            {speeds.map((speed) => <button key={speed} className={playbackSpeed === speed ? "selected" : ""} onClick={() => setPlaybackSpeed(speed)}>{speed}×</button>)}
            <Volume2 size={15} className="volume-icon" />
          </div>
        </div>
      </section>

      {audioUrl && <audio ref={audioRef} src={audioUrl} preload="auto" />}
        </>
      )}
    </div>
  );
}
