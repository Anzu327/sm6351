import { chromium } from "playwright";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";

const source = await readFile(new URL("../Visualizations/collapsibleTree.js", import.meta.url), "utf8");
const runFile = promisify(execFile);
const baseUrl = process.env.LAB_URL || "http://127.0.0.1:5173/";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, (route) => route.abort());
await page.goto(baseUrl, { waitUntil: "networkidle" });
await page.getByText("Preview ready", { exact: false }).waitFor();
assert.equal(await page.locator(".pipeline-steps li").count(), 4, "beginner overview has four plain-language stages");
assert.equal(await page.locator(".lesson").count(), 4, "walkthrough keeps four key code examples");
assert.deepEqual(await page.locator(".lesson").evaluateAll((items) => items.map((item) => item.id)), ["lesson-hierarchy", "lesson-layout", "lesson-appearance", "lesson-collapse"]);
assert.equal(await page.locator(".code-words").count(), 4, "every key example explains its code words");
assert.equal(await page.locator(".code-words code:not(.code-chip-linked)").count(), 0, "every glossary term matches the displayed source");
assert.match(await page.locator("#lesson-hierarchy .code-words").innerText(), /GDP data into tree nodes/);
assert.match(await page.locator("#lesson-collapse .code-words").innerText(), /Draw the current visible tree again/);
const walkthroughExcerpts = await page.locator(".lesson .code-example pre code").allTextContents();
assert.ok(walkthroughExcerpts.every((excerpt) => source.includes(excerpt)), "every displayed excerpt matches editable source exactly");
assert.equal(walkthroughExcerpts.some((excerpt) => excerpt.includes("join(...")), false, "no placeholder join remains");
const layoutLesson = page.locator("#lesson-layout");
await page.locator("#lesson-hierarchy .code-words code", { hasText: /^\.sum$/ }).hover();
assert.equal(await page.locator("#lesson-hierarchy .snippet-token.is-highlighted").innerText(), ".sum", "glossary word highlights its source term");
const rowGapChip = layoutLesson.locator(".beginner-explain code", { hasText: /^rowGap$/ }).first();
const columnGapChip = layoutLesson.locator(".beginner-explain code", { hasText: /^columnGap$/ }).first();
await rowGapChip.hover();
assert.equal(await layoutLesson.locator(".snippet-token.is-highlighted").allTextContents().then((items) => items.join("")), "rowGap", "hover highlights the matching source token");
await columnGapChip.hover();
assert.equal(await layoutLesson.locator(".snippet-token.is-highlighted").allTextContents().then((items) => items.join("")), "columnGap", "moving to another chip switches the highlighted token");
await layoutLesson.locator(".code-example-head").hover();
assert.equal(await layoutLesson.locator(".snippet-token.is-highlighted").count(), 0, "highlight clears when the pointer leaves the chip");
await rowGapChip.focus();
assert.equal(await layoutLesson.locator(".snippet-token.is-highlighted").count(), 1, "keyboard focus gives the same highlight");
await rowGapChip.evaluate((element) => element.blur());
assert.equal(await layoutLesson.locator(".snippet-token.is-highlighted").count(), 0, "keyboard blur clears the highlight");
const returnButton = page.locator("#return-to-source");
assert.equal(await returnButton.isVisible(), false, "return button starts hidden");
assert.equal(await returnButton.evaluate((button) => button.parentElement.classList.contains("editor-actions")), true, "return button sits below the code editor");
const returnArrow = returnButton.locator(".return-arrow");
await page.locator('[data-focus="hierarchy"]').click();
await page.waitForFunction(() => document.activeElement?.classList.contains("cm-content"));
await page.waitForTimeout(1700);
assert.equal(await returnArrow.evaluate((arrow) => getComputedStyle(arrow).opacity), "0", "arrow stays hidden for the first two seconds after code positioning");
await page.waitForFunction(() => getComputedStyle(document.querySelector(".return-arrow")).opacity === "0.7");
assert.equal(await returnArrow.evaluate((arrow) => getComputedStyle(arrow.querySelector("g")).animationName), "return-arrow-float");
assert.equal(await returnArrow.evaluate((arrow) => getComputedStyle(arrow).pointerEvents), "none");
const arrowAlignment = await returnArrow.evaluate((arrow) => {
  const a = arrow.getBoundingClientRect();
  const b = arrow.parentElement.getBoundingClientRect();
  return Math.abs(a.left + a.width / 2 - b.left - b.width / 2) < 2 && a.bottom < b.top && a.top >= 0;
});
assert.equal(arrowAlignment, true, "arrow is centered above the button within the viewport");
await page.locator('[data-task-focus="spacing"]').click();
await page.waitForFunction(() => document.activeElement?.classList.contains("cm-content"));
await page.waitForTimeout(1700);
assert.equal(await returnArrow.evaluate((arrow) => getComputedStyle(arrow).opacity), "0", "a new code jump restarts the arrow delay");
await returnButton.click();
await page.waitForTimeout(700);
assert.equal(await returnButton.evaluate((button) => button.classList.contains("show-return-arrow")), false, "returning early cancels the delayed arrow");
for (const selector of ['[data-focus="appearance"]', '[data-task-focus="color"]', '[data-task-focus="spacing"]']) {
  const trigger = page.locator(selector);
  await trigger.scrollIntoViewIfNeeded();
  const originY = await page.evaluate(() => scrollY);
  await trigger.click();
  assert.equal(await returnButton.isVisible(), true, `${selector} makes return available`);
  assert.equal(await returnButton.evaluate((button) => {
    const buttonBox = button.getBoundingClientRect();
    const editorBox = document.querySelector("#editor").getBoundingClientRect();
    return buttonBox.top >= editorBox.bottom && buttonBox.bottom <= innerHeight;
  }), true, "return button is visible directly below the code after a jump");
  assert.equal(await returnButton.evaluate((button) => getComputedStyle(button).animationName), "return-breathe", "return button has breathing highlight");
  if (selector === '[data-focus="appearance"]') {
    await returnButton.focus();
    await page.keyboard.press("Enter");
  } else {
    await returnButton.click();
  }
  assert.ok(Math.abs((await page.evaluate(() => scrollY)) - originY) <= 2, `${selector} returns to its page position`);
  assert.equal(await trigger.evaluate((button) => document.activeElement === button), true, `${selector} regains keyboard focus`);
  assert.equal(await returnButton.isVisible(), false, "return button hides after use");
}
await page.locator('[data-focus="hierarchy"]').click();
const latestTrigger = page.locator('[data-task-focus="spacing"]');
await latestTrigger.scrollIntoViewIfNeeded();
const latestOriginY = await page.evaluate(() => scrollY);
await latestTrigger.click();
await returnButton.click();
assert.ok(Math.abs((await page.evaluate(() => scrollY)) - latestOriginY) <= 2, "consecutive jumps return to the latest trigger");
assert.equal(await latestTrigger.evaluate((button) => document.activeElement === button), true);
for (const button of await page.locator(".lesson .locate-button").all()) {
  await button.click();
  await page.waitForFunction(() => {
    const token = document.querySelector(".cm-locate-token")?.getBoundingClientRect();
    const editor = document.querySelector("#editor")?.getBoundingClientRect();
    return token && editor && token.top >= editor.top && token.bottom <= editor.bottom;
  });
  assert.equal(await page.locator(".cm-locate-token").count(), 1, "each excerpt can be located in the editor");
}
const frame = page.frameLocator("#preview");
assert.equal(await frame.locator("g.node").count(), 8, "root plus seven regional groups");
const initialGroupGap = await frame.locator("g.node").filter({ hasText: "Asia" }).evaluate((node) => {
  const sibling = [...node.parentNode.children].find((item) => item.__data__?.data.name === "North America");
  return Math.abs(node.__data__.x - sibling.__data__.x);
});
assert.equal(await frame.locator("svg").evaluate((svg) => {
  const view = svg.getBoundingClientRect();
  return [...svg.querySelectorAll("g.node")].every((node) => {
    const box = node.getBoundingClientRect();
    return box.left >= view.left && box.right <= view.right && box.top >= view.top && box.bottom <= view.bottom;
  });
}), true, "all regional nodes fit inside the initial preview");
assert.equal(await frame.locator("body").evaluate((body) => body.scrollWidth <= innerWidth), true, "main preview has no horizontal scrollbar");
const initialMainView = await frame.locator("svg").evaluate((svg) => ({ ...svg.__zoom }));
assert.equal(await frame.locator("g.node").first().locator("text").textContent(), "World 99.97% (7)", "root shows the source total and group count");
assert.equal(await frame.locator("g.node").filter({ hasText: "Asia" }).locator("text").textContent(), "Asia 33.84% (16)", "collapsed group retains its summed share and count");
assert.equal(await frame.locator("g.node").filter({ hasText: "Asia" }).locator("circle").getAttribute("fill"), "#f58321", "initial Asia color comes from the data");
assert.equal(await frame.locator("g.node").filter({ hasText: "North America" }).locator("circle").getAttribute("fill"), "#ef1621", "initial North America color comes from the data");
const mainAsiaCircle = frame.locator("g.node").filter({ hasText: "Asia" }).locator("circle");
await mainAsiaCircle.scrollIntoViewIfNeeded();
const mainAsiaBox = await mainAsiaCircle.boundingBox();
await page.mouse.move(mainAsiaBox.x + mainAsiaBox.width / 2, mainAsiaBox.y + mainAsiaBox.height / 2);
await page.mouse.down();
await page.mouse.move(mainAsiaBox.x + mainAsiaBox.width / 2 + 55, mainAsiaBox.y + mainAsiaBox.height / 2 + 25, { steps: 6 });
await page.mouse.up();
assert.equal(await frame.locator("g.node").count(), 8, "dragging from a regional node does not expand it");
assert.ok((await frame.locator("svg").evaluate((svg) => svg.__zoom.x)) - initialMainView.x > 40, "left mouse drag pans the main preview");
await page.locator("#reset-main-view").click();
await page.waitForTimeout(100);
assert.ok(Math.abs(await frame.locator("svg").evaluate((svg) => svg.__zoom.x) - initialMainView.x) < 2, "main preview reset restores its fitted position");
assert.equal(await page.locator(".traffic-lights i").count(), 3, "decorative window lights");
assert.equal(await page.locator(".traffic-lights button").count(), 0, "window lights are not controls");
assert.equal(await page.locator(".activity-bar").count(), 0, "unused left icon rail is removed");
assert.ok((await page.locator(".editor-body").boundingBox()).height >= 650, "larger desktop code area");
assert.equal(await page.locator(".workspace-help strong").innerText(), "Click a regional group");
assert.match(await page.locator(".preview-toolbar").innerText(), /country \/ region/);
assert.equal(await page.locator(".workspace-help").isVisible(), true, "click hint is prominent");
const minimap = page.locator("#code-minimap");
assert.equal(await minimap.isVisible(), true, "editable JavaScript has a visible code overview");
assert.ok((await minimap.locator("canvas").evaluate((element) => element.width)) > 0, "code overview draws the source");
const editorSurfaceBox = await page.locator("#editor").boundingBox();
assert.ok(editorSurfaceBox.x + editorSurfaceBox.width <= (await minimap.boundingBox()).x + 1, "overview has its own space beside the editor");
const sidebar = page.locator("#file-tree");
const resizer = page.locator("#sidebar-resizer");
const defaultSidebarWidth = (await sidebar.boundingBox()).width;
const defaultCodeWidth = (await page.locator(".file-content").boundingBox()).width;
assert.ok(defaultSidebarWidth >= 145 && defaultSidebarWidth <= 151, "file list starts narrower");
await resizer.scrollIntoViewIfNeeded();
const dividerBox = await resizer.boundingBox();
await page.mouse.move(dividerBox.x + dividerBox.width / 2, dividerBox.y + 90);
await page.mouse.down();
await page.mouse.move(dividerBox.x + dividerBox.width / 2 + 70, dividerBox.y + 90, { steps: 8 });
await page.mouse.up();
assert.ok((await sidebar.boundingBox()).width >= defaultSidebarWidth + 60, "dragging divider grows file list");
assert.ok((await page.locator(".file-content").boundingBox()).width <= defaultCodeWidth - 60, "code area follows divider");
await resizer.focus();
await page.keyboard.press("ArrowLeft");
assert.equal(Number(await resizer.getAttribute("aria-valuenow")), Math.round((await sidebar.boundingBox()).width), "keyboard resize updates accessible value");
const wideDividerBox = await resizer.boundingBox();
await page.mouse.move(wideDividerBox.x + wideDividerBox.width / 2, wideDividerBox.y + 90);
await page.mouse.down();
await page.mouse.move(wideDividerBox.x - 500, wideDividerBox.y + 90, { steps: 8 });
await page.mouse.up();
assert.equal((await sidebar.boundingBox()).width, 110, "dragging stops at readable minimum");
const narrowDividerBox = await resizer.boundingBox();
await page.mouse.move(narrowDividerBox.x + narrowDividerBox.width / 2, narrowDividerBox.y + 90);
await page.mouse.down();
await page.mouse.move(narrowDividerBox.x + 38, narrowDividerBox.y + 90, { steps: 8 });
await page.mouse.up();
assert.equal((await sidebar.boundingBox()).width, 148, "file list can return to its default width");
await page.locator('[data-tab-file="html"]').click();
assert.equal(await page.locator("#editor").isVisible(), false, "file tabs also switch to read-only code");
assert.equal(await minimap.isVisible(), false, "code overview hides for read-only files");
await page.locator('[data-tab-file="js"]').click();
assert.equal(await minimap.isVisible(), true, "code overview returns to the editable file");
await page.locator('[data-file="html"]').click();
assert.equal(await page.locator("#editor").isVisible(), false, "HTML is read only");
assert.match(await page.locator("#readonly-code").innerText(), /\.\.\/vendor\/d3\.min\.js/);
await page.locator('[data-file="css"]').click();
assert.match(await page.locator("#readonly-code").innerText(), /\.node\.expandable/);
await page.locator('[data-file="json"]').click();
assert.match(await page.locator("#readonly-code").innerText(), /"China"/);
await page.locator('[data-file="js"]').click();
assert.equal(await page.locator("#editor").isVisible(), true);
await minimap.scrollIntoViewIfNeeded();
const minimapBox = await minimap.boundingBox();
await page.mouse.click(minimapBox.x + minimapBox.width / 2, minimapBox.y + minimapBox.height * .85);
const minimapClickedScroll = await page.locator(".cm-scroller").evaluate((element) => element.scrollTop);
assert.ok(minimapClickedScroll > 500, "clicking the overview navigates toward the bottom of the code");
assert.ok(Number(await minimap.getAttribute("aria-valuenow")) > 50, "overview reports the current scroll position");
const overviewThumb = await page.locator(".minimap-viewport").boundingBox();
await page.mouse.move(overviewThumb.x + overviewThumb.width / 2, overviewThumb.y + overviewThumb.height / 2);
await page.mouse.down();
await page.mouse.move(overviewThumb.x + overviewThumb.width / 2, minimapBox.y + minimapBox.height * .15, { steps: 8 });
await page.mouse.up();
assert.ok((await page.locator(".cm-scroller").evaluate((element) => element.scrollTop)) < minimapClickedScroll / 2, "dragging the overview moves the editor viewport");
await minimap.focus();
await page.keyboard.press("End");
assert.ok((await page.locator(".cm-scroller").evaluate((element) => element.scrollTop)) > 500, "overview supports keyboard navigation");
await page.keyboard.press("Home");
assert.equal(await page.locator(".cm-scroller").evaluate((element) => element.scrollTop), 0, "Home returns the overview to the start");

