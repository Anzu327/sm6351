import { basicSetup, EditorView } from "codemirror";
import { javascript } from "@codemirror/lang-javascript";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { StateEffect, StateField } from "@codemirror/state";
import { Decoration } from "@codemirror/view";
import { tags as t } from "@lezer/highlight";
import sourceCode from "../Visualizations/collapsibleTree.js?raw";
import data from "../data/globalEconomyByGDP.json";
import studentHtml from "../student-project/project/index.html?raw";
import studentCss from "../student-project/project/styles.css?raw";
import { createZip } from "./zip.js";
import "./styles.css";

const draftKey = "group5-tree-lab:draft:v2";
const vendorD3Url = new URL(`${import.meta.env.BASE_URL}vendor/d3.min.js`, location.href).href;
const taskMarkers = {
  color: ["// TASK 1 START", "// TASK 1 END"],
  spacing: ["// TASK 2 START", "// TASK 2 END"],
};
const taskSolutions = {
  color: `    // TASK 1 START: give all regional groups one shared color.
    const nodeFill = (d) => {
      if (d.depth === 0) return "#18345b";
      if (d.depth === 1) return "#355f9c";
      return "#ffffff";
    };
    // TASK 1 END`,
  spacing: `  // TASK 2 START: increase the up-and-down gap between nodes.
  layout.nodeSize([rowGap * 2, columnGap]);
  // TASK 2 END`,
};
// Keep every displayed excerpt tied to the editable source, including indentation.
function sourceExcerpt(start, end = start) {
  const from = sourceCode.indexOf(start);
  const to = sourceCode.indexOf(end, from);
  if (from < 0 || to < 0) throw new Error(`Walkthrough source not found: ${start}`);
  const lineStart = sourceCode.lastIndexOf("\n", from - 1) + 1;
  const lineEnd = sourceCode.indexOf("\n", to + end.length);
  return sourceCode.slice(lineStart, lineEnd < 0 ? sourceCode.length : lineEnd);
}
const lessonData = [
  {
    id: "hierarchy", number: "01", title: "Make the data into a tree",
    zh: "把巢狀資料變成樹狀結構。",
    parts: [{ label: "KEY LINE", start: "const root = d3.hierarchy(data).sum((d) => d.weight || 0);" }],
    words: [
      ["const root", "Stores the top node, World, under the name root.", "把最上層的 World 節點命名為 root。"],
      ["d3.hierarchy(data)", "Turns the GDP data into tree nodes.", "把 GDP 資料轉成樹的節點。"],
      [".sum", "Adds the shares below each group.", "加總每個分組之下的佔比。"],
      ["(d) =>", "Read as ‘for each data item d’ here.", "此處可理解為「對每個資料項目 d」。"],
      ["d.weight || 0", "Use an entry's share, or zero if it has none.", "使用項目的佔比；沒有數值時用 0。"],
    ],
    what: "This gives D3 the World → group → entry structure and totals the GDP shares for World and each group.",
    whatZh: "這行建立 World → 分組 → 項目的樹狀結構，並加總 World 和各分組的 GDP 佔比。",
    see: "World is at the start; Asia is one of the groups. Click Asia to reveal its entries.",
    seeZh: "World 在最前方，Asia 是其中一個分組；點擊 Asia 可看到組內項目。",
  },
  {
    id: "layout", number: "02", title: "Choose the spacing",
    zh: "決定節點排列得多疏或多密。",
    parts: [{ label: "KEY LINE", start: "const layout = d3.tree().nodeSize([rowGap, columnGap]);" }],
    words: [
      ["const layout", "Names the tree's spacing plan layout.", "把樹圖的排列方式命名為 layout。"],
      ["d3.tree()", "Asks D3 to arrange nodes as a tree.", "請 D3 把節點排成樹狀。"],
      ["nodeSize", "Sets the gap between nodes.", "設定節點之間的距離。"],
      ["rowGap", "Up-and-down gap.", "上下距離。"],
      ["columnGap", "Left-to-right gap.", "左右距離。"],
    ],
    what: "<code>rowGap</code> sets the up-and-down gap; <code>columnGap</code> sets the left-to-right gap.",
    whatZh: "<code>rowGap</code> 控制上下距離，<code>columnGap</code> 控制左右距離。",
    see: "Compare the spacing between World, Asia, and China in the preview.",
    seeZh: "在預覽中比較 World、Asia 和 China 之間的距離。",
  },
  {
    id: "appearance", number: "03", title: "Choose the group colors",
    zh: "決定地區分組的圓點顏色。",
    parts: [{ label: "COLOR RULE", start: "const nodeFill = (d) => {", end: "    };" }],
    words: [
      ["nodeFill", "The rule that chooses a circle's color.", "決定圓點顏色的規則。"],
      ["d.depth", "This node's level: 0 for World, 1 for a group.", "這個節點的層級：0 是 World，1 是分組。"],
      ["===", "Checks whether two values are equal.", "檢查兩個值是否相等。"],
      ["return", "Gives back the color to use.", "交回要使用的顏色。"],
      ["d.data.color", "The color saved for this group in the GDP data.", "GDP 資料中為這個分組儲存的顏色。"],
    ],
    what: "The middle rule reads each group's own color from the data. Task 1 replaces it with one fixed blue for all groups.",
    whatZh: "中間的一行讀取各分組資料中的顏色。練習 1 會把它改成所有分組共用的固定藍色。",
    see: "Asia is orange and North America is red now. After Task 1, both group circles are blue; entries stay white.",
    seeZh: "現在 Asia 是橙色、North America 是紅色；練習 1 後兩個分組圓點都變藍色，組內項目仍是白色。",
  },
  {
    id: "collapse", number: "04", title: "Open or close a group",
    zh: "點擊分組時，顯示或收起其中的項目。",
    parts: [{ label: "CLICK RULE", start: "if (d.children) {", end: "        update();" }],
    words: [
      ["if", "Do this when a condition is true.", "條件成立時執行這一段。"],
      ["else", "Otherwise, do the other action.", "否則執行另一段。"],
      ["children", "Entries currently visible under this node.", "目前顯示在此節點下的項目。"],
      ["_children", "Entries stored while the group is closed.", "分組收起時暫存的項目。"],
      ["null", "No visible entries in this property.", "這個欄位暫時沒有可見項目。"],
      ["update()", "Draw the current visible tree again.", "重新繪製目前可見的樹。"],
    ],
    what: "A click moves entries between the visible <code>children</code> and the stored <code>_children</code>. <code>update()</code> then refreshes the drawing.",
    whatZh: "點擊時，項目在可見的 <code>children</code> 與暫存的 <code>_children</code> 之間切換，再由 <code>update()</code> 更新畫面。",
    see: "Click Asia twice: its entries appear, then disappear. The Asia circle stays in place.",
    seeZh: "連續點擊 Asia 兩次：組內項目先出現、再消失；Asia 圓點仍保留。",
  },
];

const escapeHtml = (value) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

