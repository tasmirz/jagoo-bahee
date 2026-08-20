import { existsSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

const require = createRequire(import.meta.url);
const root = resolve(import.meta.dirname, '..');
const source = join(root, 'PROJECT-OVERVIEW.md');
const previewHtml = join(root, '.proposal-preview.html');
const outputPdf = join(root, 'proposal.pdf');

const extensionRoot = join(homedir(), '.vscode', 'extensions');
const extensionName = readdirSync(extensionRoot)
  .filter((name) => name.startsWith('shd101wyy.markdown-preview-enhanced-'))
  .sort()
  .at(-1);

if (!extensionName) {
  throw new Error('VS Code Markdown Preview Enhanced is not installed.');
}

const extension = join(extensionRoot, extensionName);
const crossnote = join(extension, 'crossnote');
const remarkablePath = join(crossnote, 'dependencies', 'remarkable', 'remarkable.js');
const mermaidPath = join(crossnote, 'dependencies', 'mermaid', 'mermaid.min.js');
const previewCssPath = join(crossnote, 'styles', 'preview_theme', 'github-light.css');

for (const asset of [remarkablePath, mermaidPath, previewCssPath]) {
  if (!existsSync(asset)) throw new Error(`Missing VS Code preview asset: ${asset}`);
}

const Remarkable = require(remarkablePath);
const md = new Remarkable('full', {
  html: true,
  breaks: false,
  linkify: true,
  typographer: false,
});

const defaultFence = md.renderer.rules.fence;
md.renderer.rules.fence = (tokens, index, options, env, renderer) => {
  const token = tokens[index];
  const language = (token.params || '').trim().split(/\s+/)[0];
  if (language === 'mermaid') {
    return `<div class="mermaid">${Remarkable.utils.escapeHtml(token.content)}</div>`;
  }
  return defaultFence(tokens, index, options, env, renderer);
};

const markdown = readFileSync(source, 'utf8');
const rendered = md.render(markdown);
const previewCss = readFileSync(previewCssPath, 'utf8');

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Islands of Reach: project overview</title>
<style>
${previewCss}
html, body { margin: 0; padding: 0; }
body {
  max-width: 980px;
  margin: 0 auto;
  padding: 32px 36px 64px;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
  font-size: 16px;
  line-height: 1.6;
  color: #333;
}
.mermaid {
  display: flex;
  justify-content: center;
  margin: 24px auto 28px;
  break-inside: avoid;
  page-break-inside: avoid;
}
.mermaid svg {
  display: block;
  width: auto !important;
  height: auto !important;
  max-width: 100% !important;
  max-height: 210mm !important;
}
table { break-inside: auto; }
tr, pre, blockquote { break-inside: avoid; page-break-inside: avoid; }
h1, h2, h3 { break-after: avoid; page-break-after: avoid; }
@page { size: A4; margin: 18mm 17mm 19mm; }
@media print {
  body { max-width: none; padding: 0; font-size: 12pt; }
  a { color: #0969da !important; }
  .mermaid { margin: 18px auto 22px; }
}
</style>
<script src="${pathToFileURL(mermaidPath).href}"></script>
</head>
<body class="markdown-body">
${rendered}
<script>
window.__previewReady = false;
window.addEventListener('load', async () => {
  mermaid.initialize({
    startOnLoad: false,
    theme: 'default',
    securityLevel: 'loose',
    flowchart: { htmlLabels: true, useMaxWidth: true },
    sequence: { useMaxWidth: true }
  });
  await mermaid.run({ querySelector: '.mermaid' });
  await document.fonts.ready;
  window.__previewReady = true;
});
</script>
</body>
</html>`;

writeFileSync(previewHtml, html, 'utf8');
if (existsSync(outputPdf)) unlinkSync(outputPdf);

const browserCandidates = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
];
const browser = browserCandidates.find(existsSync);
if (!browser) throw new Error('Microsoft Edge or Google Chrome was not found.');

const result = spawnSync(
  browser,
  [
    '--headless=new',
    '--disable-gpu',
    '--allow-file-access-from-files',
    '--run-all-compositor-stages-before-draw',
    '--virtual-time-budget=15000',
    '--no-pdf-header-footer',
    `--print-to-pdf=${outputPdf}`,
    pathToFileURL(previewHtml).href,
  ],
  { cwd: root, encoding: 'utf8' },
);

if (existsSync(previewHtml)) unlinkSync(previewHtml);
if (result.status !== 0 || !existsSync(outputPdf)) {
  throw new Error(`${result.stdout || ''}\n${result.stderr || ''}`.trim());
}

console.log(outputPdf);