assert.equal(await page.locator(".task-top").allTextContents().then((items) => items.some((item) => /minutes|分鐘|分钟/i.test(item))), false, "task cards have no duration estimates");
const colorExample = page.frameLocator("#expected-color");
const spacingExample = page.frameLocator("#expected-spacing");
await colorExample.locator("g.node").filter({ hasText: /^China 14\.84%$/ }).waitFor();
await spacingExample.locator("g.node").filter({ hasText: /^China 14\.84%$/ }).waitFor();
assert.equal(await colorExample.locator("g.node").filter({ hasText: "Asia" }).locator("circle").getAttribute("r"), "8", "task 1 preview keeps circle size");
assert.equal(await colorExample.locator("g.node").filter({ hasText: "Asia" }).locator("circle").getAttribute("fill"), "#355f9c", "task 2 preview makes Asia blue");
assert.equal(await colorExample.locator("g.node").filter({ hasText: "North America" }).locator("circle").getAttribute("fill"), "#355f9c", "task 2 preview makes North America blue");
assert.equal(await colorExample.locator("g.node").filter({ hasText: /^China 14\.84%$/ }).locator("circle").getAttribute("fill"), "#ffffff", "country stays white");
assert.equal(await spacingExample.locator("g.node").filter({ hasText: "Asia" }).locator("circle").getAttribute("fill"), "#355f9c", "task 2 includes task 1 color");
assert.equal(await spacingExample.locator("g.node").filter({ hasText: "Asia" }).locator("circle").getAttribute("r"), "8", "task 2 keeps circle size");
const exampleGap = async (example) => example.locator("g.node").filter({ hasText: "Asia" }).evaluate((node) => {
  const sibling = [...node.parentNode.children].find((item) => item.__data__?.data.name === "North America");
  return Math.abs(node.__data__.x - sibling.__data__.x);
});
assert.equal(await exampleGap(spacingExample), (await exampleGap(colorExample)) * 2, "task 2 doubles vertical layout gap");
for (const id of ["expected-color", "expected-spacing"]) {
  assert.ok((await page.locator(`#${id}`).boundingBox()).height >= 350, "example frame is taller");
  assert.equal(await page.frameLocator(`#${id}`).locator("svg").evaluate((svg) => {
    const frame = svg.getBoundingClientRect();
    return [...svg.querySelectorAll("g.node text, g.node circle")].every((node) => {
      const box = node.getBoundingClientRect();
      return box.left >= frame.left + 8 && box.right <= frame.right - 8 && box.top >= frame.top + 8 && box.bottom <= frame.bottom - 8;
    });
  }), true, "all example circles and labels fit by default");
}
const exampleSvg = spacingExample.locator("svg");
const defaultZoom = await exampleSvg.evaluate((svg) => ({ k: svg.__zoom.k, x: svg.__zoom.x, y: svg.__zoom.y }));
await exampleSvg.hover();
await page.mouse.wheel(0, -320);
await page.waitForTimeout(120);
const zoomed = await exampleSvg.evaluate((svg) => ({ k: svg.__zoom.k, x: svg.__zoom.x, y: svg.__zoom.y }));
assert.ok(zoomed.k > defaultZoom.k, "wheel zooms the example");
const exampleBox = await exampleSvg.boundingBox();
await page.mouse.move(exampleBox.x + exampleBox.width / 2, exampleBox.y + exampleBox.height / 2);
await page.mouse.down();
await page.mouse.move(exampleBox.x + exampleBox.width / 2 + 65, exampleBox.y + exampleBox.height / 2 + 35, { steps: 6 });
await page.mouse.up();
const dragged = await exampleSvg.evaluate((svg) => ({ k: svg.__zoom.k, x: svg.__zoom.x, y: svg.__zoom.y }));
assert.ok(Math.abs(dragged.x - zoomed.x) > 30, "mouse drag pans the example");
await page.locator('[data-reset-example="expected-spacing"]').click();
await page.waitForTimeout(150);
const resetZoom = await exampleSvg.evaluate((svg) => ({ k: svg.__zoom.k, x: svg.__zoom.x, y: svg.__zoom.y }));
assert.ok(resetZoom.k < zoomed.k && Math.abs(resetZoom.x - dragged.x) > 30, "reset view restores fit");
const asiaCircle = spacingExample.locator("g.node").filter({ hasText: "Asia" }).locator("circle");
const beforeDragNodes = await spacingExample.locator("g.node").count();
const asiaBox = await asiaCircle.boundingBox();
await page.mouse.move(asiaBox.x + asiaBox.width / 2, asiaBox.y + asiaBox.height / 2);
await page.mouse.down();
await page.mouse.move(asiaBox.x + asiaBox.width / 2 + 50, asiaBox.y + asiaBox.height / 2 + 30, { steps: 6 });
await page.mouse.up();
assert.equal(await spacingExample.locator("g.node").count(), beforeDragNodes, "dragging a node does not click it");
assert.ok((await page.locator("#task-spacing .task-actions").evaluate((el) => el.getBoundingClientRect().bottom)) < (await page.locator("#task-spacing .task-visual").evaluate((el) => el.getBoundingClientRect().top)), "task buttons appear above the diagram");