document.querySelector("#app").innerHTML = `
  <a class="skip-link" href="#main">Skip to content</a>
  <header class="hero">
    <div class="shell hero-inner">
      <div class="hero-top"><span>SM6351 · Wk6 Gp1 Tutorial</span><span>Interactive code walkthrough</span></div>
      <div class="hero-copy">
        <div>
          <h1>Collapsible<br><em>Node-Link Tree</em></h1>
          <p>From a nested GDP dataset to a working D3 visualization—then two small changes you can code yourself.</p>
        </div>
        <div class="hero-flow" aria-label="Learning path">
          <span>01 <strong>See the result</strong></span>
          <span>02 <strong>Explain the code</strong></span>
          <span>03 <strong>Edit it live</strong></span>
        </div>
      </div>
    </div>
  </header>
  <nav class="top-nav" aria-label="Page sections">
    <div class="shell nav-inner">
      <a href="#overview">Overview</a><a href="#walkthrough">Code walkthrough</a><a href="#practice">Live modifications</a><a href="#takeaways">Takeaways</a>
      <span class="nav-time">15-minute lab</span>
    </div>
  </nav>
  <main id="main" class="shell">
    <section id="overview" class="overview section">
      <div class="section-heading"><span class="section-index">01 / THE RESULT</span><h2>One dataset. Three levels. A tree you can open.</h2></div>
      <div class="overview-grid">
        <div class="intro-copy">
          <p>This <strong>collapsible node-link tree</strong> turns a nested GDP dataset into a hierarchy you can explore: <strong>World → Regional group → Country or region</strong>. Circles represent nodes, and connecting lines show which entries belong to each group.</p>
          <p>Each entry’s percentage is its share of <strong>world GDP</strong>. D3 adds these values to calculate group and World totals; the number in parentheses tells you how many immediate children a node contains. Color distinguishes regional groups, while circle size stays the same—it does not encode GDP.</p>
          <p>Start with the seven groups, then <strong>click a group to expand or collapse its entries</strong>. Drag the preview to move around the tree, or use Reset view to return to the starting view. In the live editor below, Task 1 gives all groups one shared color; Task 2 increases the vertical spacing. Press <strong>Run code</strong> to see each change.</p>
        </div>
        <aside class="overview-example" aria-labelledby="overview-example-title">
          <h3 id="overview-example-title">One path through the data</h3>
          <div class="data-diagram" aria-label="Example data hierarchy">
            <span class="data-node root">World <small>root</small></span>
            <span class="data-connector"></span>
            <span class="data-node continent">Asia <small>regional group · color</small></span>
            <span class="data-connector"></span>
            <span class="data-node country">China <small>country or region · 14.84%</small></span>
          </div>
          <p class="source-note">Historical GDP share snapshot, January 2017, from the <a href="https://gist.github.com/Kcnarf/fa95aa7b076f537c00aed614c29bb568" target="_blank" rel="noreferrer">source Gist</a>. These are historical figures. “Rest of the World” is an aggregate, and the listed shares total 99.97%.</p>
        </aside>
      </div>
      <div class="workspace" id="workspace">
        <div class="workspace-head">
          <div><span class="workspace-kicker">LIVE WORKSPACE</span><h3>Read, edit, run, observe.</h3></div>
          <div class="workspace-help" role="note"><span class="workspace-help-icon" aria-hidden="true">↘</span><span><strong>Click a regional group</strong><small>to expand countries and regions · 點擊地區分組展開國家和地區</small></span></div>
        </div>
        <div class="workbench">
          <div class="editor-pane">
            <div class="pane-toolbar editor-toolbar">
              <span class="traffic-lights" aria-hidden="true"><i></i><i></i><i></i></span>
              <span class="active-file-label" id="active-file-label">collapsibleTree.js <small>Editable</small></span>
              <span id="save-status">Source loaded</span>
            </div>
            <div class="editor-body">
              <nav class="file-tree" id="file-tree" aria-label="Project files">
                <div class="explorer-heading">EXPLORER <span>CLASSROOM PROJECT</span></div>
                <div class="file-group"><span class="folder-name">▾ project/ <small>3 main files</small></span>
                  <button type="button" class="file-entry active" data-file="js" aria-current="true"><span class="file-icon js-icon">JS</span><span class="file-name">collapsibleTree.js</span><small>Edit</small></button>
                  <button type="button" class="file-entry" data-file="html"><span class="file-icon html-icon">H</span><span class="file-name">index.html</span><small>Read only</small></button>
                  <button type="button" class="file-entry" data-file="css"><span class="file-icon css-icon">C</span><span class="file-name">styles.css</span><small>Read only</small></button>
                </div>
                <div class="file-group"><span class="folder-name">▾ data/ <small>GDP snapshot</small></span>
                  <button type="button" class="file-entry" data-file="json" title="globalEconomyByGDP.json · Read only"><span class="file-icon json-icon">{ }</span><span class="file-name">globalEconomyByGDP.json</span><small>Read only</small></button>
                </div>
                <p class="file-tree-note">ZIP also includes local D3 and a data loader for offline use.</p>
              </nav>
              <div id="sidebar-resizer" class="sidebar-resizer" role="separator" tabindex="0" aria-label="Resize file list" aria-controls="file-tree" aria-orientation="vertical" aria-valuemin="110" aria-valuemax="320" aria-valuenow="148" title="Drag to resize file list"></div>
              <div class="file-content">
                <div class="file-tabs" aria-label="Open files">
                  <button type="button" class="source-tab active" data-tab-file="js" aria-pressed="true"><span class="file-icon js-icon">JS</span> collapsibleTree.js</button>
                  <button type="button" class="source-tab" data-tab-file="html" aria-pressed="false"><span class="file-icon html-icon">H</span> index.html</button>
                  <button type="button" class="source-tab" data-tab-file="css" aria-pressed="false"><span class="file-icon css-icon">C</span> styles.css</button>
                  <button type="button" class="source-tab" data-tab-file="json" aria-pressed="false"><span class="file-icon json-icon">{ }</span> GDP data</button>
                </div>
                <div class="source-surface">
                  <div id="editor" aria-label="JavaScript code editor"></div>
                  <div id="code-minimap" class="code-minimap" role="scrollbar" tabindex="0" aria-label="Code overview" aria-controls="editor" aria-orientation="vertical" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" title="Click or drag to navigate the code">
                    <canvas aria-hidden="true"></canvas><div class="minimap-viewport" aria-hidden="true"></div>
                  </div>
                  <pre id="readonly-code" class="readonly-code" aria-label="Read-only file contents" hidden><code></code></pre>
                </div>
              </div>
            </div>
            <div class="editor-actions">
              <button class="button primary" id="run-button" type="button">Run code <span>⌘/Ctrl ↵</span></button>
              <button class="return-button" id="return-to-source" type="button" hidden><svg class="return-arrow" viewBox="0 0 44 52" aria-hidden="true" focusable="false"><g><path d="M15 3H29Q31 3 31 5V26Q31 28 33 28H39Q42 28 40 31L24 48Q22 50 20 48L4 31Q2 28 5 28H11Q13 28 13 26V5Q13 3 15 3Z" /></g></svg>← Back to where I was <span lang="zh-Hant">返回剛才的位置</span></button>
              <button class="button ghost" id="reset-button" type="button">Reset</button>
              <button class="button ghost" id="download-button" type="button">Export .js</button>
              <button class="button download-project" id="download-project-button" type="button">Download project ZIP</button>
            </div>
            <div class="editor-status"><span>JavaScript · D3 v7</span><span>Changes stay in this browser</span></div>
          </div>
          <div class="preview-pane">
            <div class="pane-toolbar preview-toolbar"><span class="preview-tab">Preview</span><span>World → group → country / region</span></div>
            <div class="preview-frame-wrap"><iframe id="preview" title="D3 tree preview" sandbox="allow-scripts"></iframe></div>
            <div class="preview-footer"><span id="run-status" role="status">Loading preview…</span><span>Hold left mouse button and drag · 按住左鍵拖動</span><button id="reset-main-view" type="button">Reset view</button></div>
          </div>
        </div>
        <pre id="error-box" class="error-box" role="alert" hidden></pre>
      </div>
    </section>

    <section id="walkthrough" class="section walkthrough">
      <div class="section-heading"><span class="section-index">02 / CODE WALKTHROUGH</span><h2>Four code ideas behind the tree.</h2><p>You do not need to read the whole program. Follow these four ideas, then try changing one line yourself.<span class="zh-translation" lang="zh-Hant">不需要讀懂整個程式；先看四個重點，再試著修改其中一行。</span></p></div>
      <div class="pipeline" aria-labelledby="pipeline-title">
        <div class="pipeline-heading"><span class="workspace-kicker">THE BIG PICTURE</span><h3 id="pipeline-title">How the tree appears</h3></div>
        <ol class="pipeline-steps">
          <li><span class="pipeline-step-number">01</span><strong>Data</strong><p>World contains groups such as Asia, and each group contains entries.</p><span class="pipeline-zh" lang="zh-Hant">World 包含 Asia 等分組，各分組再包含其他項目。</span></li>
          <li><span class="pipeline-step-number">02</span><strong>Position</strong><p>D3 decides where each visible circle goes.</p><span class="pipeline-zh" lang="zh-Hant">D3 決定每個可見圓點的位置。</span></li>
          <li><span class="pipeline-step-number">03</span><strong>Draw</strong><p>The positions become circles and connecting lines on the screen.</p><span class="pipeline-zh" lang="zh-Hant">畫面依照位置顯示圓點和連線。</span></li>
          <li><span class="pipeline-step-number">04</span><strong>Click</strong><p>Click Asia to show or hide its entries, then draw the tree again.</p><span class="pipeline-zh" lang="zh-Hant">點擊 Asia 可顯示或收起項目，樹圖隨即更新。</span></li>
        </ol>
      </div>
      <div class="lesson-list">
        ${lessonData.map((lesson) => `
          <article class="lesson" id="lesson-${lesson.id}">
            <div class="lesson-intro"><span class="lesson-number">${lesson.number}</span><div><h3>${lesson.title}</h3><p class="zh" lang="zh-Hant">${lesson.zh}</p></div></div>
            <div class="lesson-content">
              ${lesson.parts.map((part) => `<div class="code-example"><div class="code-example-head"><span>${part.label} · REAL SOURCE</span><button class="locate-button" type="button" data-focus="${lesson.id}"><span class="locate-target" aria-hidden="true">⌖</span> Locate in editor <span aria-hidden="true">↗</span></button></div><pre><code>${escapeHtml(sourceExcerpt(part.start, part.end))}</code></pre></div>`).join("")}
              <section class="code-words" aria-label="Key code words"><h4>Key code words <span lang="zh-Hant">程式碼詞語</span></h4><dl>${lesson.words.map(([term, meaning, meaningZh]) => `<div><dt><code>${escapeHtml(term)}</code></dt><dd>${escapeHtml(meaning)}<span lang="zh-Hant">${escapeHtml(meaningZh)}</span></dd></div>`).join("")}</dl></section>
              <div class="beginner-explain"><p><strong>What this does</strong> ${lesson.what}<span class="zh-translation" lang="zh-Hant">${lesson.whatZh}</span></p><p><strong>Look in the preview</strong> ${lesson.see}<span class="zh-translation" lang="zh-Hant">${lesson.seeZh}</span></p></div>
            </div>
          </article>`).join("")}
      </div>
    </section>

    <section id="practice" class="section practice">
      <div class="section-heading"><span class="section-index">03 / LIVE MODIFICATIONS</span><h2>Change one line. See what happens.</h2><p>Find the code, make the small change, and press Run code. Try it once to unlock the answer.</p></div>
      <div class="task-grid">
        <article class="task-card" id="task-color">
          <div class="task-top"><span class="task-number">TASK 01</span></div>
          <h3>Give regional groups one color</h3>
          <p class="task-goal"><strong>Goal</strong> Make all regional group circles the same blue.<span class="zh-translation" lang="zh-Hant">讓所有地區分組的圓點使用同一種藍色。</span></p>
          <ol class="task-steps">
            <li><strong>Find.</strong> Jump to <code>TASK 1</code> and find <code>d.data.color</code>.<span class="zh-translation" lang="zh-Hant">跳到 <code>TASK 1</code>，找到 <code>d.data.color</code>。</span></li>
            <li><strong>Change.</strong> Replace <code>d.data.color</code> with <code>"#355f9c"</code>, including the quotation marks.<span class="zh-translation" lang="zh-Hant">把 <code>d.data.color</code> 改成 <code>"#355f9c"</code>，記得保留引號。</span></li>
            <li><strong>Check.</strong> Run the code. Asia and North America should both be blue; entries stay white.<span class="zh-translation" lang="zh-Hant">執行後，Asia 和 North America 都應變成藍色；組內項目仍是白色。</span></li>
          </ol>
          <div class="task-actions"><button type="button" class="button task-jump" data-task-focus="color">Jump to TASK 1 code <span aria-hidden="true">↗</span></button><button type="button" class="button text-button" data-hint="color">Show hint</button></div>
          <p class="hint" id="hint-color" hidden>Use <code>if (d.depth === 1) return "#355f9c";</code>. The quotes make this a fixed color value.</p>
          <div class="task-visual"><div class="task-visual-head"><strong>Expected visual result</strong><span>One shared group color</span><button type="button" class="reset-example" data-reset-example="expected-color">Reset view</button></div><iframe id="expected-color" class="example-frame" title="Example of groups sharing one blue color" sandbox="allow-scripts"></iframe><p>Asia and North America are both blue. Scroll to zoom; drag to move the diagram.</p></div>
          <div class="answer-area"><button type="button" class="answer-toggle" data-reveal="color" disabled>Try editing and run once to unlock the answer</button><div id="answer-color" class="answer-content" hidden><pre><code>${escapeHtml(taskSolutions.color)}</code></pre><button type="button" class="button secondary" data-insert="color">Insert this task's code</button></div></div>
        </article>
        <article class="task-card" id="task-spacing">
          <div class="task-top"><span class="task-number">TASK 02</span></div>
          <h3>Give the nodes more vertical space</h3>
          <p class="task-goal"><strong>Goal</strong> Type one line to double the up-and-down gap between nodes.<span class="zh-translation" lang="zh-Hant">輸入一行程式碼，讓節點之間的上下距離加倍。</span></p>
          <ol class="task-steps">
            <li><strong>Find.</strong> Jump to <code>TASK 2</code> below <code>const layout = d3.tree().nodeSize([rowGap, columnGap]);</code>.<span class="zh-translation" lang="zh-Hant">跳到 <code>TASK 2</code>，位置就在樹圖布局程式碼下方。</span></li>
            <li><strong>Type.</strong> Add <code>layout.nodeSize([rowGap * 2, columnGap]);</code> between the task markers. <code>* 2</code> doubles the vertical gap.<span class="zh-translation" lang="zh-Hant">在任務標記之間輸入這一行；<code>* 2</code> 會把上下距離加倍。</span></li>
            <li><strong>Check.</strong> Run the code and compare the vertical spacing. The circles stay the same size.<span class="zh-translation" lang="zh-Hant">執行後比較節點的上下距離；圓點大小維持不變。</span></li>
          </ol>
          <div class="task-actions"><button type="button" class="button task-jump" data-task-focus="spacing">Jump to TASK 2 code <span aria-hidden="true">↗</span></button><button type="button" class="button text-button" data-hint="spacing">Show hint</button></div>
          <p class="hint" id="hint-spacing" hidden>Copy the <code>nodeSize</code> idea from the layout line above. Start with <code>layout.nodeSize</code>.</p>
          <div class="task-visual"><div class="task-visual-head"><strong>Expected visual result</strong><span>More vertical space</span><button type="button" class="reset-example" data-reset-example="expected-spacing">Reset view</button></div><iframe id="expected-spacing" class="example-frame" title="Example of tree with larger vertical gaps" sandbox="allow-scripts"></iframe><p>The nodes are farther apart vertically, and the regional groups remain blue. Scroll to zoom; drag to move the diagram.</p></div>
          <div class="answer-area"><button type="button" class="answer-toggle" data-reveal="spacing" disabled>Try editing and run once to unlock the answer</button><div id="answer-spacing" class="answer-content" hidden><pre><code>${escapeHtml(taskSolutions.spacing)}</code></pre><button type="button" class="button secondary" data-insert="spacing">Insert this task's code</button></div></div>
        </article>
      </div>
    </section>

    <section id="takeaways" class="section takeaways"><span class="section-index">04 / TAKEAWAYS</span><h2>Data → position → draw → click.</h2><p>When you click a group, the tree shows or hides its entries and draws the visible result again.</p><p class="source-note">Source: <a href="https://gist.github.com/Kcnarf/fa95aa7b076f537c00aed614c29bb568" target="_blank" rel="noreferrer">Global Economy by GDP Gist</a> · <a href="https://d3js.org/d3-hierarchy/hierarchy" target="_blank" rel="noreferrer">D3 hierarchy reference</a> · <a href="https://d3js.org/d3-hierarchy/tree" target="_blank" rel="noreferrer">D3 tree reference</a></p></section>
  </main>
  <footer class="footer"><div class="shell">SM6351 · Wk6 Gp1 Tutorial · Historical dataset: January 2017</div></footer>
`;

