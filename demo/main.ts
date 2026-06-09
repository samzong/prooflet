import { prooflet } from "../src/index.js"
import "./styles.css"

document.querySelector<HTMLDivElement>("#app")!.innerHTML = `
  <main class="shell">
    <nav class="topbar">
      <strong>Prototype CRM</strong>
      <div>
        <button data-testid="new-lead" data-demo-action="New lead opened">New lead</button>
        <button class="secondary" data-demo-action="Import started">Import</button>
      </div>
    </nav>
    <section class="hint">
      <strong>Demo interaction</strong>
      <span>Normal mode keeps this prototype clickable. Annotate captures page clicks until Done.</span>
      <em id="demo-status">No host action yet.</em>
    </section>
    <section class="summary">
      <article data-testid="pipeline-card">
        <span>Pipeline</span>
        <strong>$428k</strong>
        <p>Qualified revenue expected this month.</p>
      </article>
      <article>
        <span>Review risk</span>
        <strong>17</strong>
        <p>Accounts waiting for approval.</p>
      </article>
      <article>
        <span>Conversion</span>
        <strong>38%</strong>
        <p>Lead to opportunity trend.</p>
      </article>
    </section>
    <section class="workspace">
      <aside>
        <button class="active">Overview</button>
        <button>Accounts</button>
        <button>Forecast</button>
        <button>Settings</button>
      </aside>
      <div class="board">
        <header>
          <div>
            <span>Review queue</span>
            <h1>Enterprise onboarding</h1>
          </div>
          <button aria-label="Filter review queue" data-demo-action="Filter panel opened">Filter</button>
        </header>
        <div class="table" role="table" aria-label="Enterprise onboarding accounts">
          <div role="row">
            <strong role="cell">Northstar Labs</strong>
            <span role="cell">Security review</span>
            <em role="cell">Today</em>
          </div>
          <div role="row">
            <strong role="cell">HelioGrid</strong>
            <span role="cell">Legal approval</span>
            <em role="cell">Tomorrow</em>
          </div>
          <div role="row">
            <strong role="cell">Vector Yard</strong>
            <span role="cell">Data mapping</span>
            <em role="cell">Friday</em>
          </div>
        </div>
      </div>
    </section>
  </main>
`

prooflet.mount({
  projectId: "prooflet-demo",
})

const status = document.querySelector<HTMLElement>("#demo-status")!

for (const action of document.querySelectorAll<HTMLElement>("[data-demo-action]")) {
  action.addEventListener("click", () => {
    status.textContent = action.dataset.demoAction ?? "Host action clicked"
  })
}