await page.locator(".cm-scroller").evaluate((element) => {
  element.scrollTop = element.scrollHeight;
  window.locateScrollSamples = [element.scrollTop];
  element.addEventListener("scroll", () => window.locateScrollSamples.push(element.scrollTop));
});
await page.locator('[data-focus="hierarchy"]').click();
const workspaceTop = (await page.locator("#workspace").boundingBox()).y;
assert.ok(workspaceTop >= 0 && workspaceTop <= 100, "Locate first jumps the page to the workspace");
await page.waitForFunction(() => {
  const token = document.querySelector(".cm-locate-token")?.getBoundingClientRect();
  const editor = document.querySelector("#editor")?.getBoundingClientRect();
  return token && editor && token.top >= editor.top && token.bottom <= editor.bottom;
});
const scrollSamples = await page.evaluate(() => window.locateScrollSamples);
const firstScroll = scrollSamples[0];
const finalScroll = scrollSamples.at(-1);
assert.ok(firstScroll > finalScroll + 300, "Locate travels a meaningful distance from the current editor position");
assert.ok(scrollSamples.some((value) => value < firstScroll - 100 && value > finalScroll + 100), "editor passes through intermediate scroll positions");

await page.locator('[data-task-focus="color"]').click();
await page.locator(".cm-locate-token").waitFor();
await page.waitForFunction(() => {
  const token = document.querySelector(".cm-locate-token")?.getBoundingClientRect();
  const editor = document.querySelector("#editor")?.getBoundingClientRect();
  return token && editor && token.top >= editor.top && token.bottom <= editor.bottom;
});
assert.equal(await page.locator(".cm-locate-line").count() > 0, true, "jump highlights target code");
const locateBox = await page.locator(".cm-locate-token").boundingBox();
const editorBox = await page.locator("#editor").boundingBox();
assert.ok(locateBox && editorBox && locateBox.y >= editorBox.y && locateBox.y < editorBox.y + editorBox.height, "highlight is visible after the animated jump");
assert.match(await page.locator(".cm-locate-line").first().innerText(), /TASK 1 START: give all regional groups one shared color/, "task 1 jump reaches color rule");
await page.locator('[data-task-focus="spacing"]').click();
await page.locator(".cm-locate-token").waitFor();
assert.match(await page.locator(".cm-locate-line").first().innerText(), /TASK 2 START: increase the up-and-down gap/, "task 2 jump reaches layout exercise");
await page.locator('[data-focus="layout"]').click();
await page.locator(".cm-locate-token").waitFor();
await page.waitForFunction(() => {
  const token = document.querySelector(".cm-locate-token")?.getBoundingClientRect();
  const editor = document.querySelector("#editor")?.getBoundingClientRect();
  return token && editor && token.top >= editor.top && token.bottom <= editor.bottom;
});
assert.ok((await page.locator(".cm-locate-token").textContent()).startsWith("const layout = d3.tree().nodeSize"), "walkthrough locate highlights its code");
await page.locator(".cm-scroller").evaluate((element) => { element.scrollTop = element.scrollHeight; });
await page.locator('[data-focus="hierarchy"]').evaluate((button) => button.click());
await page.waitForTimeout(90);
await page.locator('[data-focus="collapse"]').evaluate((button) => button.click());
await page.waitForFunction(() => document.querySelector(".cm-locate-token")?.textContent?.includes("if (d.children)"));
await page.waitForTimeout(550);
assert.ok((await page.locator(".cm-locate-token").textContent()).includes("if (d.children)"), "a second Locate replaces the first animation and target");
await page.locator('[data-focus="hierarchy"]').evaluate((button) => button.click());
await page.waitForTimeout(70);
await page.locator(".cm-scroller").dispatchEvent("wheel", { deltaY: 120 });
await page.locator(".cm-scroller").evaluate((element) => { element.scrollTop = 800; });
await page.waitForTimeout(550);
assert.ok(Math.abs((await page.locator(".cm-scroller").evaluate((element) => element.scrollTop)) - 800) < 10, "manual scroll cancels Locate animation");
const scrollBeforeSwitch = await page.locator(".cm-scroller").evaluate((element) => element.scrollTop);
await page.locator('[data-file="css"]').click();
await page.locator('[data-file="js"]').click();
const scrollAfterSwitch = await page.locator(".cm-scroller").evaluate((element) => element.scrollTop);
assert.ok(Math.abs(scrollAfterSwitch - scrollBeforeSwitch) <= 5, "JS editing position survives file switching");