// Connect explained code terms to the same terms in each source excerpt.
for (const lesson of document.querySelectorAll(".lesson")) {
  const chips = [...lesson.querySelectorAll(".code-words code, .beginner-explain code")];
  const code = lesson.querySelector(".code-example pre code");
  const source = code.textContent;
  const tokens = [...new Set(chips.map((chip) => chip.textContent))]
    .filter((token) => source.includes(token))
    .sort((a, b) => b.length - a.length);
  if (!tokens.length) continue;
  const escapePattern = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`(?<![\\w$])(?:${tokens.map(escapePattern).join("|")})(?![\\w$])`, "g");
  const fragment = document.createDocumentFragment();
  let last = 0;
  for (const match of source.matchAll(pattern)) {
    fragment.append(document.createTextNode(source.slice(last, match.index)));
    const span = document.createElement("span");
    span.className = "snippet-token";
    span.dataset.codeToken = match[0];
    span.textContent = match[0];
    fragment.append(span);
    last = match.index + match[0].length;
  }
  fragment.append(document.createTextNode(source.slice(last)));
  code.replaceChildren(fragment);
  const matches = [...code.querySelectorAll(".snippet-token")];
  for (const chip of chips) {
    const token = chip.textContent;
    if (!matches.some((match) => match.dataset.codeToken === token)) continue;
    chip.classList.add("code-chip-linked");
    chip.tabIndex = 0;
    const setActive = (active) => {
      chip.classList.toggle("is-active", active);
      for (const match of matches) {
        if (match.dataset.codeToken === token) match.classList.toggle("is-highlighted", active);
      }
    };
    chip.addEventListener("pointerenter", () => setActive(true));
    chip.addEventListener("pointerleave", () => setActive(false));
    chip.addEventListener("focus", () => setActive(true));
    chip.addEventListener("blur", () => setActive(false));
  }
}

