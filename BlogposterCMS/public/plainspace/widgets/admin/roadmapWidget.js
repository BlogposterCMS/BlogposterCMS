export async function render(el) {
  el.innerHTML = `
    <div class="home-roadmap-widget">
      <h3>Roadmap</h3>
      <p>With this update we focused on user friendliness and overhauled the dashboard, but this is just the first step.</p>
      <ul>
        <li>All widgets will be revised in upcoming updates.</li>
        <li>Refined permission settings in the dashboard.</li>
        <li>Continue fixing all known bugs.</li>
        <li>Add more functions to the designer app (builder).</li>
        <li>Expand SMTP functionality.</li>
        <li>Improve user feedback within the dashboard.</li>
      </ul>
    </div>
  `;
}
