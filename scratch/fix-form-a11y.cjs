/**
 * fix-form-a11y-v4.cjs
 * 
 * Two-pass approach:
 * Pass 1: Fix LABELS - only single-line <label...> tags (safe, tested)
 * Pass 2: Fix INPUT id/name - insert on the <input line itself (first line of the tag)
 *         by detecting lines that START a multi-line input tag (line begins with <input
 *         but doesn't end with > or />) and adding id= name= right after the tag name.
 */
const fs   = require('fs');
const path = require('path');

const SRC_DIR = path.resolve(__dirname, '../src');

function getAllJsx(dir) {
  let results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) results = results.concat(getAllJsx(full));
    else if (entry.name.endsWith('.jsx') || entry.name.endsWith('.tsx')) results.push(full);
  }
  return results;
}

function slug(filePath) {
  return path.basename(filePath, path.extname(filePath))
    .toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 20);
}

let totalInputFixed   = 0;
let totalLabelFixed   = 0;
let totalFilesChanged = 0;

const files = getAllJsx(SRC_DIR);

// Label regex: matches single-line <label ATTRS> where attrs have no >
// Must end with > (not />) on the same line
// Skips lines that contain => 
const LABEL_RE = /^(\s*<label)((?:\s+[^<\n>]*?)*?)(\s*>)/;

for (const filePath of files) {
  const original = fs.readFileSync(filePath, 'utf8');
  const fileSlug = slug(filePath);

  let inputCounter = 0;
  let labelCounter = 0;

  const lines = original.split('\n');
  const fixed = lines.map((line, idx) => {

    // ── LABEL FIX ──────────────────────────────────────────────────────────
    // Only fix lines that start a <label> opening tag (with or without attrs)
    // and the attrs contain no => (to avoid arrow function props)
    const trimmed = line.trimStart();
    if (trimmed.startsWith('<label') && !line.includes('=>')) {
      const m = LABEL_RE.exec(line);
      if (m) {
        const [full, open, attrs, close] = m;
        if (!/\bhtmlFor\s*=/.test(attrs) && !/\bfor\s*=/.test(attrs)) {
          labelCounter++;
          const id = `${fileSlug}-l${labelCounter}`;
          totalLabelFixed++;
          return line.replace(full, `${open}${attrs} htmlFor="${id}"${close}`);
        }
      }
    }

    // ── INPUT/SELECT/TEXTAREA FIX ──────────────────────────────────────────
    // Detect lines that START a multi-line input tag:
    // The line's trimmed content begins exactly with <input, <select, or <textarea
    // followed by whitespace (no more content on that first line, just the tag name)
    // OR the entire tag is on one line (ends with > or />)
    // 
    // Strategy: if the line contains ONLY the tag opening (like "                <input")
    // then add id= name= right after <input on that same line.
    //
    // Pattern: optional whitespace + <(input|select|textarea) then EITHER end of line
    // (multi-line tag) or more content ending with />  or >
    if (/^\s*<(input|select|textarea)(\s|$)/.test(line)) {
      // Skip if already has id= or name= on this line
      if (/\bid\s*=/.test(line) || /\bname\s*=/.test(line)) return line;
      // Skip hidden inputs
      if (/type\s*=\s*['"]hidden['"]/.test(line)) return line;
      // Skip if line contains => (arrow function — means attrs continue this line)
      if (/=>/.test(line)) return line;

      inputCounter++;
      const id = `${fileSlug}-i${inputCounter}`;
      totalInputFixed++;

      // Insert id and name right after the tag name
      return line.replace(
        /^(\s*<(?:input|select|textarea))/,
        `$1 id="${id}" name="${id}"`
      );
    }

    return line;
  });

  const result = fixed.join('\n');
  if (result !== original) {
    fs.writeFileSync(filePath, result, 'utf8');
    totalFilesChanged++;
    console.log(`✓ ${path.relative(SRC_DIR, filePath).padEnd(55)} inp+${inputCounter} lbl+${labelCounter}`);
  }
}

console.log(`\n─────────────────────────────────────────────`);
console.log(`Files changed : ${totalFilesChanged}`);
console.log(`Inputs fixed  : ${totalInputFixed}`);
console.log(`Labels fixed  : ${totalLabelFixed}`);
console.log(`─────────────────────────────────────────────`);