function region(code, task) {
  const [startMarker, endMarker] = taskMarkers[task];
  const start = code.indexOf(startMarker);
  const end = code.indexOf(endMarker, start + startMarker.length);
  if (start < 0 || end < 0) return null;
  return code.slice(start, end + endMarker.length);
}

let savedDraft = "";
try { savedDraft = localStorage.getItem(draftKey) || ""; } catch (_) {}
// Update the unchanged label line in older browser drafts without discarding student edits.
const oldLabelLine = '.text((d) => d.depth === 0 ? "World" : d.data.name)';
const clarifiedLabelLine = '.text((d) => d.depth === 0 ? "World" : d.data.code === "HK" ? "Hong Kong SAR, China" : d.data.name)';
if (savedDraft.includes(oldLabelLine)) savedDraft = savedDraft.replace(oldLabelLine, clarifiedLabelLine);
const currentLabelBlock = `      .text((d) => {
        const name = d.depth === 0 ? "World" : d.data.code === "HK" ? "Hong Kong SAR, China" : d.data.name;
        const count = d.depth < 2 ? \` (\${(d.children || d._children).length})\` : "";
        return \`\${name} \${d.value.toFixed(2)}%\${count}\`;
      })`;
if (savedDraft.includes(clarifiedLabelLine)) savedDraft = savedDraft.replace(clarifiedLabelLine, currentLabelBlock.trimStart());
if (savedDraft.includes("const root = d3.hierarchy(data);")) {
  savedDraft = savedDraft.replace("const root = d3.hierarchy(data);", "const root = d3.hierarchy(data).sum((d) => d.weight || 0);");
}
// Keep student edits while moving the old tasks to their new locations.
if (savedDraft.includes("// TASK 1 START: make the horizontal gap four times the row gap.")) {
  savedDraft = savedDraft.replace(
    /^[ \t]*\/\/ TASK 1 START: make the horizontal gap four times the row gap\.\r?\n([\s\S]*?)\r?\n[ \t]*\/\/ TASK 1 END/m,
    (_match, existingCode) => existingCode,
  );
}
// Older drafts began with fixed blue; update only that unchanged rule.
if (savedDraft.includes("// TASK 2 START: read each regional group's color from its data.")) {
  savedDraft = savedDraft.replace(
    "// TASK 2 START: read each regional group's color from its data.",
    "// TASK 2 START: give all regional groups one shared color.",
  ).replace(
    'if (d.depth === 1) return "#355f9c";',
    "if (d.depth === 1) return d.data.color;",
  );
}
savedDraft = savedDraft.replace(
  /^[ \t]*\/\/ TASK 1 START: make every node circle larger\.\r?\n([\s\S]*?)\r?\n[ \t]*\/\/ TASK 1 END/m,
  (_match, existingCode) => existingCode,
);
if (savedDraft.includes("// TASK 2 START: give all regional groups one shared color.")) {
  savedDraft = savedDraft.replace(
    "// TASK 2 START: give all regional groups one shared color.",
    "// TASK 1 START: give all regional groups one shared color.",
  ).replace("// TASK 2 END", "// TASK 1 END");
}
if (savedDraft && !savedDraft.includes("// TASK 2 START: increase the up-and-down gap between nodes.")) {
  savedDraft = savedDraft.replace(
    /^(\s*const layout = d3\.tree\(\)\.nodeSize\([^\n]+\);)\r?$/m,
    "$1\n  // TASK 2 START: increase the up-and-down gap between nodes.\n  // Type one line here, using the layout above as a guide.\n  // TASK 2 END",
  );
}
let saveTimer;
const setLocateHighlight = StateEffect.define();
const locateHighlightField = StateField.define({
  create: () => Decoration.none,
  update(value, transaction) {
    value = value.map(transaction.changes);
    for (const effect of transaction.effects) {
      if (effect.is(setLocateHighlight)) value = effect.value;
    }
    return value;
  },
  provide: (field) => EditorView.decorations.from(field),
});
const editorHighlight = HighlightStyle.define([
  { tag: t.comment, color: "#8da9a5" },
  { tag: [t.keyword, t.controlKeyword, t.definitionKeyword], color: "#c9a7f7" },
  { tag: [t.string, t.special(t.string)], color: "#b8df9d" },
  { tag: [t.number, t.bool, t.null], color: "#f5be84" },
  { tag: [t.variableName, t.definition(t.variableName), t.propertyName], color: "#e8f0ff" },
  { tag: t.function(t.variableName), color: "#8bc8ff" },
  { tag: [t.operator, t.punctuation], color: "#b8cbe3" },
]);
const minimap = document.querySelector("#code-minimap");
const minimapCanvas = minimap.querySelector("canvas");
const minimapViewport = minimap.querySelector(".minimap-viewport");
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
let locateFrame = 0;
let locateGeneration = 0;
let locateTimer;
const editor = new EditorView({
  doc: savedDraft || sourceCode,
  extensions: [
    basicSetup,
    javascript(),
    locateHighlightField,
    syntaxHighlighting(editorHighlight),
    EditorView.lineWrapping,
    EditorView.theme({
      "&": { backgroundColor: "#131e2c", color: "#e8effa", height: "100%" },
      ".cm-content": { caretColor: "#a5c6ff", fontFamily: "SFMono-Regular, Consolas, monospace", fontSize: "15px", lineHeight: "1.65" },
      ".cm-gutters": { backgroundColor: "#172436", color: "#71839b", border: "none" },
      // The selection layer sits behind the text, so line backgrounds must stay translucent.
      ".cm-activeLine": { backgroundColor: "rgba(91, 133, 190, 0.16)" },
      ".cm-activeLineGutter": { backgroundColor: "#203249" },
      "&.cm-focused .cm-cursor": { borderLeftColor: "#a5c6ff" },
      ".cm-selectionBackground": { backgroundColor: "#304563" },
      "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground": { backgroundColor: "#31558b" },
      ".cm-content ::selection": { backgroundColor: "#31558b" },
    }, { dark: true }),
    EditorView.updateListener.of((update) => {
      if (!update.docChanged) return;
      cancelLocateAnimation();
      scheduleMinimapDraw();
      document.querySelector("#save-status").textContent = "Saving…";
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        try {
          localStorage.setItem(draftKey, editor.state.doc.toString());
          document.querySelector("#save-status").textContent = "Saved in this browser";
        } catch (_) {
          document.querySelector("#save-status").textContent = "Local save unavailable";
        }
      }, 300);
    }),
    EditorView.domEventHandlers({
      keydown(event) {
        if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
          event.preventDefault();
          runCode();
          return true;
        }
        return false;
      },
    }),
  ],
  parent: document.querySelector("#editor"),
});
const scroller = editor.scrollDOM;
const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));

