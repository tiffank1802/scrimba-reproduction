import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, RotateCcw, TerminalSquare } from "lucide-react";
import type { WorkspaceState } from "../core/session";

type PreviewMessage = {
  source: "scrim-preview";
  level: "log" | "info" | "warn" | "error";
  values: string[];
};

type PreviewFrameProps = {
  workspace: WorkspaceState;
};

function escapeScript(value: string): string {
  return value.replace(/<\/script/gi, "<\\/script");
}

function makeDocument(workspace: WorkspaceState): string {
  const html = workspace.files.html.content;
  const css = workspace.files.css.content;
  const javascript = escapeScript(workspace.files.javascript.content);

  return `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data: https:; font-src data:; connect-src 'none'" />
  <style>${css}</style>
</head>
<body>
  ${html}
  <script>
    const send = (level, values) => parent.postMessage({ source: 'scrim-preview', level, values: values.map(value => {
      try { return typeof value === 'string' ? value : JSON.stringify(value); }
      catch { return String(value); }
    }) }, '*');
    ['log', 'info', 'warn', 'error'].forEach(level => {
      const original = console[level];
      console[level] = (...values) => { send(level, values); original.apply(console, values); };
    });
    window.addEventListener('error', event => send('error', [event.message]));
    window.addEventListener('unhandledrejection', event => send('error', [String(event.reason)]));
  </script>
  <script>${javascript}</script>
</body>
</html>`;
}

export function PreviewFrame({ workspace }: PreviewFrameProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [consoleMessages, setConsoleMessages] = useState<PreviewMessage[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const srcDoc = useMemo(() => makeDocument(workspace), [workspace, refreshKey]);

  useEffect(() => {
    const onMessage = (event: MessageEvent<PreviewMessage>) => {
      if (
        event.source !== iframeRef.current?.contentWindow ||
        event.data?.source !== "scrim-preview"
      ) {
        return;
      }
      setConsoleMessages((messages) => [...messages.slice(-5), event.data]);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  useEffect(() => {
    setConsoleMessages([]);
  }, [workspace.files.html.content, workspace.files.css.content, workspace.files.javascript.content]);

  return (
    <section className="preview-panel" aria-label="Aperçu en direct">
      <header className="panel-header preview-header">
        <div className="panel-title">
          <span className="status-dot" />
          <span>Résultat</span>
          <small>iframe sandboxée</small>
        </div>
        <div className="preview-actions">
          <button
            className="icon-button"
            title="Relancer l’aperçu"
            aria-label="Relancer l’aperçu"
            onClick={() => setRefreshKey((key) => key + 1)}
          >
            <RotateCcw size={15} />
          </button>
        </div>
      </header>
      <div className="preview-canvas">
        <iframe
          ref={iframeRef}
          key={refreshKey}
          title="Aperçu du projet"
          sandbox="allow-scripts"
          srcDoc={srcDoc}
        />
      </div>
      <footer className="console">
        <div className="console-title">
          <TerminalSquare size={14} /> Console
        </div>
        {consoleMessages.length === 0 ? (
          <span className="console-empty">Aucune sortie · environnement isolé</span>
        ) : (
          <div className="console-messages">
            {consoleMessages.map((message, index) => (
              <p key={`${message.level}-${index}`} className={`console-message ${message.level}`}>
                {message.level === "error" && <AlertTriangle size={12} />}
                {message.values.join(" ")}
              </p>
            ))}
          </div>
        )}
      </footer>
    </section>
  );
}
