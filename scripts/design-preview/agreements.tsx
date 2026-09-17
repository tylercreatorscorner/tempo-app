import { createRoot } from "react-dom/client";
import { AgreementPreview } from "../../src/components/creators/agreement-preview";
import "./agreements.css";
createRoot(document.getElementById("root")!).render(
  <main>
    <header>
      <span>TEMPO / DESIGN PREVIEW</span>
      <h1>Creator agreements</h1>
      <p>Fictional brand · Interactive component preview · No live data</p>
    </header>
    <AgreementPreview
      brands={[{ value: "sample", label: "Sample Brand" }]}
      today="2026-10-05"
    />
  </main>,
);