function cancelLocateAnimation() {
  locateGeneration++;
  if (locateFrame) cancelAnimationFrame(locateFrame);
  locateFrame = 0;
}

function updateMinimapViewport() {
  if (minimap.hidden || !minimap.clientHeight) return;
  const maximum = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
  const height = minimap.clientHeight;
  const viewportHeight = maximum ? Math.max(18, height * scroller.clientHeight / scroller.scrollHeight) : height;
  const top = maximum ? (height - viewportHeight) * scroller.scrollTop / maximum : 0;
  minimapViewport.style.height = `${viewportHeight}px`;
  minimapViewport.style.top = `${top}px`;
  minimap.setAttribute("aria-valuenow", String(maximum ? Math.round(scroller.scrollTop / maximum * 100) : 0));
  const first = editor.state.doc.lineAt(editor.lineBlockAtHeight(scroller.scrollTop).from).number;
  const last = editor.state.doc.lineAt(editor.lineBlockAtHeight(Math.min(editor.contentHeight, scroller.scrollTop + scroller.clientHeight)).from).number;
  minimap.setAttribute("aria-valuetext", `Lines ${first}–${last} of ${editor.state.doc.lines}`);
}

let minimapDrawFrame = 0;
function scheduleMinimapDraw() {
  if (minimapDrawFrame) return;
  minimapDrawFrame = requestAnimationFrame(() => {
    minimapDrawFrame = 0;
    if (minimap.hidden || !minimap.clientWidth || !minimap.clientHeight) return;
    const width = minimap.clientWidth;
    const height = minimap.clientHeight;
    const ratio = Math.min(devicePixelRatio || 1, 2);
    minimapCanvas.width = Math.round(width * ratio);
    minimapCanvas.height = Math.round(height * ratio);
    const context = minimapCanvas.getContext("2d");
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, width, height);
    context.font = "3.5px SFMono-Regular, Consolas, monospace";
    context.textBaseline = "middle";
    const documentHeight = Math.max(editor.contentHeight, 1);
    const lineStep = Math.max(1, Math.ceil(editor.state.doc.lines / 2000));
    for (let lineNumber = 1; lineNumber <= editor.state.doc.lines; lineNumber += lineStep) {
      const line = editor.state.doc.line(lineNumber);
      const block = editor.lineBlockAt(line.from);
      const y = (block.top + block.height / 2) / documentHeight * height;
      if (y < 0 || y > height) continue;
      const indent = line.text.length - line.text.trimStart().length;
      const code = line.text.trimStart();
      const x = Math.min(width - 8, 5 + indent * 1.5);
      context.fillStyle = code.startsWith("//") || code.startsWith("/*") || code.startsWith("*")
        ? "#7da9a1" : /^(const|let|if|return|function|else)\b/.test(code)
          ? "#c5a5e8" : /["']/.test(code) ? "#a8d59a" : "#a9c8ec";
      context.fillText(code, x, y, Math.max(1, width - x - 5));
    }
    updateMinimapViewport();
  });
}

let minimapViewportFrame = 0;
scroller.addEventListener("scroll", () => {
  if (minimapViewportFrame) return;
  minimapViewportFrame = requestAnimationFrame(() => {
    minimapViewportFrame = 0;
    updateMinimapViewport();
  });
});
for (const eventName of ["wheel", "touchstart", "pointerdown"]) {
  scroller.addEventListener(eventName, cancelLocateAnimation, { passive: true });
}
scroller.addEventListener("keydown", (event) => {
  if (["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", "Escape"].includes(event.key)) cancelLocateAnimation();
});
new ResizeObserver(scheduleMinimapDraw).observe(minimap);
new ResizeObserver(scheduleMinimapDraw).observe(editor.dom);
scheduleMinimapDraw();