await frame.locator("g.node").filter({ hasText: "Asia" }).locator("circle").click();
assert.equal(await frame.locator("g.node").count(), 24, "Asia opens sixteen GDP entries");
assert.equal(await frame.locator("svg").evaluate((svg) => {
  const view = svg.getBoundingClientRect();
  return [...svg.querySelectorAll("g.node")].every((node) => {
    const box = node.getBoundingClientRect();
    return box.left >= view.left && box.right <= view.right && box.top >= view.top && box.bottom <= view.bottom;
  });
}), true, "expanded nodes also fit inside the preview");
assert.equal(await frame.locator("g.node").filter({ hasText: /^China 14\.84%$/ }).locator("text").textContent(), "China 14.84%", "leaf shows its source GDP share");
assert.equal(await frame.locator("g.node").filter({ hasText: "Hong Kong SAR, China" }).count(), 1, "Hong Kong is labelled as China's SAR");
await frame.locator("g.node").filter({ hasText: "Asia" }).locator("circle").click();
assert.equal(await frame.locator("g.node").count(), 8, "Asia closes again");

await page.locator("#workspace").screenshot({ path: "/private/tmp/group5-lab-workspace.png" });

const editor = page.locator(".cm-content");
async function readSavedDraft() {
  await page.waitForFunction(() => document.querySelector("#save-status")?.textContent === "Saved in this browser");
  return page.evaluate(() => localStorage.getItem("group5-tree-lab:draft:v2"));
}
const baseColor = 'if (d.depth === 1) return d.data.color;';
const manualColor = 'if (d.depth === 1) return "#355f9c";';
const spacingPlaceholder = '  // Type one line here, using the layout above as a guide.';
const manualSpacing = '  layout.nodeSize([rowGap * 2, columnGap]);';
assert.ok(source.includes(baseColor));
assert.ok(source.includes(spacingPlaceholder));
const minimapBeforeEdit = await minimap.locator("canvas").evaluate((element) => element.toDataURL());
await editor.fill(source.replace(baseColor, manualColor));
await page.waitForFunction((previous) => document.querySelector("#code-minimap canvas")?.toDataURL() !== previous, minimapBeforeEdit);
assert.equal((await minimap.getAttribute("aria-valuetext")).includes(`of ${source.split("\n").length}`), true, "overview keeps the full source position after editing");
await page.getByRole("button", { name: "Run code" }).click();
await page.getByText("Preview ready", { exact: false }).waitFor();
await page.locator('[data-file="html"]').click();
await page.locator('[data-file="js"]').click();
assert.ok((await readSavedDraft()).includes(manualColor), "JS draft survives file switching");
const exportDir = await mkdtemp(join(tmpdir(), "group5-export-"));
try {
  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download project ZIP" }).click();
  const download = await downloadEvent;
  const zipPath = join(exportDir, "project.zip");
  await download.saveAs(zipPath);
  await runFile("unzip", ["-q", zipPath, "-d", exportDir]);
  const exportedJs = await readFile(join(exportDir, "project", "collapsibleTree.js"), "utf8");
  assert.ok(exportedJs.includes(manualColor), "ZIP includes current student code");
  assert.match(await readFile(join(exportDir, "project", "index.html"), "utf8"), /\.\.\/vendor\/d3\.min\.js/);
  assert.match(await readFile(join(exportDir, "project", "styles.css"), "utf8"), /\.node\.expandable/);
  const exportedJson = await readFile(join(exportDir, "data", "globalEconomyByGDP.json"), "utf8");
  assert.match(exportedJson, /"China"/);
  assert.match(exportedJson, /"name": "Hong Kong"/, "original source label remains in the data file");
  assert.match(await readFile(join(exportDir, "data", "globalEconomyByGDP.js"), "utf8"), /globalEconomyData/);
  assert.ok((await readFile(join(exportDir, "vendor", "d3.min.js"))).length > 200000);
  const offline = await browser.newPage();
  const offlineErrors = [];
  offline.on("pageerror", (error) => offlineErrors.push(error.message));
  await offline.route(/^https?:/, (route) => route.abort());
  await offline.goto(`file://${join(exportDir, "project", "index.html")}`);
  assert.equal(await offline.locator("g.node").count(), 8, "offline file opens without server");
  assert.equal(await offline.locator("g.node").filter({ hasText: "Asia" }).locator("circle").getAttribute("fill"), "#355f9c", "offline export keeps edited group color");
  await offline.locator("g.node").filter({ hasText: "Asia" }).locator("circle").click();
  assert.equal(await offline.locator("g.node").count(), 24, "offline tree expands");
  assert.equal(await offline.locator("g.node").filter({ hasText: "Hong Kong SAR, China" }).count(), 1, "offline export uses clarified label");
  await offline.locator("g.node").filter({ hasText: "Asia" }).locator("circle").click();
  assert.equal(await offline.locator("g.node").count(), 8, "offline tree collapses");
  assert.deepEqual(offlineErrors, []);
  await offline.close();
} finally {
  await rm(exportDir, { recursive: true, force: true });
}
assert.equal(await page.locator('[data-reveal="color"]').isEnabled(), true, "manual color attempt unlocks answer");
assert.equal(await page.locator('[data-reveal="spacing"]').isEnabled(), false, "other answer remains locked");
assert.equal(await page.frameLocator("#preview").locator("g.node").filter({ hasText: "Asia" }).locator("circle").getAttribute("fill"), "#355f9c");

