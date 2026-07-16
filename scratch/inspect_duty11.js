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

const row11 = rows.find(r => r && String(r[0]).trim() === '11');
if (row11) {
  row11.forEach((val, idx) => {
    console.log(`Index ${idx}:`, val);
  });
} else {
  console.log("Duty 11 not found");
}
