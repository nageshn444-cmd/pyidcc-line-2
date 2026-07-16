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

const duties = ['14', '19', '25', '33'];
duties.forEach(dNum => {
  const row = rows.find(r => r && String(r[0]).trim() === dNum);
  if (row) {
    console.log(`\n--- Duty ${dNum} ---`);
    row.forEach((val, idx) => {
      if (val !== undefined && val !== null && String(val).trim() !== '') {
        console.log(`Index ${idx}:`, val);
      }
    });
  } else {
    console.log(`Duty ${dNum} not found`);
  }
});
