const fs = require('fs');
const path = require('path');

// Read both files, re-sort, and write back sorted by numeric ID ascending

const files = [
  { path: path.join(__dirname, '../src/data/bmrclCrewRegistry.js'), jsonLike: false },
  { path: path.join(__dirname, '../src/components/BmrclCrewRegistry.js'), jsonLike: true }
];

for (const { path: filePath, jsonLike } of files) {
  const content = fs.readFileSync(filePath, 'utf8');

  // Extract each line that represents a crew entry
  const lines = content.split('\n');
  const header = lines[0]; // export const BMRCL_CREW_REGISTRY = [
  const footer = lines[lines.length - 2]; // ];
  const trailing = lines[lines.length - 1]; // empty line

  // Collect all entry lines (lines that start with "  {")
  const entryLines = lines.slice(1, lines.length - 2).filter(l => l.trim().startsWith('{'));

  // Parse ID from each entry line
  const entriesWithId = entryLines.map(line => {
    const match = jsonLike
      ? line.match(/"id":\s*"(\d+)"/)
      : line.match(/id:\s*"(\d+)"/);
    const id = match ? Number(match[1]) : 0;
    // Normalize trailing comma
    const normalized = line.trimEnd().replace(/,\s*$/, '');
    return { id, line: normalized };
  });

  // Sort numerically ascending by ID
  entriesWithId.sort((a, b) => a.id - b.id);

  // Check if already sorted
  let alreadySorted = true;
  for (let i = 1; i < entriesWithId.length; i++) {
    if (entriesWithId[i].id < entriesWithId[i - 1].id) {
      alreadySorted = false;
      break;
    }
  }

  if (alreadySorted) {
    console.log(`✓ ${path.basename(filePath)}: already sorted (${entriesWithId.length} entries, IDs ${entriesWithId[0].id} → ${entriesWithId[entriesWithId.length-1].id})`);
  } else {
    console.log(`  Sorting ${path.basename(filePath)}...`);
  }

  // Rebuild file
  const sortedLines = entriesWithId.map((e, idx) => {
    // All except last get trailing comma
    return idx < entriesWithId.length - 1 ? e.line + ',' : e.line;
  });

  const newContent = [header, ...sortedLines, footer, trailing].join('\n');
  fs.writeFileSync(filePath, newContent, 'utf8');
  console.log(`✓ Written ${path.basename(filePath)} — ${entriesWithId.length} members, ID range: ${entriesWithId[0].id} → ${entriesWithId[entriesWithId.length-1].id}`);
}

console.log('\n✅ Both registry files sorted by Employee ID ascending.');