let minimapGrabOffset = 0;
function scrollFromMinimap(clientY) {
  const bounds = minimap.getBoundingClientRect();
  const viewportHeight = minimapViewport.getBoundingClientRect().height;
  const maximum = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
  const travel = Math.max(1, bounds.height - viewportHeight);
  const thumbTop = clamp(clientY - bounds.top - minimapGrabOffset, 0, travel);
  scroller.scrollTop = thumbTop / travel * maximum;
  updateMinimapViewport();
}
minimap.addEventListener("pointerdown", (event) => {
  if (event.button !== 0) return;
  cancelLocateAnimation();
  const bounds = minimap.getBoundingClientRect();
  const thumb = minimapViewport.getBoundingClientRect();
  minimapGrabOffset = event.clientY >= thumb.top && event.clientY <= thumb.bottom
    ? event.clientY - thumb.top : thumb.height / 2;
  minimap.setPointerCapture(event.pointerId);
  scrollFromMinimap(event.clientY);
  event.preventDefault();
});
minimap.addEventListener("pointermove", (event) => {
  if (minimap.hasPointerCapture(event.pointerId)) scrollFromMinimap(event.clientY);
});
minimap.addEventListener("pointerup", (event) => {
  if (minimap.hasPointerCapture(event.pointerId)) minimap.releasePointerCapture(event.pointerId);
});
minimap.addEventListener("pointercancel", (event) => {
  if (minimap.hasPointerCapture(event.pointerId)) minimap.releasePointerCapture(event.pointerId);
});
minimap.addEventListener("keydown", (event) => {
  const maximum = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
  const step = editor.defaultLineHeight;
  const moves = { ArrowUp: -step, ArrowDown: step, PageUp: -scroller.clientHeight * .8, PageDown: scroller.clientHeight * .8 };
  if (!(event.key in moves) && event.key !== "Home" && event.key !== "End") return;
  event.preventDefault();
  cancelLocateAnimation();
  scroller.scrollTop = event.key === "Home" ? 0 : event.key === "End" ? maximum : clamp(scroller.scrollTop + moves[event.key], 0, maximum);
  updateMinimapViewport();
});

const readOnlyFiles = {
  html: { name: "index.html", content: studentHtml },
  css: { name: "styles.css", content: studentCss },
  json: { name: "globalEconomyByGDP.json", content: JSON.stringify(data, null, 2) },
};
let editorScrollTop = 0;
function selectFile(file) {
  cancelLocateAnimation();
  const isJavaScript = file === "js";
  const editorElement = document.querySelector("#editor");
  const wasVisible = !editorElement.hidden;
  if (wasVisible && !isJavaScript) editorScrollTop = editor.scrollDOM.scrollTop;
  editorElement.hidden = !isJavaScript;
  if (isJavaScript && !wasVisible) {
    requestAnimationFrame(() => {
      editor.scrollDOM.scrollTop = editorScrollTop;
      editor.requestMeasure();
      scheduleMinimapDraw();
    });
  }
  minimap.hidden = !isJavaScript;
  const readOnly = document.querySelector("#readonly-code");
  readOnly.hidden = isJavaScript;
  if (!isJavaScript) readOnly.querySelector("code").textContent = readOnlyFiles[file].content;
  document.querySelector("#active-file-label").innerHTML = isJavaScript
    ? "collapsibleTree.js <small>Editable</small>"
    : `${readOnlyFiles[file].name} <small>Read only</small>`;
  document.querySelectorAll(".file-entry").forEach((entry) => {
    const active = entry.dataset.file === file;
    entry.classList.toggle("active", active);
    if (active) entry.setAttribute("aria-current", "true");
    else entry.removeAttribute("aria-current");
  });
  document.querySelectorAll(".source-tab").forEach((tab) => {
    const active = tab.dataset.tabFile === file;
    tab.classList.toggle("active", active);
    tab.setAttribute("aria-pressed", String(active));
  });
}
document.querySelectorAll(".file-entry").forEach((entry) => {
  entry.addEventListener("click", () => selectFile(entry.dataset.file));
});
document.querySelectorAll(".source-tab").forEach((tab) => {
  tab.addEventListener("click", () => selectFile(tab.dataset.tabFile));
});
const editorBody = document.querySelector(".editor-body");
const sidebarResizer = document.querySelector("#sidebar-resizer");
let sidebarWidth = 148;
function setSidebarWidth(width) {
  const maximum = Math.max(110, Math.min(320, editorBody.clientWidth - 280));
  sidebarWidth = Math.max(110, Math.min(maximum, Math.round(width)));
  editorBody.style.setProperty("--sidebar-width", `${sidebarWidth}px`);
  sidebarResizer.setAttribute("aria-valuenow", String(sidebarWidth));
  sidebarResizer.setAttribute("aria-valuemax", String(maximum));
  editor.requestMeasure();
}
sidebarResizer.addEventListener("pointerdown", (event) => {
  if (event.button !== 0) return;
  sidebarResizer.setPointerCapture(event.pointerId);
  editorBody.classList.add("is-resizing");
  setSidebarWidth(event.clientX - editorBody.getBoundingClientRect().left);
});
sidebarResizer.addEventListener("pointermove", (event) => {
  if (!sidebarResizer.hasPointerCapture(event.pointerId)) return;
  setSidebarWidth(event.clientX - editorBody.getBoundingClientRect().left);
});
function endSidebarResize(event) {
  if (sidebarResizer.hasPointerCapture(event.pointerId)) sidebarResizer.releasePointerCapture(event.pointerId);
  editorBody.classList.remove("is-resizing");
}
sidebarResizer.addEventListener("pointerup", endSidebarResize);
sidebarResizer.addEventListener("pointercancel", endSidebarResize);
sidebarResizer.addEventListener("keydown", (event) => {
  if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
  event.preventDefault();
  setSidebarWidth(sidebarWidth + (event.key === "ArrowRight" ? 10 : -10));
});
new ResizeObserver(() => setSidebarWidth(sidebarWidth)).observe(editorBody);

