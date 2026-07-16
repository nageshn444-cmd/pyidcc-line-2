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
  if (fs.existsSync(filePath)) {
    const wb = XLSX.readFile(filePath);
    console.log(`${file} sheet names:`, wb.SheetNames);
  }
});