await page.locator('[data-reveal="color"]').click();
const insertColor = page.locator('[data-insert="color"]');
await insertColor.scrollIntoViewIfNeeded();
const colorInsertY = await page.evaluate(() => scrollY);
await insertColor.click();
await page.getByText("Preview ready", { exact: false }).waitFor();
assert.equal(await page.frameLocator("#preview").locator("g.node").filter({ hasText: "Asia" }).locator("circle").getAttribute("fill"), "#355f9c");
assert.equal(await returnButton.isVisible(), true, "answer insertion offers a return route");
await returnButton.click();
assert.ok(Math.abs((await page.evaluate(() => scrollY)) - colorInsertY) <= 2);
assert.equal(await insertColor.evaluate((button) => document.activeElement === button), true);

const afterColor = await readSavedDraft();
await editor.fill(afterColor.replace(spacingPlaceholder, manualSpacing));
await page.getByRole("button", { name: "Run code" }).click();
await page.getByText("Preview ready", { exact: false }).waitFor();
assert.equal(await page.locator('[data-reveal="spacing"]').isEnabled(), true);
assert.equal(await page.frameLocator("#preview").locator("g.node").filter({ hasText: "Asia" }).locator("circle").getAttribute("fill"), "#355f9c");
assert.equal(await page.frameLocator("#preview").locator("g.node").filter({ hasText: "North America" }).locator("circle").getAttribute("fill"), "#355f9c");
assert.equal(await page.frameLocator("#preview").locator("g.node").filter({ hasText: "Asia" }).locator("circle").getAttribute("r"), "8");
assert.equal(await page.frameLocator("#preview").locator("g.node").filter({ hasText: "Asia" }).evaluate((node) => {
  const sibling = [...node.parentNode.children].find((item) => item.__data__?.data.name === "North America");
  return Math.abs(node.__data__.x - sibling.__data__.x);
}), initialGroupGap * 2, "manual spacing code doubles the vertical gap");
await page.frameLocator("#preview").locator("g.node").filter({ hasText: "Asia" }).locator("circle").click();
assert.equal(await page.frameLocator("#preview").locator("g.node").filter({ hasText: /^China 14\.84%$/ }).locator("circle").getAttribute("fill"), "#ffffff");