function setCode(next) {
  editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: next } });
}
const returnButton = document.querySelector("#return-to-source");
let returnTarget = null;
let returnArrowTimer = 0;
function clearReturnArrow() {
  clearTimeout(returnArrowTimer);
  returnArrowTimer = 0;
  returnButton.classList.remove("show-return-arrow");
}
returnButton.addEventListener("click", () => {
  if (!returnTarget) return;
  const { button, scrollY } = returnTarget;
  returnTarget = null;
  clearReturnArrow();
  returnButton.hidden = true;
  button.focus({ preventScroll: true });
  window.scrollTo({ top: scrollY, behavior: "instant" });
});
function focusText(token, endToken = token, originButton = null) {
  const originScrollY = window.scrollY;
  selectFile("js");
  const source = editor.state.doc.toString();
  const start = source.indexOf(token);
  if (start < 0) {
    showError(`Could not find “${token}” in the current code. Reset the source or locate the line manually.`);
    return false;
  }
  if (originButton) {
    clearReturnArrow();
    returnTarget = { button: originButton, scrollY: originScrollY };
    returnButton.hidden = false;
  }
  const endStart = source.indexOf(endToken, start);
  const end = endStart >= 0 ? endStart + endToken.length : start + token.length;
  const firstLine = editor.state.doc.lineAt(start).number;
  const lastLine = editor.state.doc.lineAt(Math.max(start, end - 1)).number;
  const decorations = [];
  for (let lineNumber = firstLine; lineNumber <= lastLine; lineNumber++) {
    decorations.push(Decoration.line({ attributes: { class: "cm-locate-line" } }).range(editor.state.doc.line(lineNumber).from));
  }
  decorations.push(Decoration.mark({ class: "cm-locate-token" }).range(start, Math.min(end, start + token.length)));
  clearTimeout(locateTimer);
  document.querySelector("#workspace").scrollIntoView({ behavior: "instant", block: "start" });
  if (originButton) {
    const buttonBottom = returnButton.getBoundingClientRect().bottom;
    if (buttonBottom > innerHeight - 12) window.scrollBy({ top: buttonBottom - innerHeight + 12, behavior: "instant" });
  }
  editor.dispatch({ effects: setLocateHighlight.of(Decoration.set(decorations, true)) });
  const clearHighlight = () => editor.dispatch({ effects: setLocateHighlight.of(Decoration.none) });
  locateTimer = setTimeout(clearHighlight, 4200);
  const generation = locateGeneration;
  const arrowTarget = originButton ? returnTarget : null;
  const targetScrollTop = () => {
    const block = editor.lineBlockAt(start);
    const center = block.top + editor.documentPadding.top - (scroller.clientHeight - block.height) / 2;
    return clamp(center, 0, Math.max(0, scroller.scrollHeight - scroller.clientHeight));
  };
  requestAnimationFrame(() => {
    if (generation !== locateGeneration) return;
    const initial = scroller.scrollTop;
    const target = targetScrollTop();
    const finish = () => {
      if (generation !== locateGeneration) return;
      locateFrame = 0;
      scroller.scrollTop = targetScrollTop();
      editor.dispatch({ selection: { anchor: start }, effects: EditorView.scrollIntoView(start, { y: "center" }) });
      editor.contentDOM.focus({ preventScroll: true });
      if (arrowTarget && returnTarget === arrowTarget && !returnButton.hidden) {
        returnArrowTimer = setTimeout(() => {
          returnArrowTimer = 0;
          if (generation === locateGeneration && returnTarget === arrowTarget && !returnButton.hidden) {
            returnButton.classList.add("show-return-arrow");
          }
        }, 2000);
      }
      clearTimeout(locateTimer);
      locateTimer = setTimeout(clearHighlight, 3600);
    };
    if (reducedMotion.matches || Math.abs(target - initial) < 4) {
      finish();
      return;
    }
    const startTime = performance.now();
    const step = (now) => {
      if (generation !== locateGeneration) return;
      const progress = Math.min(1, (now - startTime) / 500);
      const eased = 1 - (1 - progress) ** 3;
      scroller.scrollTop = initial + (target - initial) * eased;
      if (progress < 1) locateFrame = requestAnimationFrame(step);
      else finish();
    };
    locateFrame = requestAnimationFrame(step);
  });
  return true;
}
function showError(message) {
  const box = document.querySelector("#error-box");
  box.hidden = false;
  box.textContent = message;
  document.querySelector("#run-status").textContent = "Code needs attention";
}
function clearError() {
  const box = document.querySelector("#error-box");
  box.hidden = true;
  box.textContent = "";
}

const attempted = { color: false, spacing: false };
let currentFrame;
let runCount = 0;
function previewDocument(compact = false) {
  return `<!doctype html><html lang="en"><head><meta charset="UTF-8"><style>
    html,body{margin:0;height:100%;overflow:hidden;background:#fff;font-family:Inter,ui-sans-serif,system-ui,sans-serif;color:#203452}
    #chart{width:100%;height:100%}
    svg{display:block;width:100%;height:100%;cursor:grab;touch-action:none}svg:active{cursor:grabbing}.link{fill:none;stroke:#b7c8dc;stroke-width:1.7}
    .node circle{stroke:#355f9c;stroke-width:2;transition:fill .15s}
    .node text{font-size:13px;fill:#203452;pointer-events:none}
    .node.expandable{cursor:pointer}.node.expandable:hover circle{stroke:#0b61df;stroke-width:3}
    .node:not(.expandable) circle{stroke:#6f89ab}
  </style><script src="${vendorD3Url}"></script></head><body>
    <div id="chart"></div>
    <script>
      let resetExampleView;
      let resetMainView;
      function setupMainDrag() {
        const chart = document.querySelector("#chart");
        const svg = document.querySelector("#chart svg");
        const stage = svg.querySelector("g");
        const viewport = document.createElementNS("http://www.w3.org/2000/svg", "g");
        svg.insertBefore(viewport, stage);
        viewport.appendChild(stage);
        const zoom = d3.zoom()
          .filter((event) => event.type === "mousedown" && event.button === 0)
          .clickDistance(5)
          .on("zoom", (event) => viewport.setAttribute("transform", event.transform.toString()));
        d3.select(svg).call(zoom).on("dblclick.zoom", null);
        const fit = () => {
          const width = chart.clientWidth;
          const height = chart.clientHeight;
          if (!width || !height) return;
          svg.removeAttribute("width");
          svg.removeAttribute("height");
          svg.setAttribute("viewBox", "0 0 " + width + " " + height);
          const bounds = viewport.getBBox();
          const padding = 24;
          const scale = Math.min(1, (width - padding * 2) / bounds.width, (height - padding * 2) / bounds.height);
          const x = (width - bounds.width * scale) / 2 - bounds.x * scale;
          const y = (height - bounds.height * scale) / 2 - bounds.y * scale;
          d3.select(svg).call(zoom.transform, d3.zoomIdentity.translate(x, y).scale(scale));
        };
        resetMainView = fit;
        new ResizeObserver(fit).observe(chart);
        new MutationObserver(() => {
          if (svg.hasAttribute("height") || svg.getAttribute("viewBox") !== "0 0 " + chart.clientWidth + " " + chart.clientHeight) fit();
        }).observe(svg, { attributes: true, attributeFilter: ["height", "viewBox"] });
        fit();
      }
      function setupExampleView() {
        const chart = document.querySelector("#chart");
        const svg = chart.querySelector("svg");
        const stage = svg.querySelector("g");
        const viewport = document.createElementNS("http://www.w3.org/2000/svg", "g");
        svg.insertBefore(viewport, stage);
        viewport.appendChild(stage);
        svg.removeAttribute("width");
        svg.removeAttribute("height");
        const zoom = d3.zoom().on("zoom", (event) => viewport.setAttribute("transform", event.transform.toString()));
        d3.select(svg).call(zoom).on("dblclick.zoom", null);
        const fit = () => {
          const width = chart.clientWidth;
          const height = chart.clientHeight;
          if (!width || !height) return;
          svg.setAttribute("viewBox", "0 0 " + width + " " + height);
          const bounds = viewport.getBBox();
          const padding = 28;
          const scale = Math.min((width - padding * 2) / bounds.width, (height - padding * 2) / bounds.height);
          const x = (width - bounds.width * scale) / 2 - bounds.x * scale;
          const y = (height - bounds.height * scale) / 2 - bounds.y * scale;
          zoom.scaleExtent([scale * 0.5, scale * 5]);
          d3.select(svg).call(zoom.transform, d3.zoomIdentity.translate(x, y).scale(scale));
        };
        resetExampleView = fit;
        new ResizeObserver(fit).observe(chart);
        fit();
      }
      addEventListener("message", (event) => {
        if (event.data?.type === "reset-view") { resetExampleView?.(); return; }
        if (event.data?.type === "reset-main-view") { resetMainView?.(); return; }
        if (!event.data || event.data.type !== "run") return;
        try {
          if (!window.d3) throw new Error("Local D3 library did not load.");
          new Function("d3", "data", "container", event.data.code)(
            window.d3, event.data.dataset, document.querySelector("#chart")
          );
          for (const name of event.data.expand || []) {
            const node = [...document.querySelectorAll("g.node")]
              .find((item) => item.__data__?.data.name === name);
            node?.dispatchEvent(new MouseEvent("click", {bubbles: true}));
          }
          if (${compact}) setupExampleView();
          else setupMainDrag();
          parent.postMessage({type:"preview-result", id:event.data.id, ok:true}, "*");
        } catch (error) {
          parent.postMessage({type:"preview-result", id:event.data.id, ok:false, message: String(error.stack || error)}, "*");
        }
      });
    <\/script></body></html>`;
}
function mountExpectedPreviews() {
  const demoData = {
    name: "world",
    children: [
      { ...data.children[0], children: data.children[0].children.slice(0, 2) },
      { ...data.children[1], children: data.children[1].children.slice(0, 2) },
    ],
  };
  const colorCode = sourceCode.replace(region(sourceCode, "color"), taskSolutions.color);
  const spacingCode = colorCode.replace(region(colorCode, "spacing"), taskSolutions.spacing);
  for (const [id, code] of [["expected-color", colorCode], ["expected-spacing", spacingCode]]) {
    const frame = document.querySelector(`#${id}`);
    frame.srcdoc = previewDocument(true);
    frame.addEventListener("load", () => {
      frame.contentWindow.postMessage({
        type: "run",
        id,
        code,
        dataset: demoData,
        expand: ["Asia", "North America"],
      }, "*");
    }, { once: true });
  }
}
document.querySelectorAll("[data-reset-example]").forEach((button) => button.addEventListener("click", () => {
  document.querySelector(`#${button.dataset.resetExample}`).contentWindow?.postMessage({ type: "reset-view" }, "*");
}));
document.querySelector("#reset-main-view").addEventListener("click", () => {
  currentFrame?.contentWindow?.postMessage({ type: "reset-main-view" }, "*");
});
function runCode() {
  const code = editor.state.doc.toString();
  for (const task of Object.keys(attempted)) {
    if (region(code, task) !== null && region(code, task) !== region(sourceCode, task)) {
      attempted[task] = true;
      const reveal = document.querySelector(`[data-reveal="${task}"]`);
      reveal.disabled = false;
      reveal.textContent = "View answer and one-click insert";
    }
  }
  clearError();
  document.querySelector("#run-status").textContent = "Running…";
  const frame = document.createElement("iframe");
  frame.title = "D3 tree preview";
  frame.id = "preview";
  frame.setAttribute("sandbox", "allow-scripts");
  frame.srcdoc = previewDocument();
  const old = document.querySelector("#preview");
  old.replaceWith(frame);
  currentFrame = frame;
  const id = ++runCount;
  frame.addEventListener("load", () => {
    frame.contentWindow.postMessage({ type: "run", id, code, dataset: data }, "*");
  }, { once: true });
}
window.addEventListener("message", (event) => {
  if (!currentFrame || event.source !== currentFrame.contentWindow) return;
  if (event.data?.type !== "preview-result" || event.data.id !== runCount) return;
  if (event.data.ok) {
    document.querySelector("#run-status").textContent = "Preview ready · click a regional group";
    clearError();
  } else {
    showError(event.data.message);
  }
});

