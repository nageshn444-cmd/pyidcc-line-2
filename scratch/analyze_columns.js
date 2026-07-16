import XLSX from 'xlsx';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const rosters = [
  "Weekday link.xlsx",
  "monday link roster.xlsx",
  "sat & GH link roster.xlsx",
  "sunday link roster.xlsx"
];

rosters.forEach(file => {
  const filePath = path.join(__dirname, '..', file);
  if (!fs.existsSync(filePath)) {
    console.log(`File ${file} does not exist`);
    return;
  }
  const wb = XLSX.readFile(filePath);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
  console.log(`\n--- File: ${file} (rows: ${rows.length}) ---`);
  
  // Find index of headers (usually row with "Duty" or similar)
  let headerRowIdx = 1;
  const headers = rows[headerRowIdx] || [];
  console.log(`Headers length: ${headers.length}`);
  headers.forEach((h, i) => {
    if (h) console.log(`  Index ${i}: ${h}`);
  });

  // Find a non-night shift row with maximum non-empty fields
  let maxFieldsRow = null;
  let maxFieldsCount = 0;
  for (let i = 2; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;
    // Check if it's a night shift
    const isNight = row[row.length - 1] && String(row[row.length - 1]).trim().toUpperCase().startsWith('N');
    if (!isNight) {
      const nonEmpties = row.filter(val => val !== undefined && val !== null && String(val).trim() !== '').length;
      if (nonEmpties > maxFieldsCount) {
        maxFieldsCount = nonEmpties;
        maxFieldsRow = row;
      }
    }
  }
  if (maxFieldsRow) {
    console.log(`Max fields row for non-night shift (Duty ${maxFieldsRow[0]}): count = ${maxFieldsCount}`);
    maxFieldsRow.forEach((val, idx) => {
      if (val !== undefined && val !== null && String(val).trim() !== '') {
        console.log(`  Col ${idx} (${headers[idx]}): ${val}`);
      }
    });
  }
});
