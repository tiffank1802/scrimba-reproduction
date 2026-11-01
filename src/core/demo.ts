import {
  buildSnapshots,
  makeWorkspace,
  type ScrimEvent,
  type ScrimSession,
} from "./session";

const html = `<main class="lesson-shell">
  <p class="eyebrow">MICRO-LEÇON · CSS</p>
  <section class="card">
    <span class="orb orb-one"></span>
    <span class="orb orb-two"></span>
    <div class="card__content">
      <p class="kicker">Construire en jouant</p>
      <h1>Une carte qui<br /><em>respire.</em></h1>
      <p class="description">Du CSS simple, un résultat vivant. Mettez la leçon en pause pour tester votre idée.</p>
      <button id="surprise">Faire une pause</button>
      <p class="hint" id="hint">Astuce : les essais restent dans votre branche.</p>
    </div>
  </section>
</main>`;

const css = `:root {
  color-scheme: dark;
  font-family: Inter, ui-sans-serif, system-ui, sans-serif;
}

* { box-sizing: border-box; }

body {
  min-height: 100vh;
  margin: 0;
  display: grid;
  place-items: center;
  overflow: hidden;
  color: #f7fff9;
  background: #10231a;
}

.lesson-shell { width: min(90vw, 720px); }
.eyebrow { margin: 0 0 1rem; color: #acd6b8; font-size: .72rem; font-weight: 800; letter-spacing: .16em; }

.card {
  position: relative;
  overflow: hidden;
  min-height: 390px;
  padding: clamp(2rem, 6vw, 4.6rem);
  border: 1px solid rgba(245, 255, 230, .3);
  border-radius: 28px;
  background: rgba(19, 44, 31, .74);
  box-shadow: 0 30px 80px rgba(2, 17, 9, .42);
  backdrop-filter: blur(22px);
}

.card__content { position: relative; z-index: 1; max-width: 480px; }
.kicker { margin: 0 0 1rem; color: #a9f0c2; font-size: .9rem; font-weight: 750; }
h1 { margin: 0; font-size: clamp(2.6rem, 7vw, 5.6rem); line-height: .91; letter-spacing: -.075em; }
em { color: #ffe27d; font-family: Georgia, serif; font-weight: 400; }
.description { max-width: 420px; margin: 1.8rem 0; color: #d3e7d9; font-size: 1.02rem; line-height: 1.65; }
button { border: 0; border-radius: 999px; padding: .84rem 1.2rem; color: #12301e; background: #b9fbdc; font: inherit; font-weight: 800; cursor: pointer; transition: transform .2s, box-shadow .2s; }
button:hover { transform: translateY(-2px); box-shadow: 0 12px 24px #071b1055; }
.hint { min-height: 1.3rem; margin-top: 1.15rem; color: #b8d0be; font-size: .82rem; }
.orb { position: absolute; width: 250px; aspect-ratio: 1; border-radius: 50%; filter: blur(12px); opacity: .74; animation: float 7s ease-in-out infinite alternate; }
.orb-one { top: -105px; right: -85px; background: #e5c84f; }
.orb-two { bottom: -140px; right: 28%; width: 190px; background: #e15e65; animation-delay: -4s; }
@keyframes float { to { transform: translate(-20px, 32px) rotate(18deg); } }
`;

const javascript = `const button = document.querySelector("#surprise");
const hint = document.querySelector("#hint");

button.addEventListener("click", () => {
  hint.textContent = "Bien vu. Modifiez maintenant une couleur ou un mot !";
  button.textContent = "À vous de jouer";
});`;

const initial = makeWorkspace({
  html: "<!-- Le HTML arrive dans un instant. -->\n",
  css: "/* Puis nous allons habiller la carte. */\n",
  javascript: "// Enfin, ajoutons une petite interaction.\n",
});

const events: ScrimEvent[] = [
  {
    id: "demo_html",
    at: 700,
    kind: "edit",
    fileId: "html",
    changes: [{ offset: 0, deleteCount: initial.files.html.content.length, insertText: html }],
  },
  { id: "demo_switch_css", at: 4_600, kind: "file-switch", fileId: "css" },
  {
    id: "demo_css",
    at: 4_900,
    kind: "edit",
    fileId: "css",
    changes: [{ offset: 0, deleteCount: initial.files.css.content.length, insertText: css }],
  },
  {
    id: "demo_css_selection",
    at: 9_450,
    kind: "selection",
    fileId: "css",
    selection: { startLineNumber: 36, startColumn: 1, endLineNumber: 36, endColumn: 1 },
  },
  {
    id: "demo_switch_js",
    at: 10_200,
    kind: "file-switch",
    fileId: "javascript",
  },
  {
    id: "demo_js",
    at: 10_650,
    kind: "edit",
    fileId: "javascript",
    changes: [
      {
        offset: 0,
        deleteCount: initial.files.javascript.content.length,
        insertText: javascript,
      },
    ],
  },
  { id: "demo_back_html", at: 14_500, kind: "file-switch", fileId: "html" },
];

const duration = 17_000;

export const demoSession: ScrimSession = {
  version: 1,
  id: "demo_build-a-breathing-card",
  title: "Créer une carte qui respire",
  createdAt: "2026-01-01T00:00:00.000Z",
  duration,
  initialWorkspace: initial,
  events,
  snapshots: buildSnapshots(initial, events, duration),
};