document.querySelector("#run-button").addEventListener("click", runCode);
document.querySelector("#reset-button").addEventListener("click", () => {
  if (!confirm("Reset the entire editor to the original source? Your current browser draft will be cleared.")) return;
  setCode(sourceCode);
  clearTimeout(saveTimer);
  try { localStorage.removeItem(draftKey); } catch (_) {}
  document.querySelector("#save-status").textContent = "Source restored";
  for (const task of Object.keys(attempted)) {
    attempted[task] = false;
    const reveal = document.querySelector(`[data-reveal="${task}"]`);
    reveal.disabled = true;
    reveal.textContent = "Try editing and run once to unlock the answer";
    document.querySelector(`#answer-${task}`).hidden = true;
  }
  runCode();
});
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
document.querySelector("#download-button").addEventListener("click", () => {
  const blob = new Blob([editor.state.doc.toString()], { type: "text/javascript;charset=utf-8" });
  downloadBlob(blob, "collapsibleTree.js");
});
document.querySelector("#download-project-button").addEventListener("click", async () => {
  const button = document.querySelector("#download-project-button");
  button.disabled = true;
  button.textContent = "Preparing ZIP…";
  try {
    const response = await fetch(`${import.meta.env.BASE_URL}vendor/d3.min.js`);
    if (!response.ok) throw new Error("Could not load the local D3 library.");
    const d3Bundle = new Uint8Array(await response.arrayBuffer());
    const json = JSON.stringify(data, null, 2);
    const files = {
      "project/index.html": studentHtml,
      "project/styles.css": studentCss,
      "project/collapsibleTree.js": editor.state.doc.toString(),
      "data/globalEconomyByGDP.json": `${json}\n`,
      "data/globalEconomyByGDP.js": `// Offline browser loader generated from globalEconomyByGDP.json.\nwindow.globalEconomyData = ${json};\n`,
      "vendor/d3.min.js": d3Bundle,
    };
    downloadBlob(createZip(files), "collapsible-gdp-tree.zip");
  } catch (error) {
    showError(`Project download failed: ${error.message}`);
  } finally {
    button.disabled = false;
    button.textContent = "Download project ZIP";
  }
});
document.querySelectorAll("[data-focus]").forEach((button) => button.addEventListener("click", () => {
  const lesson = lessonData.find((item) => item.id === button.dataset.focus);
  const part = lesson.parts[0];
  focusText(part.start, part.end || part.start, button);
}));
document.querySelectorAll("[data-task-focus]").forEach((button) => button.addEventListener("click", () => {
  const [start, end] = taskMarkers[button.dataset.taskFocus];
  focusText(start, end, button);
}));
document.querySelectorAll("[data-hint]").forEach((button) => button.addEventListener("click", () => {
  const hint = document.querySelector(`#hint-${button.dataset.hint}`);
  hint.hidden = !hint.hidden;
  button.textContent = hint.hidden ? "Show hint" : "Hide hint";
}));
document.querySelectorAll("[data-reveal]").forEach((button) => button.addEventListener("click", () => {
  if (!attempted[button.dataset.reveal]) return;
  const answer = document.querySelector(`#answer-${button.dataset.reveal}`);
  answer.hidden = !answer.hidden;
  button.textContent = answer.hidden ? "View answer and one-click insert" : "Hide answer";
}));
document.querySelectorAll("[data-insert]").forEach((button) => button.addEventListener("click", () => {
  const task = button.dataset.insert;
  const current = editor.state.doc.toString();
  const currentRegion = region(current, task);
  if (!currentRegion) {
    showError("Task markers are missing from the current code. Reset the source before using one-click insert.");
    return;
  }
  setCode(current.replace(currentRegion, taskSolutions[task]));
  runCode();
  focusText(taskMarkers[task][0], taskMarkers[task][1], button);
}));

runCode();
mountExpectedPreviews();
