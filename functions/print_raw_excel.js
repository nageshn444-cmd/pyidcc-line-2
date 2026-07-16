import XLSX from 'xlsx';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const file = path.join(__dirname, '..', 'monday link roster.xlsx');
const wb = XLSX.readFile(file);
const sheet = wb.Sheets[wb.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });

const rowHeaders = rows[1] || [];
console.log("Headers:");
rowHeaders.forEach((val, idx) => {
  console.log(`Index ${idx}:`, val);
});

console.log("\nSearching for duties with many elements (possible Leg 4):");
for (let i = 2; i < rows.length; i++) {
  const row = rows[i];
  if (row && row.length > 25) {
    console.log(`Row ${i} (Duty ${row[0]}): length = ${row.length}`);
    // Print non-empty indexes
    const nonEntries = [];
    row.forEach((val, idx) => {
      if (val !== undefined && val !== null && val !== '') {
        nonEntries.push(`${idx}: ${val}`);
      }
    });
    console.log(nonEntries.slice(0, 20).join(', '));
    if (nonEntries.length > 20) {
      console.log(nonEntries.slice(20).join(', '));
    }
  }
}

