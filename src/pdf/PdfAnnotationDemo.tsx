import { useEffect, useMemo, useRef, useState } from "react";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import * as pdfjs from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import {
  ChevronLeft,
  ChevronRight,
  CirclePause,
  CirclePlay,
  Download,
  FileText,
  GitBranch,
  Highlighter,
  MessageSquarePlus,
  Pause,
  Play,
  RotateCcw,
  Sparkles,
} from "lucide-react";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

type AnnotationKind = "highlight" | "comment" | "ink";

type PdfAnnotation = {
  id: string;
  at: number;
  page: number;
  kind: AnnotationKind;
  title: string;
  text: string;
  rect: { x: number; y: number; width: number; height: number };
  color: "yellow" | "coral" | "pink";
  learner?: boolean;
};

const duration = 10_800;

const lessonAnnotations: PdfAnnotation[] = [
  {
    id: "pdf-v1",
    at: 1_100,
    page: 1,
    kind: "highlight",
    title: "v1 · idée clé",
    text: "On conserve les opérations, pas une succession de captures d’écran.",
    rect: { x: 8.5, y: 31.2, width: 81, height: 5.1 },
    color: "yellow",
  },
  {
    id: "pdf-v2",
    at: 3_600,
    page: 1,
    kind: "comment",
    title: "v2 · commentaire",
    text: "Cette note est un événement rejouable, ancré à la page et au texte.",
    rect: { x: 72.5, y: 53.4, width: 20, height: 11 },
    color: "coral",
  },
  {
    id: "pdf-v3",
    at: 6_300,
    page: 2,
    kind: "highlight",
    title: "v3 · conclusion",
    text: "Un snapshot accélère la navigation vers n’importe quel instant de la leçon.",
    rect: { x: 8.5, y: 43.4, width: 77, height: 5.1 },
    color: "pink",
  },
  {
    id: "pdf-v4",
    at: 8_800,
    page: 2,
    kind: "ink",
    title: "v4 · tracé",
    text: "Le tracé et sa couleur sont stockés comme une opération structurée.",
    rect: { x: 10, y: 65, width: 49, height: 1.6 },
    color: "coral",
  },
];