await page.locator('[data-reveal="spacing"]').click();
const insertSpacing = page.locator('[data-insert="spacing"]');
await insertSpacing.scrollIntoViewIfNeeded();
const spacingInsertY = await page.evaluate(() => scrollY);
await insertSpacing.click();
await page.getByText("Preview ready", { exact: false }).waitFor();
await returnButton.click();
assert.ok(Math.abs((await page.evaluate(() => scrollY)) - spacingInsertY) <= 2);
assert.equal(await insertSpacing.evaluate((button) => document.activeElement === button), true);
const afterBoth = await readSavedDraft();
assert.ok(afterBoth.includes(manualColor), "task 1 survives task 2 insertion");
assert.ok(afterBoth.includes(manualSpacing), "task 2 solution inserted");
const spacingDownloadEvent = page.waitForEvent("download");
await page.getByRole("button", { name: "Download project ZIP" }).click();
const spacingDownload = await spacingDownloadEvent;
const spacingExportDir = await mkdtemp(join(tmpdir(), "group5-spacing-export-"));
try {
  await spacingDownload.saveAs(join(spacingExportDir, "project.zip"));
  await runFile("unzip", ["-q", join(spacingExportDir, "project.zip"), "-d", spacingExportDir]);
  const exportedCode = await readFile(join(spacingExportDir, "project", "collapsibleTree.js"), "utf8");
  assert.ok(exportedCode.includes(manualColor) && exportedCode.includes(manualSpacing), "offline ZIP keeps both task edits");
  const offline = await browser.newPage();
  await offline.route(/^https?:/, (route) => route.abort());
  await offline.goto(`file://${join(spacingExportDir, "project", "index.html")}`);
  assert.equal(await offline.locator("g.node").filter({ hasText: "Asia" }).locator("circle").getAttribute("fill"), "#355f9c");
  assert.equal(await offline.locator("g.node").filter({ hasText: "Asia" }).evaluate((node) => {
    const sibling = [...node.parentNode.children].find((item) => item.__data__?.data.name === "North America");
    return Math.abs(node.__data__.x - sibling.__data__.x);
  }), initialGroupGap * 2, "offline export runs typed layout code");
  await offline.close();
} finally {
  await rm(spacingExportDir, { recursive: true, force: true });
}

