import XLSX from 'xlsx';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const file = path.join(__dirname, '..', 'Weekday link.xlsx');
const wb = XLSX.readFile(file);
const sheet = wb.Sheets[wb.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });

console.log("Searching for 202, 13:21, 13:55 or 213 in Weekday link roster...");

rows.forEach((row, rIdx) => {
  if (!row) return;
  row.forEach((val, cIdx) => {
    if (val !== undefined && val !== null) {
      const str = String(val).toLowerCase();
      if (str.includes("202") || str.includes("13:21") || str.includes("13:55") || str.includes("213")) {
        console.log(`Row ${rIdx} (Duty ${row[0]}), Col ${cIdx}:`, val);
      }
    }
  });
});