function formatTime(milliseconds: number): string {
  const seconds = Math.max(0, Math.floor(milliseconds / 1_000));
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

function paragraph(page: PDFPage, font: PDFFont, text: string, y: number, size = 12): void {
  page.drawText(text, {
    x: 54,
    y,
    size,
    font,
    color: rgb(0.14, 0.16, 0.15),
  });
}

async function createLessonPdf(): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  document.setTitle("Le replay d’annotations interactives");
  document.setAuthor("Scrim Studio");
  const font = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);

  const firstPage = document.addPage([595, 842]);
  firstPage.drawRectangle({ x: 0, y: 0, width: 595, height: 842, color: rgb(0.99, 0.985, 0.96) });
  firstPage.drawRectangle({ x: 0, y: 786, width: 595, height: 56, color: rgb(0.12, 0.12, 0.12) });
  firstPage.drawText("LEÇON DOCUMENTAIRE", { x: 54, y: 808, size: 10, font: bold, color: rgb(1, 0.84, 0.31) });
  firstPage.drawText("Annoter un document comme une timeline", { x: 54, y: 714, size: 27, font: bold, color: rgb(0.12, 0.12, 0.12) });
  firstPage.drawText("Une démonstration d’événements, de versions et de branches.", { x: 54, y: 684, size: 13, font, color: rgb(0.38, 0.4, 0.39) });
  firstPage.drawLine({ start: { x: 54, y: 650 }, end: { x: 541, y: 650 }, thickness: 1, color: rgb(0.8, 0.8, 0.77) });
  firstPage.drawText("01", { x: 54, y: 608, size: 12, font: bold, color: rgb(0.85, 0.27, 0.37) });
  firstPage.drawText("Le principe", { x: 82, y: 607, size: 15, font: bold, color: rgb(0.12, 0.12, 0.12) });
  paragraph(firstPage, font, "Au lieu de filmer le PDF, on mémorise des opérations : surligner,", 574);
  paragraph(firstPage, font, "commenter, dessiner, déplacer une note, changer de page ou supprimer.", 555);
  paragraph(firstPage, font, "On conserve les opérations, pas une succession de captures d’écran.", 516);
  firstPage.drawText("02", { x: 54, y: 445, size: 12, font: bold, color: rgb(0.85, 0.27, 0.37) });
  firstPage.drawText("Le lecteur", { x: 82, y: 444, size: 15, font: bold, color: rgb(0.12, 0.12, 0.12) });
  paragraph(firstPage, font, "La lecture rejoue les annotations sur une couche indépendante du PDF.", 410);
  paragraph(firstPage, font, "Cette note est un événement rejouable, ancré à la page et au texte.", 371);
  firstPage.drawText("© Scrim Studio — PDF source immuable", { x: 54, y: 55, size: 9, font, color: rgb(0.47, 0.48, 0.47) });

  const secondPage = document.addPage([595, 842]);
  secondPage.drawRectangle({ x: 0, y: 0, width: 595, height: 842, color: rgb(0.99, 0.985, 0.96) });
  secondPage.drawRectangle({ x: 0, y: 786, width: 595, height: 56, color: rgb(0.12, 0.12, 0.12) });
  secondPage.drawText("REPLAY & VERSIONNEMENT", { x: 54, y: 808, size: 10, font: bold, color: rgb(1, 0.84, 0.31) });
  secondPage.drawText("Naviguer et expérimenter", { x: 54, y: 714, size: 27, font: bold, color: rgb(0.12, 0.12, 0.12) });
  secondPage.drawText("Le PDF ne change jamais : les annotations peuvent bifurquer.", { x: 54, y: 684, size: 13, font, color: rgb(0.38, 0.4, 0.39) });
  secondPage.drawLine({ start: { x: 54, y: 650 }, end: { x: 541, y: 650 }, thickness: 1, color: rgb(0.8, 0.8, 0.77) });
  secondPage.drawText("03", { x: 54, y: 607, size: 12, font: bold, color: rgb(0.85, 0.27, 0.37) });
  secondPage.drawText("Snapshots", { x: 82, y: 606, size: 15, font: bold, color: rgb(0.12, 0.12, 0.12) });
  paragraph(secondPage, font, "Un snapshot accélère la navigation vers n’importe quel instant de la leçon.", 568);
  paragraph(secondPage, font, "Le moteur restaure l’état le plus proche, puis applique seulement les", 530);
  paragraph(secondPage, font, "événements manquants.", 511);
  secondPage.drawText("04", { x: 54, y: 432, size: 12, font: bold, color: rgb(0.85, 0.27, 0.37) });
  secondPage.drawText("Branches personnelles", { x: 82, y: 431, size: 15, font: bold, color: rgb(0.12, 0.12, 0.12) });
  paragraph(secondPage, font, "L’apprenant peut mettre en pause, annoter et créer son propre chemin.", 394);
  paragraph(secondPage, font, "Le tracé et sa couleur sont stockés comme une opération structurée.", 354);
  secondPage.drawText("© Scrim Studio — couche d’annotations versionnée", { x: 54, y: 55, size: 9, font, color: rgb(0.47, 0.48, 0.47) });

  return document.save();
}