await editor.fill(source + "\nthrow new Error('Expected QA error');");
await page.getByRole("button", { name: "Run code" }).click();
await page.locator("#error-box").waitFor({ state: "visible" });
assert.match(await page.locator("#error-box").innerText(), /Expected QA error/);
assert.ok((await readSavedDraft()).includes("Expected QA error"), "editor preserves broken code");

page.once("dialog", (dialog) => dialog.accept());
await page.getByRole("button", { name: "Reset", exact: true }).click();
await page.getByText("Preview ready", { exact: false }).waitFor();
assert.equal(await page.locator('[data-reveal="color"]').isEnabled(), false, "reset locks answer again");
assert.equal(await page.locator('[data-reveal="spacing"]').isEnabled(), false);
assert.equal(await page.frameLocator("#preview").locator("g.node").filter({ hasText: "Asia" }).locator("circle").getAttribute("r"), "8", "reset restores original circle size");
assert.equal(await page.frameLocator("#preview").locator("g.node").filter({ hasText: "Asia" }).locator("circle").getAttribute("fill"), "#f58321", "reset restores original continent color");
assert.equal(await page.evaluate(() => localStorage.getItem("group5-tree-lab:draft:v2")), null, "reset clears browser draft");
await editor.fill(source.replace("// TASK 1 START", "// REMOVED TASK 1 START"));
await page.locator('[data-task-focus="color"]').click();
assert.match(await page.locator("#error-box").innerText(), /Could not find/);
assert.equal(await returnButton.isVisible(), false, "missing target does not show a return button");

const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
await mobile.route(/^https?:\/\/(?!127\.0\.0\.1)/, (route) => route.abort());
await mobile.goto(baseUrl, { waitUntil: "networkidle" });
await mobile.getByText("Preview ready", { exact: false }).waitFor();
assert.equal(await mobile.frameLocator("#preview").locator("svg").evaluate((svg) => {
  const view = svg.getBoundingClientRect();
  return [...svg.querySelectorAll("g.node")].every((node) => {
    const box = node.getBoundingClientRect();
    return box.left >= view.left && box.right <= view.right && box.top >= view.top && box.bottom <= view.bottom;
  });
}), true, "regional nodes fit the mobile preview");
assert.equal(await mobile.locator("#sidebar-resizer").isVisible(), false, "mobile keeps the horizontal file list without a divider");
assert.equal(await mobile.locator("#code-minimap").isVisible(), false, "mobile keeps the full editor width without the overview");
assert.equal(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, "no page-level mobile overflow");
const mobileTrigger = mobile.locator('[data-task-focus="color"]');
await mobileTrigger.scrollIntoViewIfNeeded();
const mobileOriginY = await mobile.evaluate(() => scrollY);
await mobileTrigger.click();
const mobileReturn = mobile.locator("#return-to-source");
assert.equal(await mobileReturn.isVisible(), true);
const mobileReturnBox = await mobileReturn.boundingBox();
assert.ok(mobileReturnBox.y >= 0 && mobileReturnBox.y + mobileReturnBox.height <= 844, "mobile return button is visible after the jump");
await mobile.waitForFunction(() => getComputedStyle(document.querySelector(".return-arrow")).opacity === "0.7");
const mobileArrowBox = await mobileReturn.locator(".return-arrow").boundingBox();
assert.ok(mobileArrowBox.y >= 0 && mobileArrowBox.x >= 0 && mobileArrowBox.x + mobileArrowBox.width <= 390, "mobile arrow remains within the viewport");
await mobileReturn.click();
assert.ok(Math.abs((await mobile.evaluate(() => scrollY)) - mobileOriginY) <= 2);
assert.equal(await mobileTrigger.evaluate((button) => document.activeElement === button), true);
assert.equal(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, "return control causes no mobile overflow");
await mobile.locator("#workspace").screenshot({ path: "/private/tmp/group5-lab-mobile.png" });
await mobile.close();

const reduced = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
await reduced.goto(baseUrl, { waitUntil: "networkidle" });
await reduced.locator(".cm-scroller").evaluate((element) => { element.scrollTop = element.scrollHeight; });
await reduced.locator('[data-focus="hierarchy"]').click();
await reduced.waitForFunction(() => {
  const token = document.querySelector(".cm-locate-token")?.getBoundingClientRect();
  const editor = document.querySelector("#editor")?.getBoundingClientRect();
  return token && editor && token.top >= editor.top && token.bottom <= editor.bottom;
});
assert.ok((await reduced.locator(".cm-scroller").evaluate((element) => element.scrollTop)) < 600, "reduced motion locates the target without travel");
const reducedReturn = reduced.locator("#return-to-source");
assert.equal(await reducedReturn.isVisible(), true);
assert.equal(await reducedReturn.evaluate((button) => getComputedStyle(button).animationName), "none", "reduced motion keeps the button static");
await reduced.waitForFunction(() => getComputedStyle(document.querySelector(".return-arrow")).opacity === "0.7");
assert.equal(await reducedReturn.locator(".return-arrow g").evaluate((group) => getComputedStyle(group).animationName), "none", "reduced motion keeps the delayed arrow static");
await reducedReturn.click();
assert.equal(await reduced.locator('[data-focus="hierarchy"]').evaluate((button) => document.activeElement === button), true, "reduced motion returns keyboard focus");
await reduced.close();

const legacy = await browser.newPage();
const clarifiedLine = 'const name = d.depth === 0 ? "World" : d.data.code === "HK" ? "Hong Kong SAR, China" : d.data.name;';
const oldLine = '.text((d) => d.depth === 0 ? "World" : d.data.name)';
assert.ok(source.includes(clarifiedLine));
const oldTaskBlock = '  // TASK 1 START: make the horizontal gap four times the row gap.\n  const columnGap = rowGap * 4;\n  // TASK 1 END';
const spacingBlock = '  // TASK 2 START: increase the up-and-down gap between nodes.\n  // Type one line here, using the layout above as a guide.\n  // TASK 2 END';
const newColorBlock = '    // TASK 1 START: give all regional groups one shared color.\n    const nodeFill = (d) => {\n      if (d.depth === 0) return "#18345b";\n      if (d.depth === 1) return d.data.color;\n      return "#ffffff";\n    };\n    // TASK 1 END';
const oldestColorBlock = newColorBlock
  .replace("// TASK 1 START: give all regional groups one shared color.", "// TASK 2 START: read each regional group's color from its data.")
  .replace('return d.data.color;', 'return "#355f9c";')
  .replace("// TASK 1 END", "// TASK 2 END");
await legacy.addInitScript(({ key, draft }) => localStorage.setItem(key, draft), {
  key: "group5-tree-lab:draft:v2",
  draft: "// Learner note\n" + source
    .replace(spacingBlock + "\n", "")
    .replace("  const columnGap = 245;", oldTaskBlock)
    .replace(newColorBlock, oldestColorBlock)
    .replace(/\.sum\(\(d\) => d\.weight \|\| 0\)/, "")
    .replace(/\.text\(\(d\) => \{[\s\S]*?\n      \}\)/, oldLine),
});
await legacy.goto(baseUrl, { waitUntil: "networkidle" });
await legacy.getByText("Preview ready", { exact: false }).waitFor();
assert.ok((await legacy.locator(".cm-content").innerText()).includes("// Learner note"), "existing student draft is retained");
assert.ok((await legacy.locator(".cm-content").innerText()).includes("const columnGap = rowGap * 4;"), "old Task 1 edit is preserved");
await legacy.locator('[data-task-focus="color"]').click();
assert.match(await legacy.locator(".cm-locate-line").first().innerText(), /TASK 1 START: give all regional groups one shared color/, "old draft gets the new Task 1 marker");
await legacy.locator('[data-task-focus="spacing"]').click();
assert.match(await legacy.locator(".cm-locate-line").first().innerText(), /TASK 2 START: increase the up-and-down gap/, "old draft gets the new Task 2 marker");
assert.match(await legacy.frameLocator("#preview").locator("g.node").filter({ hasText: "Asia" }).getAttribute("transform"), /^translate\(176,/, "old spacing edit still runs");
assert.equal(await legacy.frameLocator("#preview").locator("g.node").filter({ hasText: "Asia" }).locator("circle").getAttribute("fill"), "#f58321", "old fixed-blue draft receives data colors");
await legacy.frameLocator("#preview").locator("g.node").filter({ hasText: "Asia" }).locator("circle").click();
assert.equal(await legacy.frameLocator("#preview").locator("g.node").filter({ hasText: "Hong Kong SAR, China" }).count(), 1, "older draft gets the clarified label");
assert.equal(await legacy.frameLocator("#preview").locator("g.node").filter({ hasText: "Asia" }).locator("text").textContent(), "Asia 33.84% (16)", "older draft gets GDP shares");
await legacy.close();

const previousDraft = await browser.newPage();
const oldCircleBlock = '        // TASK 1 START: make every node circle larger.\n        node.append("circle").attr("r", 14);\n        // TASK 1 END';
const oldColorBlock = newColorBlock
  .replace("// TASK 1 START: give all regional groups one shared color.", "// TASK 2 START: give all regional groups one shared color.")
  .replace('return d.data.color;', 'return "#355f9c";')
  .replace("// TASK 1 END", "// TASK 2 END");
await previousDraft.addInitScript(({ key, draft }) => localStorage.setItem(key, draft), {
  key: "group5-tree-lab:draft:v2",
  draft: source
    .replace(spacingBlock + "\n", "")
    .replace('        node.append("circle").attr("r", 8);', oldCircleBlock)
    .replace(newColorBlock, oldColorBlock),
});
await previousDraft.goto(baseUrl, { waitUntil: "networkidle" });
await previousDraft.getByText("Preview ready", { exact: false }).waitFor();
await previousDraft.locator('[data-task-focus="spacing"]').click();
assert.match(await previousDraft.locator(".cm-locate-line").first().innerText(), /TASK 2 START: increase the up-and-down gap/, "new spacing task appears in the old draft");
assert.equal(await previousDraft.frameLocator("#preview").locator("g.node").filter({ hasText: "Asia" }).locator("circle").getAttribute("r"), "14");
assert.equal(await previousDraft.frameLocator("#preview").locator("g.node").filter({ hasText: "Asia" }).locator("circle").getAttribute("fill"), "#355f9c");
await previousDraft.close();

assert.deepEqual(errors, [], "parent page has no uncaught JavaScript errors");
await browser.close();
console.log("QA passed: animated code location, minimap navigation, file tabs, ZIP export, offline launch, tree interaction, beginner tasks, reset, and mobile layout.");