export function PdfAnnotationDemo() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [pdf, setPdf] = useState<pdfjs.PDFDocumentProxy | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [learnerAnnotations, setLearnerAnnotations] = useState<PdfAnnotation[]>([]);
  const [selectedAnnotation, setSelectedAnnotation] = useState<string | null>(null);
  const [notice, setNotice] = useState("Lancez la lecture pour rejouer les annotations du document.");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let loadedPdf: pdfjs.PDFDocumentProxy | null = null;

    const load = async () => {
      try {
        const bytes = await createLessonPdf();
        const task = pdfjs.getDocument({ data: bytes });
        loadedPdf = await task.promise;
        if (!cancelled) {
          setPdf(loadedPdf);
          setLoading(false);
        }
      } catch {
        if (!cancelled) {
          setError("Le PDF de démonstration n’a pas pu être chargé.");
          setLoading(false);
        }
      }
    };
    void load();

    return () => {
      cancelled = true;
      void loadedPdf?.destroy();
    };
  }, []);

  useEffect(() => {
    if (!pdf || !canvasRef.current) return;
    let cancelled = false;

    const render = async () => {
      const page = await pdf.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 1.22 });
      const canvas = canvasRef.current;
      if (!canvas || cancelled) return;
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      const context = canvas.getContext("2d");
      if (!context) return;
      await page.render({ canvasContext: context, viewport }).promise;
    };
    void render();
    return () => { cancelled = true; };
  }, [pdf, pageNumber]);

  useEffect(() => {
    if (!isPlaying) return undefined;
    const startedAt = performance.now() - time;
    let frame = 0;
    const tick = (now: number) => {
      const next = Math.min(duration, now - startedAt);
      setTime(next);
      if (next >= duration) {
        setIsPlaying(false);
        setNotice("Fin du replay. Vous pouvez maintenant créer une annotation personnelle.");
        return;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [isPlaying, time]);

  const allAnnotations = useMemo(
    () => [...lessonAnnotations, ...learnerAnnotations],
    [learnerAnnotations],
  );
  const visibleAnnotations = allAnnotations.filter(
    (annotation) => annotation.at <= time && annotation.page === pageNumber,
  );
  const selected = allAnnotations.find(({ id }) => id === selectedAnnotation) ?? null;
  const versions = useMemo(
    () => [
      { id: "main", at: 0, label: "main", kind: "root" as const, page: 1 },
      ...lessonAnnotations.map((annotation, index) => ({
        id: annotation.id,
        at: annotation.at,
        label: `v${index + 1}`,
        kind: "lesson" as const,
        page: annotation.page,
      })),
      ...learnerAnnotations.map((annotation, index) => ({
        id: annotation.id,
        at: annotation.at,
        label: `b1.${index + 1}`,
        kind: "branch" as const,
        page: annotation.page,
      })),
    ],
    [learnerAnnotations],
  );

  const pauseForInteraction = () => {
    if (isPlaying) {
      setIsPlaying(false);
      setNotice("Lecture suspendue : vous pouvez inspecter ou annoter le document.");
    }
  };

  const seek = (nextTime: number, nextPage?: number) => {
    setIsPlaying(false);
    setTime(Math.max(0, Math.min(duration, nextTime)));
    if (nextPage) setPageNumber(nextPage);
  };

  const createLearnerNote = () => {
    pauseForInteraction();
    const index = learnerAnnotations.length + 1;
    const annotation: PdfAnnotation = {
      id: `learner-${Date.now()}`,
      at: time,
      page: pageNumber,
      kind: "comment",
      title: `b1.${index} · note personnelle`,
      text: "Hypothèse de l’apprenant : cette annotation vit dans une branche séparée.",
      rect: { x: 67, y: 70, width: 24, height: 12 },
      color: "pink",
      learner: true,
    };
    setLearnerAnnotations((annotations) => [...annotations, annotation]);
    setSelectedAnnotation(annotation.id);
    setNotice(`Version b1.${index} créée directement à ${formatTime(time)}.`);
  };

  const exportAnnotations = () => {
    const payload = {
      document: "demo-annotations.pdf",
      exportedAt: new Date().toISOString(),
      lessonAnnotations,
      learnerAnnotations,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "pdf-annotations.scrim.json";
    link.click();
    URL.revokeObjectURL(link.href);
  };

  return (
    <main className="pdf-demo">
      <aside className="pdf-sidebar">
        <div className="pdf-kicker"><Sparkles size={14} /> Démonstration PDF</div>
        <h1>Le PDF devient<br /><em>rejouable.</em></h1>
        <p>Le fichier source reste immuable. Seules les annotations, leurs versions et leurs branches sont enregistrées.</p>

        <div className="pdf-source-card">
          <FileText size={19} />
          <div><strong>replay-annotations.pdf</strong><small>2 pages · source verrouillée</small></div>
        </div>

        <div className="pdf-legend">
          <p><span className="legend-dot main" /> Version initiale</p>
          <p><span className="legend-dot lesson" /> Annotation instructeur</p>
          <p><span className="legend-dot branch" /> Branche personnelle</p>
        </div>

        <button className="pdf-export" onClick={exportAnnotations}><Download size={15} /> Exporter les annotations</button>
      </aside>

      <section className="pdf-reader-panel">
        <header className="pdf-reader-header">
          <div><FileText size={16} /> Lecteur annoté <span>PDF.js + overlay d’événements</span></div>
          <div className="pdf-page-actions">
            <button onClick={() => setPageNumber((page) => Math.max(1, page - 1))} disabled={pageNumber === 1} aria-label="Page précédente"><ChevronLeft size={17} /></button>
            <span>Page {pageNumber} / {pdf?.numPages ?? 2}</span>
            <button onClick={() => setPageNumber((page) => Math.min(pdf?.numPages ?? 2, page + 1))} disabled={pageNumber === (pdf?.numPages ?? 2)} aria-label="Page suivante"><ChevronRight size={17} /></button>
          </div>
        </header>
        <div className="pdf-scroll-area" onClick={pauseForInteraction}>
          {loading && <div className="pdf-loading">Préparation du document…</div>}
          {error && <div className="pdf-loading error">{error}</div>}
          <div className="pdf-page-stage" aria-label="Document PDF annoté">
            <canvas ref={canvasRef} className="pdf-canvas" />
            {visibleAnnotations.map((annotation) => (
              <button
                key={annotation.id}
                className={`pdf-annotation ${annotation.kind} ${annotation.color} ${selectedAnnotation === annotation.id ? "selected" : ""}`}
                style={{
                  left: `${annotation.rect.x}%`,
                  top: `${annotation.rect.y}%`,
                  width: `${annotation.rect.width}%`,
                  height: `${annotation.rect.height}%`,
                }}
                title={annotation.title}
                onClick={(event) => {
                  event.stopPropagation();
                  pauseForInteraction();
                  setSelectedAnnotation(annotation.id);
                }}
              >
                {annotation.kind === "comment" && <MessageSquarePlus size={15} />}
                {annotation.kind === "ink" && <span className="ink-stroke" />}
              </button>
            ))}
          </div>
        </div>
      </section>

      <aside className="pdf-notes-panel">
        <header><GitBranch size={16} /> Journal d’annotations</header>
        {selected ? (
          <article className="annotation-detail">
            <span className={`annotation-kind ${selected.learner ? "learner" : ""}`}>{selected.learner ? "BRANCHE PERSONNELLE" : "VERSION INSTRUCTEUR"}</span>
            <h2>{selected.title}</h2>
            <p>{selected.text}</p>
            <small>Page {selected.page} · {formatTime(selected.at)}</small>
          </article>
        ) : (
          <div className="annotation-empty"><Highlighter size={22} /><p>Les annotations apparaîtront dans ce panneau pendant la lecture.</p></div>
        )}
        <div className="annotation-list">
          {allAnnotations.filter((annotation) => annotation.at <= time).map((annotation) => (
            <button key={annotation.id} onClick={() => { setSelectedAnnotation(annotation.id); seek(annotation.at, annotation.page); }}>
              <span className={`annotation-list-dot ${annotation.learner ? "learner" : ""}`} />
              <span>{annotation.title}<small>page {annotation.page} · {formatTime(annotation.at)}</small></span>
            </button>
          ))}
        </div>
        <button className="pdf-add-note" onClick={createLearnerNote}><MessageSquarePlus size={15} /> Ajouter ma note · créer b1</button>
      </aside>

      <section className="pdf-control-deck">
        <div className="pdf-notice"><span />{notice}</div>
        <div className="pdf-timeline-row">
          <span>{formatTime(time)}</span>
          <div className="pdf-timeline-stack">
            <div className="pdf-git-track">
              <span className="pdf-git-line" />
              {versions.map((version, index) => {
                const position = (version.at / duration) * 100;
                return (
                  <button
                    key={version.id}
                    className={`pdf-version ${version.kind}`}
                    style={{ "--at": `${position}%`, "--level": `${index % 2}` } as React.CSSProperties}
                    title={`${version.label} · ${formatTime(version.at)}`}
                    onClick={() => seek(version.at, version.page)}
                  >
                    <span /><b>{version.label}</b>
                  </button>
                );
              })}
            </div>
            <input type="range" min="0" max={duration} value={time} aria-label="Timeline du PDF" onChange={(event) => seek(Number(event.target.value))} />
          </div>
          <span>{formatTime(duration)}</span>
        </div>
        <div className="pdf-controls">
          <button className="pdf-reset" onClick={() => { setLearnerAnnotations([]); setSelectedAnnotation(null); seek(0, 1); setNotice("Démonstration réinitialisée."); }}><RotateCcw size={15} /> Réinitialiser</button>
          <button className="pdf-play" onClick={() => { setIsPlaying((playing) => !playing); setNotice(isPlaying ? "Lecture mise en pause." : "Lecture des annotations de l’instructeur."); }}>
            {isPlaying ? <><CirclePause size={24} /> Pause</> : <><CirclePlay size={24} /> Lire la démonstration</>}
          </button>
          <button className="pdf-add-note compact" onClick={createLearnerNote}><Highlighter size={15} /> Annoter</button>
        </div>
      </section>
    </main>
  );
}
