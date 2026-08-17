import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import html2canvas from "html2canvas";
import * as XLSX from "xlsx";
import {
  Download,
  Printer,
  Search,
  CheckCircle,
  Train,
  Send,
  RefreshCw,
  FileSpreadsheet,
  UploadCloud,
  Trash2,
  Image as ImageIcon,
  FileText,
  ZoomIn,
  ZoomOut,
  Maximize2,
  ClipboardPaste,
  Copy,
  Plus,
  Table,
  Save,
  Undo2,
  Redo2,
  Bold,
  Italic,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Palette,
  CheckSquare,
  Sparkles,
  Eraser
} from "lucide-react";
import { useOperationalEngine } from "../context/OperationalEngine";
import { db } from "../firebase";
import {
  collection,
  doc,
  setDoc,
  getDocs,
  query,
  where,
  deleteDoc,
  onSnapshot
} from "firebase/firestore";

// Helper to convert Column index to Excel Letter (0 -> A, 1 -> B, ..., 13 -> N)
const colToLetter = (colIdx) => {
  let letter = "";
  let temp = colIdx;
  while (temp >= 0) {
    letter = String.fromCharCode((temp % 26) + 65) + letter;
    temp = Math.floor(temp / 26) - 1;
  }
  return letter;
};

// Create a clean blank grid of given dimensions
const createEmptyGrid = (numRows = 140, numCols = 16) => {
  return Array.from({ length: numRows }, () =>
    Array.from({ length: numCols }, () => ({
      val: "",
      bg: "#FFFFFF",
      fg: "#000000",
      bold: false,
      align: "center",
      border: "border-slate-300"
    }))
  );
};

// Generate Initial Default Tuesday BMRCL Roster Grid (140 rows x 15 columns: A to O)
const generateInitialBmrclGrid = () => {
  const NUM_ROWS = 140;
  const NUM_COLS = 16;
  const grid = createEmptyGrid(NUM_ROWS, NUM_COLS);

  const ensureRow = (r) => {
    while (grid.length <= r) {
      grid.push(
        Array.from({ length: NUM_COLS }, () => ({
          val: "",
          bg: "#FFFFFF",
          fg: "#000000",
          bold: false,
          align: "center",
          border: "border-slate-300"
        }))
      );
    }
  };

  // 1. Title Banner (Row 0, Col A-N Merged)
  grid[0][0] = {
    val: "11 August 2026 Tuesday",
    bg: "#38BDF8",
    fg: "#000000",
    bold: true,
    align: "center",
    colSpan: 14
  };

  // 2. Table Headers (Row 1)
  grid[1][0] = { val: "Duty No", bg: "#FFFFFF", fg: "#000000", bold: true, align: "center" };
  grid[1][1] = { val: "Type", bg: "#FFFFFF", fg: "#000000", bold: true, align: "center" };
  grid[1][2] = { val: "Sign ON Time", bg: "#FFFFFF", fg: "#000000", bold: true, align: "center" };
  grid[1][3] = { val: "Sign ON Place", bg: "#FFFFFF", fg: "#000000", bold: true, align: "center" };
  grid[1][4] = { val: "Name", bg: "#FFFFFF", fg: "#000000", bold: true, align: "left" };
  grid[1][5] = { val: "Emp Id", bg: "#FFFFFF", fg: "#000000", bold: true, align: "center" };
  grid[1][6] = { val: "Sign OFF", bg: "#FFFFFF", fg: "#000000", bold: true, align: "center" };
  grid[1][7] = { val: "Place", bg: "#FFFFFF", fg: "#000000", bold: true, align: "center" };
  grid[1][8] = { val: "A 09+12\nB 05+03", bg: "#FEF08A", fg: "#000000", bold: true, align: "center" };

  grid[1][9] = { val: "From", bg: "#FFFFFF", fg: "#000000", bold: true, align: "center" };
  grid[1][10] = { val: "Name", bg: "#FFFFFF", fg: "#000000", bold: true, align: "left" };
  grid[1][11] = { val: "Emp Id", bg: "#FFFFFF", fg: "#000000", bold: true, align: "center" };
  grid[1][12] = { val: "To", bg: "#FFFFFF", fg: "#000000", bold: true, align: "center" };
  grid[1][13] = { val: "Type / Role", bg: "#FFFFFF", fg: "#000000", bold: true, align: "center" };

  // 3. Raw BMRCL Duties Data (Duties 1 to 78 + 79 Testing + 80-81 Trainees)
  const leftDuties = [
    ["1", "PRO1", "06:00", "PYID", "Mahesh S", "22289", "14:00", "PYID", "Pro1"],
    ["2", "Stdby", "06:00", "TGTP", "Praveen G", "21953", "14:00", "TGTP", "OR1"],
    ["3", "KG Dn", "06:00", "KGWA", "Priyanka K M", "21714", "13:45", "PYID", "A03"],
    ["4", "No PDC", "06:00", "Depot", "Onkarappa", "22499", "13:45", "PYID", "A1"],
    ["5", "Rd3 Induct", "06:00", "PYID", "Satya Prakash", "22259", "12:15", "Depot", "A53"],
    ["6", "D-Rd3", "06:00", "Depot", "Sanjay Kumar", "22287", "13:30", "PYID", "A6"],
    ["7", "D-Rd3", "06:00", "KGWA", "Santheesh Kumar A T", "21961", "12:30", "Depot", "A7"],
    ["8", "PYID Dn", "06:10", "PYID", "Yogesh GH", "88000035", "14:05", "PYID", "A803"],
    ["9", "PYID Dn", "06:10", "Depot", "Seema Subhan", "21502", "13:45", "PYID", "A9T3"],
    ["10", "D-Rd3", "06:15", "Depot", "Chandrashekar G", "21702", "14:00", "PYID", "A2T1"],
    ["11", "PYTD", "06:15", "PYTD", "Chethana S", "22496", "14:15", "PYTD", "A11"],
    ["12", "PYTD", "06:20", "Depot", "Shashank S", "88000138", "13:20", "PYTD", "A12T3"],
    ["13", "No PDC", "06:20", "Depot", "Kartik S Awari", "88000141", "14:15", "PYID", "A13S3"],
    ["14", "KG Up", "06:25", "KGWA", "Jagadeesh KS", "22312", "14:25", "PYID", "A14"],
    ["15", "D-Rd3", "06:25", "Depot", "Madhu R", "22465", "14:25", "PYID", "A15"],
    ["16", "KG Dn", "06:25", "KGWA", "Prathvi Raj L K", "21434", "13:35", "PYID", "A16"],
    ["17", "D-Rd3", "06:35", "PYID", "Abhilash NN", "88000094", "14:40", "PYID", "A17T3"],
    ["18", "D-Rd3", "06:40", "Depot", "Hemanth J", "21712", "14:30", "Depot", "A1803"],
    ["19", "KG Up", "06:40", "KGWA", "Dhanaraj D", "21705", "14:40", "PYID", "A190"],
    ["20", "PYID Dn", "06:40", "PYID", "Sankara Rao Achut", "21759", "14:45", "PYID", "A20"],
    ["21", "N PKT", "06:45", "NGSA", "Aravinda Vinod Kumar", "22254", "14:45", "PYID", "A21"],
    ["22", "D-Rd3", "06:45", "Depot", "Dayanand A", "88000037", "14:15", "PYID", "A22"],
    ["23", "D-Rd3", "06:55", "KGWA", "Harshith D", "22522", "13:55", "KGWA", "A23"],
    ["24", "KG Dn", "06:55", "KGWA", "Manjunatha KS", "22229", "14:55", "PYID", "A24"],
    ["25", "PYID Dn", "07:10", "PYID", "Bhagyashree K S", "22509", "15:10", "PYID", "A250"],
    ["26", "PYID Dn", "07:10", "PYID", "Siddanagouwamy", "22256", "15:05", "PYID", "A260"],
    ["27", "", "07:20", "PYTD", "Jagadeesh S", "21994", "14:45", "PYTD", "A2703"],
    ["28", "", "07:35", "PYTD", "Karthik", "88000102", "15:25", "PYTD", "A2803"],
    ["29", "", "07:45", "PYTD", "Chaithanya MB", "88000109", "15:35", "PYTD", "A29T3"],
    ["30", "", "07:45", "PYTD", "Shakunthala D", "22121", "15:35", "PYTD", "A30"],
    ["31", "", "07:50", "PYTD", "Dileep Kumar", "88000088", "15:50", "PYTD", "A3103"],
    ["32", "", "08:05", "PYTD", "Nandani Kumar DN", "88000140", "16:00", "PYTD", "A3203"],
    ["33", "", "12:35", "PYTD", "KC Abhilash N", "22254", "20:35", "Depot", "B3T3"],
    ["34", "KGWA Dn", "13:20", "KGWA", "Shakuntala", "21711", "20:50", "Depot", "D04"],
    ["35", "", "13:30", "PYTD", "Babu Halabhavi", "22261", "20:55", "PYTD", "D05"],
    ["36", "", "13:30", "PYTD", "Vinay Kumar", "21971", "21:05", "PYTD", "D06"],
    ["37", "", "13:30", "PYTD", "Yashodhar KL", "22264", "21:05", "PYTD", "D07"],
    ["38", "", "13:30", "PYTD", "Shweta S", "22459", "21:10", "PYTD", "D08"],
    ["39", "", "13:35", "PYTD", "GA Sudhakar", "22227", "21:25", "PYTD", "D09"],
    ["40", "", "13:45", "PYTD", "Syama Raju M", "21970", "21:30", "Depot", "B40"],
    ["41", "", "13:55", "PYTD", "Shantamurthy G", "22268", "20:40", "PYTD", "B4103"],
    ["42", "Stdby", "14:15", "TGTP", "Jeeva S", "21969", "21:00", "TGTP", "OR2"],
    ["43", "PRO2", "14:00", "PYTD", "Pavan MN", "88000095", "22:00", "PYTD", "Pro2"],
    ["44", "", "14:00", "PYTD", "Manjunatha K R", "21436", "21:45", "PYTD", "B4A3"],
    ["45", "PYID Dn", "14:00", "PYID", "Karan Valanson", "88000046", "21:55", "KGWA", "B4S03"],
    ["46", "", "14:15", "PYTD", "Sridhar V", "21739", "21:50", "KGWA", "B4T03"],
    ["47", "PYID Dn", "14:15", "PYID", "Vinay Kumar GR", "88000096", "21:50", "KGWA", "B4703"],
    ["48", "", "14:15", "PYTD", "Sai Kiran C", "88000053", "21:40", "PUTH", "B482"],
    ["49", "", "14:25", "PYTD", "Hemalatha NN", "88000119", "21:45", "KGWA", "D49"],
    ["50", "", "14:35", "PYTD", "Prashanth S", "88000136", "21:50", "KGWA", "D50"],
    ["51", "", "14:40", "PYTD", "Ananth Kumar", "21956", "21:50", "PUTH", "D51"],
    ["52", "", "14:45", "PYTD", "Vinod Dibdani", "88000110", "21:50", "Depot", "D52"],
    ["53", "", "14:55", "PYTD", "Ramanna A", "88000129", "22:00", "Depot", "D53"],
    ["54", "", "15:05", "PYTD", "Sowmya Patil", "21725", "21:40", "PYTD", "D54"],
    ["55", "", "15:15", "PYTD", "Venkata Kiran Kumar N", "21909", "21:30", "PYTD", "D55"],
    ["56", "", "15:20", "PYTD", "Bhagyashree S", "21504", "20:40", "Depot", "D56"],
    ["57", "D-Rd3", "15:35", "Depot", "K Shailaja Dashulay", "21493", "21:30", "Depot", "D57"],
    ["58", "D-Rd3", "15:35", "Depot", "BK Singh", "22246", "21:30", "Depot", "D58"],
    ["59", "PYID Dn", "16:00", "PYID", "Prakash P", "22319", "21:55", "PYID", "D59"],
    ["60", "D-Rd3", "16:00", "Depot", "Nagesha C S", "21694", "21:55", "KGWA", "D60"],
    ["61", "D-Rd3", "16:05", "Depot", "Ashok Jeval", "22251", "22:00", "Depot", "D61"],
    ["62", "D-Rd3", "16:35", "Depot", "Venkatesh", "21879", "22:30", "KGWA", "D62"],
    ["63", "D-Rd3", "16:45", "Depot", "Rangaswamy DN", "21978", "22:05", "Depot", "D63"],
    ["64", "PUTH Dn", "21:15", "PUTH", "Vijaya Kumar HT", "22101", "06:20", "PYID", "NX4Ap"],
    ["65", "PYID Up", "21:10", "PYID", "Ankar S", "21731", "06:40", "KGWA", "N5kPs"],
    ["66", "KGWA Up", "21:20", "KGWA", "Harsha S D", "88000101", "06:45", "PYID", "N6kPs"],
    ["67", "PUTH Up", "21:30", "PUTH", "Pooja HT", "88000147", "06:45", "PYID", "N7kTi"],
    ["68", "KGWA Up", "21:30", "KGWA", "Lokesh A", "88000117", "07:10", "PYID", "N8kPs"],
    ["69", "KGWA Dn", "21:05", "KGWA", "Soumya N", "21704", "06:30", "PYID", "N90"],
    ["70", "KGWA Dn", "21:15", "KGWA", "G Raja", "22229", "07:05", "PYID", "N100"],
    ["71", "PYID Dn", "21:20", "PYID", "Nayana DR", "21976", "06:30", "PYID", "N17llNg"],
    ["72", "PYID Up", "21:20", "PYID", "Harish PK", "21123", "06:30", "KGWA", "N12lBl"],
    ["73", "KGWA Dn", "21:25", "KGWA", "Karthika M", "21315", "06:30", "PYID", "N13llNg"],
    ["74", "PYID Up", "21:30", "PYID", "Manjunath Swamy SM", "22481", "07:00", "KGWA", "N14lBl"],
    ["75", "PYID Dn", "21:30", "PYID", "Sandeep Kaji JR", "88000095", "07:20", "KGWA", "N15lBl"],
    ["76", "PYID Up", "21:40", "PYID", "Mahesh Rao KR", "21967", "07:05", "PYID", "N16lBl"],
    ["77", "KGWA Up", "21:40", "KGWA", "Vinod Kumar Singh V", "22587", "07:25", "PYID", "N27Ti"],
    ["78", "Npro", "21:30", "PYID", "Amit Kumar Jha", "22566", "05:30", "PYID", "N3Pro"]
  ];

  let rIdx = 2;
  leftDuties.forEach((row) => {
    ensureRow(rIdx);
    const num = parseInt(row[0], 10);
    const isPinkDuty = [11, 19, 35, 36, 37, 39, 43, 47, 54].includes(num);
    const isLightPinkDuty = [21].includes(num);
    const isYellowDuty1 = num === 1;
    const isSpecialRow = [14, 16, 40, 44].includes(num);
    const is88 = row[5] && row[5].startsWith("88000");

    row.forEach((cellVal, cIdx) => {
      let cellBg = isSpecialRow ? "#FCE7F3" : "#FFFFFF";
      let cellFg = "#000000";
      let isBold = cIdx === 0 || cIdx === 4 || cIdx === 5 || cIdx === 8;

      if (cIdx === 0) {
        if (isYellowDuty1) cellBg = "#FEF08A";
        else if (isPinkDuty) cellBg = "#F472B6";
        else if (isLightPinkDuty) cellBg = "#FBCFE8";
      } else if (cIdx === 5 && cellVal) {
        cellBg = isYellowDuty1 ? "#FEF08A" : is88 ? "#93C5FD" : "#BBF7D0";
      } else if (cIdx === 8 && cellVal) {
        cellBg = "#FED7AA";
      }

      grid[rIdx][cIdx] = {
        val: cellVal,
        bg: cellBg,
        fg: cellFg,
        bold: isBold,
        align: cIdx === 4 ? "left" : "center"
      };
    });
    rIdx++;
  });

  // CRRC-DTG Train Testing Banner (Row 80)
  ensureRow(rIdx);
  grid[rIdx][0] = { val: "CRRC-DTG Train Testing", bg: "#BBF7D0", fg: "#000000", bold: true, align: "center", colSpan: 9 };
  rIdx++;

  // Duty 79 Testing
  ensureRow(rIdx);
  const duty79 = ["79", "Testing", "22:00", "Depot", "Nithin Kumar M", "21915", "06:00", "Depot", "N DllKxC"];
  duty79.forEach((v, c) => {
    grid[rIdx][c] = { val: v, bg: c === 5 ? "#BBF7D0" : c === 8 ? "#FED7AA" : "#FFFFFF", fg: "#000000", bold: true, align: c === 4 ? "left" : "center" };
  });
  rIdx++;

  // CRRC-DTG Train 440kms Trg Banner (Row 82)
  ensureRow(rIdx);
  grid[rIdx][0] = { val: "CRRC-DTG Train 440kms Trg", bg: "#BBF7D0", fg: "#000000", bold: true, align: "center", colSpan: 9 };
  rIdx++;

  // Duty 80 & 81 Trainees
  const trainees = [
    ["80", "Trainee", "22:00", "Depot", "Shivakumar D", "22495", "06:00", "Depot", "N Train"],
    ["81", "Trainee", "22:00", "Depot", "Mamatha D", "22469", "06:00", "Depot", "N DllKxC"]
  ];
  trainees.forEach((trRow) => {
    ensureRow(rIdx);
    trRow.forEach((v, c) => {
      grid[rIdx][c] = { val: v, bg: c === 5 ? "#BBF7D0" : c === 8 ? "#FED7AA" : "#FFFFFF", fg: "#000000", bold: true, align: c === 4 ? "left" : "center" };
    });
    rIdx++;
  });

  // Brown Separator Bar (Row 85)
  ensureRow(rIdx);
  grid[rIdx][0] = { val: "", bg: "#78350f", fg: "#FFFFFF", bold: true, align: "center", colSpan: 9 };
  rIdx++;

  // JMD Subheader (Row 86)
  ensureRow(rIdx);
  grid[rIdx][0] = { val: "JMD TO's 38 Batch", bg: "#E2E8F0", fg: "#000000", bold: true, align: "center", colSpan: 9 };
  rIdx++;

  // JMD Rows
  const jmdData = [
    ["4", "No PDC", "06:00", "Depot", "", "", "13:45", "PYID", "A1"],
    ["12", "Dpo - Rd3", "06:15", "Depot", "", "", "14:00", "PYID", "A12"],
    ["15", "Dpo - Rd3", "06:20", "Depot", "Puneeth", "88000121", "14:25", "PYID", "A15T4"],
    ["18", "Dpo - Rd3", "06:25", "Depot", "Rakshith S", "88000115", "14:30", "PYID", "A18"],
    ["19", "KG Up", "06:40", "KGWA", "Arun", "88000145", "14:40", "PYID", "A19"],
    ["21", "N PKT", "06:45", "NGSA", "Krishna", "88000124", "14:45", "PYID", "A21"],
    ["24", "KG Dn", "06:55", "Depot", "Dhanuja C", "88000122", "14:25", "PYID", "A24"],
    ["34", "KGWA Dn", "13:20", "KGWA", "Hemanth A", "88000132", "14:25", "Depot", "B34"],
    ["52", "", "15:00", "PYID", "", "", "21:30", "Depot", "D53"],
    ["57", "Dpo - Rd3", "15:35", "Depot", "", "", "21:30", "Depot", "D57"],
    ["58", "Dpo - Rd3", "15:35", "Depot", "", "", "21:30", "Depot", "D58"],
    ["62", "Dpo - Rd3", "16:15", "Depot", "Chethan HK", "88000127", "22:05", "Depot", "D62"],
    ["64", "PUTH Dn", "21:15", "PUTH", "Suchit Kumar", "88000108", "06:50", "PYID", "NX4Ap"],
    ["65", "PYID Up", "21:10", "PYTD", "Jayashree", "88000134", "06:35", "KGWA", "N5kPs"],
    ["66", "KGWA Up", "21:20", "KGWA", "", "", "06:45", "PYID", "N6kPs"],
    ["67", "PUTH Up", "21:30", "PUTH", "", "", "07:00", "PYID", "N7kTi"],
    ["68", "KGWA Up", "21:30", "KGWA", "", "", "07:10", "PYID", "N8kPs"],
    ["69", "KGWA Dn", "21:05", "KGWA", "", "", "06:30", "PYID", "N90"],
    ["70", "KGWA Dn", "21:15", "KGWA", "", "", "06:30", "PYID", "N10lBl"],
    ["71", "PYID Dn", "21:20", "PYTD", "Gaganmurthy", "88000120", "06:30", "PYID", "N17llNg"],
    ["72", "PYID Up", "21:20", "PYID", "Lingaraju DA", "88000086", "06:30", "KGWA", "N12lBl"],
    ["73", "KGWA Dn", "21:25", "KGWA", "Vidya B", "88000086", "07:20", "KGWA", "N13ll"],
    ["74", "PYID Up", "21:30", "PYID", "", "", "07:20", "KGWA", "N14lBl"],
    ["75", "PYID Dn", "21:30", "PYID", "", "", "06:40", "PYID", "N15lBl"],
    ["76", "PYID Up", "21:40", "PYID", "", "", "06:30", "KGWA", "N16"],
    ["77", "KGWA Up", "21:40", "KGWA", "Mallarjun", "88000134", "07:05", "PYID", "N27Ti"]
  ];
  jmdData.forEach((jRow) => {
    ensureRow(rIdx);
    jRow.forEach((v, c) => {
      const is88 = jRow[5] && jRow[5].startsWith("88000");
      grid[rIdx][c] = {
        val: v,
        bg: c === 0 && [19, 21].includes(parseInt(v, 10)) ? "#F472B6" : c === 5 && v ? (is88 ? "#93C5FD" : "#BBF7D0") : c === 8 && v ? "#FED7AA" : "#FFFFFF",
        fg: "#000000",
        bold: c === 0 || c === 4 || c === 5 || c === 8,
        align: c === 4 ? "left" : "center"
      };
    });
    rIdx++;
  });

  // 4. Populate Right Table (Cols 9 to 13)
  let rRight = 2;

  // Controllers (CC1, CC2, CC3)
  const ccList = [
    ["06:00", "RASHMI", "20037", "14:00", "CC1"],
    ["14:00", "Deepa L", "20038", "21:30", "CC2"],
    ["21:30", "Nagesh N", "20736", "06:00", "CC3"]
  ];
  ccList.forEach((cc) => {
    ensureRow(rRight);
    cc.forEach((v, c) => {
      grid[rRight][9 + c] = { val: v, bg: c === 2 ? "#FEF08A" : "#FFFFFF", fg: "#000000", bold: true, align: c === 1 ? "left" : "center" };
    });
    rRight++;
  });

  // Standby & Auxiliary
  const sbList = [
    ["07:00", "Sharanabasappa", "22016", "15:00", "Stby"],
    ["14:00", "Sowmya A", "22480", "22:00", "Stby"],
    ["PUTH", "", "", "", "15:00"],
    ["14:00", "Naveen kumar MS", "22464", "22:00", "25:bk"],
    ["11-Aug", "Suryanarayan Rao", "88000142", "11-Aug", "BO"],
    ["11-Aug", "Sharanabasappa B", "22245", "11-Aug", "BO"],
    ["09:30", "Arun Kumar TR", "22528", "17:30", "Trg"],
    ["09:30", "Anantha", "22461", "17:30", "Trg"],
    ["05-Aug", "Subhasish Chakraborty", "22586", "", "L1"],
    ["05-Aug", "Sunil Kumar Sharma", "22572", "", "L1"],
    ["05-Aug", "Sunil PN", "22240", "", "R5"]
  ];
  sbList.forEach((sb) => {
    ensureRow(rRight);
    sb.forEach((v, c) => {
      const is88 = sb[2] && sb[2].startsWith("88000");
      grid[rRight][9 + c] = { val: v, bg: c === 2 && v ? (is88 ? "#93C5FD" : "#BBF7D0") : "#FFFFFF", fg: "#000000", bold: c === 1 || c === 2, align: c === 1 ? "left" : "center" };
    });
    rRight++;
  });

  // Weekly Off (WO)
  const woList = [
    ["", "Chikke Gowda N", "21506", "", "WO"],
    ["", "Ravindra Saahu", "22238", "", "WO"],
    ["", "Ravi HR", "22247", "", "WO"],
    ["", "Suresh Surukoli", "22284", "", "WO"],
    ["", "Shashikala M", "22457", "", "WO"],
    ["", "Pavan Kumar M", "22470", "", "WO"],
    ["", "Kaveri VS", "22493", "", "WO"],
    ["", "Harish Murthy", "22497", "", "WO"],
    ["", "Sateesh Kumar Rai", "22563", "", "WO"],
    ["", "Rajeev Kumar Singh", "22501", "", "WO"],
    ["", "Abhishek B", "88000036", "", "WO"],
    ["", "Manoj LG", "88000037", "", "WO"],
    ["", "Prajwal N", "88000100", "", "WO"]
  ];
  woList.forEach((wo, idx) => {
    ensureRow(rRight);
    wo.forEach((v, c) => {
      const is88 = wo[2] && wo[2].startsWith("88000");
      grid[rRight][9 + c] = {
        val: c === 0 && idx === 0 ? "Weekly Off" : v,
        bg: c === 2 ? (is88 ? "#93C5FD" : "#BBF7D0") : c === 0 ? "#F1F5F9" : "#FFFFFF",
        fg: "#000000",
        bold: c === 0 || c === 1 || c === 2,
        align: c === 1 ? "left" : "center",
        verticalText: c === 0 && idx === 0,
        rowSpan: c === 0 && idx === 0 ? woList.length : 1
      };
    });
    rRight++;
  });

  // Casual Leave (CL)
  const clList = [
    ["10-Aug", "Gangappa", "22502", "11-Aug", "CL"],
    ["11-Aug", "Dayanand K", "21078", "11-Aug", "CL"]
  ];
  clList.forEach((cl) => {
    ensureRow(rRight);
    cl.forEach((v, c) => {
      grid[rRight][9 + c] = { val: v, bg: c === 2 ? "#BBF7D0" : "#FFFFFF", fg: "#000000", bold: c === 1 || c === 2, align: c === 1 ? "left" : "center" };
    });
    rRight++;
  });

  // Earned Leave (EL)
  const elList = [["10-Aug", "Sowmya Kakaria VS", "21977", "11-Aug", "EL"]];
  elList.forEach((el) => {
    ensureRow(rRight);
    el.forEach((v, c) => {
      grid[rRight][9 + c] = { val: v, bg: c === 2 ? "#BBF7D0" : "#FFFFFF", fg: "#000000", bold: c === 1 || c === 2, align: c === 1 ? "left" : "center" };
    });
    rRight++;
  });

  // Other Leaves & Absents
  const otherList = [
    ["", "", "", "", "GH/EL"],
    ["", "", "", "", "GH/EL"],
    ["08-Aug", "Prajwal", "88000020", "15-Aug", "L"],
    ["11-Aug", "Nitin R", "88000085", "11-Aug", "CL"],
    ["29-Jul", "Chaitanral UG", "22456", "24-Jan", "ML"],
    ["02-Jul", "Devaraj B", "21402", "", "R6 Trg"],
    ["02-Jul", "Sunil", "22296", "", "R6 Trg"],
    ["02-Jul", "Muhammad Rafi", "22297", "", "R6 Trg"],
    ["Absent", "Sanjay Neal", "88000092", "", "AB"],
    ["Absent", "Mukesh R", "88000128", "", "AB"]
  ];
  otherList.forEach((ot) => {
    ensureRow(rRight);
    ot.forEach((v, c) => {
      const isRed = ot[0] === "Absent";
      const isPink = ot[4] === "ML";
      grid[rRight][9 + c] = {
        val: v,
        bg: isRed ? "#FEE2E2" : isPink && c === 2 ? "#F472B6" : c === 2 && v ? "#93C5FD" : "#FFFFFF",
        fg: isRed ? "#DC2626" : "#000000",
        bold: isRed || c === 1 || c === 2,
        align: c === 1 ? "left" : "center"
      };
    });
    rRight++;
  });

  // CRRC Training (Full candidate list)
  const crrcList = [
    "Harsha N (21914)", "Manjunatha (21773)", "Anand M (21724)", "Sunil Kumar Satpathy (21723)",
    "Ranjan Kumar Bharathi (22737)", "Viswanath KS (21918)", "Krishna Murthy (22115)", "Raghavendra K T (21649)",
    "Mahesh Kumar (22315)", "Mahadevaswamy S (22313)", "Nagalinga Gowda M (22116)", "Ashwin Kadketti (22491)",
    "Kalavathi KM (22500)", "Mahantesh MD (22564)", "Swetha S (22568)", "Shivashankar M (22495)",
    "Gowtham U (88000087)", "Mallarjun HS (88000051)", "Abhishek S (88000041)", "Sumanth S (88000107)",
    "Mahesha RC (88000111)", "Shruthi S (88000125)"
  ];
  crrcList.forEach((cr, idx) => {
    ensureRow(rRight);
    const parts = cr.split(" (");
    const name = parts[0];
    const empId = parts[1] ? parts[1].replace(")", "") : "";
    const is88 = empId.startsWith("88000");

    grid[rRight][9] = { val: idx === 0 ? "CRRC 4RLS OM DTG Training PEENYA" : "", bg: "#F1F5F9", fg: "#000000", bold: true, align: "center", verticalText: idx === 0, rowSpan: idx === 0 ? crrcList.length : 1 };
    grid[rRight][10] = { val: name, bg: "#FFFFFF", fg: "#000000", bold: true, align: "left" };
    grid[rRight][11] = { val: empId, bg: is88 ? "#93C5FD" : "#BBF7D0", fg: "#000000", bold: true, align: "center" };
    grid[rRight][12] = { val: "", bg: "#FFFFFF", fg: "#000000", bold: false, align: "center" };
    grid[rRight][13] = { val: "CRRC Trg", bg: "#FFFFFF", fg: "#000000", bold: false, align: "center" };
    rRight++;
  });

  return grid;
};

export default function RosterPublisherBoard({ userRole = "CONTROLLER", currentOperatorId = null }) {
  const { currentDayType = "WEEKDAY", setDayType } = useOperationalEngine() || {};

  // Interactive Excel Spreadsheet State
  const [sheetGrid, setSheetGrid] = useState(generateInitialBmrclGrid);
  const [activeCell, setActiveCell] = useState({ r: 0, c: 0 });
  const [selectionRange, setSelectionRange] = useState(null); // { r1, c1, r2, c2 }
  const [isSelectAll, setIsSelectAll] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const [editingCell, setEditingCell] = useState(null); // { r, c } or null
  const [editValue, setEditValue] = useState("");
  const [activeSheetTab, setActiveSheetTab] = useState("11 Aug Tue");

  const [isPublishing, setIsPublishing] = useState(false);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [publishSuccessMsg, setPublishSuccessMsg] = useState("");

  // History stack for Undo / Redo
  const [history, setHistory] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  const sheetRef = useRef(null);
  const fileInputRef = useRef(null);
  const cellInputRef = useRef(null);

  // Save current grid to history
  const pushHistory = useCallback((newGrid) => {
    setHistory((prev) => {
      const nextHistory = prev.slice(0, historyIndex + 1);
      return [...nextHistory, newGrid];
    });
    setHistoryIndex((prev) => prev + 1);
  }, [historyIndex]);

  // Column & Row Sizing States (Default Excel dimensions)
  const DEFAULT_COL_WIDTHS = [45, 65, 52, 52, 160, 68, 50, 50, 60, 55, 160, 68, 52, 60, 60, 60];
  const [colWidths, setColWidths] = useState(DEFAULT_COL_WIDTHS);

  const DEFAULT_ROW_HEIGHTS = Array.from({ length: 160 }, (_, i) => (i === 0 ? 25 : i === 1 ? 22 : 19));
  const [rowHeights, setRowHeights] = useState(DEFAULT_ROW_HEIGHTS);

  const [resizingCol, setResizingCol] = useState(null); // { cIdx, startX, startWidth }
  const [resizingRow, setResizingRow] = useState(null); // { rIdx, startY, startHeight }

  // ── Immediate Search Engine States ──
  const [searchQuery, setSearchQuery] = useState("");
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);
  const [isFilterOnly, setIsFilterOnly] = useState(false);
  const searchInputRef = useRef(null);

  // Calculate search matches across the entire spreadsheet grid
  const { searchMatches, matchingRowIndices } = useMemo(() => {
    const rawQ = searchQuery.trim().toLowerCase();
    if (!rawQ) return { searchMatches: [], matchingRowIndices: new Set() };

    const tokens = rawQ.split(/\s+/).filter(Boolean);
    const matches = [];
    const rowIndices = new Set();

    sheetGrid.forEach((row, rIdx) => {
      if (rIdx <= 1) return; // Skip title and header rows for duty searches

      // Left Table Fields
      const leftDutyNo = String(row[0]?.val || "").trim();
      const leftType = String(row[1]?.val || "").trim();
      const leftSignOn = String(row[2]?.val || "").trim();
      const leftSignOnPlace = String(row[3]?.val || "").trim();
      const leftName = String(row[4]?.val || "").trim();
      const leftEmpId = String(row[5]?.val || "").trim();
      const leftSignOff = String(row[6]?.val || "").trim();
      const leftSignOffPlace = String(row[7]?.val || "").trim();
      const leftLink = String(row[8]?.val || "").trim();

      // Right Table Fields
      const rightFrom = String(row[9]?.val || "").trim();
      const rightName = String(row[10]?.val || "").trim();
      const rightEmpId = String(row[11]?.val || "").trim();
      const rightTo = String(row[12]?.val || "").trim();
      const rightRole = String(row[13]?.val || "").trim();

      // Combined Row Text
      const leftCombined = `${leftDutyNo} ${leftType} ${leftName} ${leftEmpId} ${leftSignOn} ${leftSignOnPlace} ${leftSignOff} ${leftSignOffPlace} ${leftLink}`.toLowerCase();
      const rightCombined = `${rightFrom} ${rightName} ${rightEmpId} ${rightTo} ${rightRole}`.toLowerCase();
      const entireRowCombined = row.map((c) => String(c?.val || "")).join(" ").toLowerCase();

      // Check Left Side Match
      const matchesLeft = tokens.every((tok) => leftCombined.includes(tok));
      // Check Right Side Match
      const matchesRight = tokens.every((tok) => rightCombined.includes(tok));
      // Check General Row Match
      const matchesRow = tokens.every((tok) => entireRowCombined.includes(tok));

      if (matchesLeft && (leftName || leftEmpId || leftDutyNo)) {
        rowIndices.add(rIdx);
        matches.push({
          r: rIdx,
          c: 4, // Focus on Name column
          val: leftName || leftEmpId || leftDutyNo,
          side: "LEFT",
          dutyNo: leftDutyNo,
          name: leftName,
          empId: leftEmpId,
          signOnTime: leftSignOn,
          signOnPlace: leftSignOnPlace,
          signOffTime: leftSignOff,
          signOffPlace: leftSignOffPlace,
          trainLink: leftLink
        });
      } else if (matchesRight && (rightName || rightEmpId || rightRole)) {
        rowIndices.add(rIdx);
        matches.push({
          r: rIdx,
          c: 10, // Focus on Name column
          val: rightName || rightEmpId || rightRole,
          side: "RIGHT",
          dutyNo: rightRole,
          name: rightName,
          empId: rightEmpId,
          signOnTime: rightFrom,
          signOnPlace: "",
          signOffTime: rightTo,
          signOffPlace: "",
          trainLink: rightRole
        });
      } else if (matchesRow) {
        rowIndices.add(rIdx);
        // Find matching cell
        let matchedCol = 0;
        row.forEach((cell, cIdx) => {
          if (cell?.val && tokens.some((tok) => String(cell.val).toLowerCase().includes(tok))) {
            matchedCol = cIdx;
          }
        });
        matches.push({
          r: rIdx,
          c: matchedCol,
          val: row[matchedCol]?.val || "",
          side: matchedCol >= 9 ? "RIGHT" : "LEFT",
          dutyNo: leftDutyNo || rightRole,
          name: leftName || rightName || row[matchedCol]?.val || "",
          empId: leftEmpId || rightEmpId,
          signOnTime: leftSignOn || rightFrom,
          signOnPlace: leftSignOnPlace,
          signOffTime: leftSignOff || rightTo,
          signOffPlace: leftSignOffPlace,
          trainLink: leftLink || rightRole
        });
      }
    });

    return { searchMatches: matches, matchingRowIndices: rowIndices };
  }, [sheetGrid, searchQuery]);

  // Jump and auto-scroll directly to target search match
  const jumpToMatch = useCallback(
    (index) => {
      if (searchMatches.length === 0) return;
      const targetIdx = (index + searchMatches.length) % searchMatches.length;
      setCurrentMatchIndex(targetIdx);
      const match = searchMatches[targetIdx];
      setActiveCell({ r: match.r, c: match.c });
      setSelectionRange(null);
      setIsSelectAll(false);

      // Smooth scroll container to matched row
      if (sheetRef.current) {
        const rowElem = document.getElementById(`bmrcl-row-${match.r}`);
        if (rowElem) {
          const containerRect = sheetRef.current.getBoundingClientRect();
          const rowRect = rowElem.getBoundingClientRect();
          const targetScroll = sheetRef.current.scrollTop + (rowRect.top - containerRect.top) - 80;
          sheetRef.current.scrollTo({
            top: Math.max(0, targetScroll),
            behavior: "smooth"
          });
        }
      }
    },
    [searchMatches]
  );

  // Auto-jump to first match on query change
  useEffect(() => {
    if (searchMatches.length > 0) {
      jumpToMatch(0);
    }
  }, [searchQuery, searchMatches.length]);

  // ── AutoFit Column Widths (Alt + H + O + I) ──
  const autoFitColumns = useCallback(() => {
    const numCols = Math.min(sheetGrid[0]?.length || 15, 20);
    const newWidths = [];

    for (let c = 0; c < numCols; c++) {
      let maxLen = 0;
      for (let r = 1; r < sheetGrid.length; r++) {
        const cell = sheetGrid[r]?.[c];
        if (cell && cell.val && (!cell.colSpan || cell.colSpan === 1)) {
          const lines = String(cell.val).split("\n");
          lines.forEach((line) => {
            maxLen = Math.max(maxLen, line.length);
          });
        }
      }
      const calculated = Math.max(45, Math.min(350, Math.round(maxLen * 7.6 + 18)));
      newWidths.push(calculated);
    }

    setColWidths(newWidths);
    setPublishSuccessMsg("📐 Column Widths Auto-Fitted (Alt+H+O+I)!");
    setTimeout(() => setPublishSuccessMsg(""), 4000);
  }, [sheetGrid]);

  // ── AutoFit Row Heights (Alt + H + O + A) ──
  const autoFitRows = useCallback(() => {
    const newHeights = sheetGrid.map((row, rIdx) => {
      if (rIdx === 0) return 25;
      let maxLines = 1;
      row.forEach((cell) => {
        if (cell?.val) {
          const lines = String(cell.val).split("\n").length;
          maxLines = Math.max(maxLines, lines);
        }
      });
      return Math.max(19, maxLines * 16 + 3);
    });

    setRowHeights(newHeights);
    setPublishSuccessMsg("↕️ Row Heights Auto-Fitted (Alt+H+O+A)!");
    setTimeout(() => setPublishSuccessMsg(""), 4000);
  }, [sheetGrid]);

  // ── Reset Row & Column Sizing ──
  const resetSizing = useCallback(() => {
    setColWidths(DEFAULT_COL_WIDTHS);
    setRowHeights(DEFAULT_ROW_HEIGHTS);
    setPublishSuccessMsg("🔄 Row & Column Sizing Reset to Default!");
    setTimeout(() => setPublishSuccessMsg(""), 3000);
  }, []);

  // ── Mouse Drag Event Listener for Column & Row Resizing ──
  useEffect(() => {
    const handleMouseMove = (e) => {
      if (resizingCol) {
        const delta = e.clientX - resizingCol.startX;
        const newW = Math.max(30, resizingCol.startWidth + delta);
        setColWidths((prev) => {
          const copy = [...prev];
          copy[resizingCol.cIdx] = newW;
          return copy;
        });
      } else if (resizingRow) {
        const delta = e.clientY - resizingRow.startY;
        const newH = Math.max(16, resizingRow.startHeight + delta);
        setRowHeights((prev) => {
          const copy = [...prev];
          copy[resizingRow.rIdx] = newH;
          return copy;
        });
      }
    };

    const handleMouseUp = () => {
      setResizingCol(null);
      setResizingRow(null);
    };

    if (resizingCol || resizingRow) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
    }
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [resizingCol, resizingRow]);

  // ── 7-Day Auto-Purge & Realtime Published Notice Listener ──
  useEffect(() => {
    const runAutoPurgeAndListen = async () => {
      try {
        const sheetsRef = collection(db, "published_roster_sheets");
        const nowIso = new Date().toISOString();

        // 1. Purge expired sheets older than 7 days
        const expiredQuery = query(sheetsRef, where("expiresAt", "<", nowIso));
        const expiredSnap = await getDocs(expiredQuery);
        const deletePromises = expiredSnap.docs.map((d) => deleteDoc(doc(db, "published_roster_sheets", d.id)));
        await Promise.all(deletePromises);

        // 2. Realtime listener for published notices
        const unsubscribe = onSnapshot(sheetsRef, (snapshot) => {
          snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            if (data?.sheetGrid && data.dayType === activeSheetTab) {
              setSheetGrid(data.sheetGrid);
            }
          });
        });

        return () => unsubscribe();
      } catch (err) {
        console.warn("Firestore published notices sync/purge skipped:", err.message);
      }
    };

    runAutoPurgeAndListen();
  }, [activeSheetTab]);

  // Focus Cell Input when editing starts
  useEffect(() => {
    if (editingCell && cellInputRef.current) {
      cellInputRef.current.focus();
    }
  }, [editingCell]);

  // ── Cell Value Commit ──
  const commitCellValue = useCallback((r, c, val) => {
    setSheetGrid((prevGrid) => {
      const newGrid = prevGrid.map((row) => [...row]);
      if (newGrid[r] && newGrid[r][c]) {
        newGrid[r][c] = {
          ...newGrid[r][c],
          val: val
        };
      }
      pushHistory(newGrid);
      return newGrid;
    });
    setEditingCell(null);
  }, [pushHistory]);

  // ── SELECT ALL (Ctrl+A or Corner Click) ──
  const selectAll = useCallback(() => {
    const maxR = sheetGrid.length - 1;
    const maxC = (sheetGrid[0]?.length || 15) - 1;
    setSelectionRange({ r1: 0, c1: 0, r2: maxR, c2: maxC });
    setIsSelectAll(true);
    setActiveCell({ r: 0, c: 0 });
    setEditingCell(null);
  }, [sheetGrid]);

  // ── DELETE ALL / CLEAR SELECTION ──
  const clearSelectionOrAll = useCallback(() => {
    setSheetGrid((prevGrid) => {
      const newGrid = prevGrid.map((row) => [...row]);

      if (isSelectAll || !selectionRange) {
        // Clear entire sheet
        for (let r = 0; r < newGrid.length; r++) {
          for (let c = 0; c < (newGrid[r]?.length || 15); c++) {
            newGrid[r][c] = {
              val: "",
              bg: "#FFFFFF",
              fg: "#000000",
              bold: false,
              align: "center",
              border: "border-slate-300"
            };
          }
        }
      } else {
        // Clear within bounding box
        const minR = Math.min(selectionRange.r1, selectionRange.r2);
        const maxR = Math.max(selectionRange.r1, selectionRange.r2);
        const minC = Math.min(selectionRange.c1, selectionRange.c2);
        const maxC = Math.max(selectionRange.c1, selectionRange.c2);

        for (let r = minR; r <= maxR; r++) {
          for (let c = minC; c <= maxC; c++) {
            if (newGrid[r] && newGrid[r][c]) {
              newGrid[r][c] = {
                ...newGrid[r][c],
                val: "",
                bg: "#FFFFFF"
              };
            }
          }
        }
      }

      pushHistory(newGrid);
      return newGrid;
    });

    setPublishSuccessMsg("🗑️ Selected cells deleted & cleared!");
    setTimeout(() => setPublishSuccessMsg(""), 4000);
  }, [isSelectAll, selectionRange, pushHistory]);

  // ── Excel Copy Handler (Ctrl+C) ──
  const handleCopy = useCallback((e) => {
    if (editingCell) return;

    if (selectionRange || isSelectAll) {
      const minR = isSelectAll ? 0 : Math.min(selectionRange.r1, selectionRange.r2);
      const maxR = isSelectAll ? sheetGrid.length - 1 : Math.max(selectionRange.r1, selectionRange.r2);
      const minC = isSelectAll ? 0 : Math.min(selectionRange.c1, selectionRange.c2);
      const maxC = isSelectAll ? (sheetGrid[0]?.length || 15) - 1 : Math.max(selectionRange.c1, selectionRange.c2);

      const rowsText = [];
      for (let r = minR; r <= maxR; r++) {
        const rowCells = [];
        for (let c = minC; c <= maxC; c++) {
          rowCells.push(sheetGrid[r]?.[c]?.val || "");
        }
        rowsText.push(rowCells.join("\t"));
      }
      navigator.clipboard.writeText(rowsText.join("\n"));
    } else {
      const currentVal = sheetGrid[activeCell.r]?.[activeCell.c]?.val || "";
      navigator.clipboard.writeText(currentVal);
    }
  }, [activeCell, editingCell, selectionRange, isSelectAll, sheetGrid]);

  // ── Helper to Parse Rich HTML Table from Excel Clipboard (Captures 100% exact colors, highlights, fonts, spans) ──
  const parseHtmlTableFromClipboard = (htmlStr) => {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(htmlStr, "text/html");
      const table = doc.querySelector("table");
      if (!table) return null;

      const trList = Array.from(table.querySelectorAll("tr"));
      if (trList.length === 0) return null;

      const matrix = [];
      trList.forEach((tr) => {
        const cellList = Array.from(tr.querySelectorAll("td, th"));
        if (cellList.length === 0) return;

        const rowCells = cellList.map((cell) => {
          const val = cell.innerText !== undefined ? cell.innerText.trim() : (cell.textContent || "").trim();

          // Extract exact background color
          let bg = cell.style.backgroundColor || cell.getAttribute("bgcolor") || "";
          if (!bg && cell.style.background) {
            bg = cell.style.background;
          }

          // Extract exact text color
          let fg = cell.style.color || "#000000";

          // Extract font weight & style
          const isBold =
            cell.style.fontWeight === "bold" ||
            parseInt(cell.style.fontWeight, 10) >= 600 ||
            cell.querySelector("b, strong") !== null ||
            cell.tagName === "TH";

          const isItalic =
            cell.style.fontStyle === "italic" ||
            cell.querySelector("i, em") !== null;

          // Extract text alignment
          let align = cell.style.textAlign || cell.getAttribute("align") || "center";

          // Extract merged cell dimensions
          const colSpan = parseInt(cell.getAttribute("colspan") || 1, 10);
          const rowSpan = parseInt(cell.getAttribute("rowspan") || 1, 10);

          return {
            val: val,
            bg: bg || "#FFFFFF",
            fg: fg || "#000000",
            bold: isBold,
            italic: isItalic,
            align: align,
            colSpan: isNaN(colSpan) ? 1 : colSpan,
            rowSpan: isNaN(rowSpan) ? 1 : rowSpan
          };
        });

        matrix.push(rowCells);
      });

      return matrix.length > 0 ? matrix : null;
    } catch (err) {
      console.warn("HTML Table clipboard parse error, falling back to text:", err);
      return null;
    }
  };

  // ── PASTE ALL COPIED DATA AT ONE TIME (Ctrl+V) WITH 100% PROPERTY FIDELITY ──
  const handlePaste = useCallback((e) => {
    if (editingCell) return;

    const clipHtml = e.clipboardData?.getData("text/html") || "";
    const clipText = e.clipboardData?.getData("text") || "";
    if (!clipHtml && (!clipText || clipText.trim().length === 0)) return;
    e.preventDefault();

    try {
      // 1. Try parsing Rich HTML Table from Excel (preserves exact cell colors, highlights, fonts, borders)
      const richMatrix = clipHtml ? parseHtmlTableFromClipboard(clipHtml) : null;

      let matrix = [];
      if (richMatrix && richMatrix.length > 0) {
        matrix = richMatrix;
      } else {
        // 2. Fallback to Tab-Separated plain text
        const rawLines = clipText.split(/\r?\n/).filter((line) => line.length > 0);
        if (rawLines.length === 0) return;

        matrix = rawLines.map((row) =>
          row.split("\t").map((cellStr) => {
            const cleanVal = String(cellStr !== undefined && cellStr !== null ? cellStr : "").trim();
            const is88 = cleanVal.startsWith("88000");
            const isRegId = /^\d{5}$/.test(cleanVal);
            const isLink = cleanVal.length >= 2 && cleanVal.length <= 8 && /^[A-Z0-9+]+$/.test(cleanVal);
            const isHeaderTitle = cleanVal.includes("August") || cleanVal.includes("Sunday") || cleanVal.includes("Saturday") || cleanVal.includes("Monday") || cleanVal.includes("Tuesday");

            let cellBg = "#FFFFFF";
            let cellFg = "#000000";
            let isBold = false;

            if (isHeaderTitle) {
              cellBg = cleanVal.includes("Sunday") ? "#FACC15" : cleanVal.includes("Saturday") ? "#F472B6" : cleanVal.includes("Monday") ? "#A3E635" : "#38BDF8";
              isBold = true;
            } else if (cleanVal.toUpperCase().includes("TESTING") || cleanVal.toUpperCase().includes("TRAINING") || cleanVal.toUpperCase().includes("TRG")) {
              cellBg = "#BBF7D0";
              isBold = true;
            } else if (is88) {
              cellBg = "#93C5FD";
              isBold = true;
            } else if (isRegId) {
              cellBg = "#BBF7D0";
              isBold = true;
            } else if (isLink) {
              cellBg = "#FED7AA";
              isBold = true;
            } else if (cleanVal.toUpperCase() === "WO" || cleanVal.toUpperCase() === "WEEKLY OFF") {
              cellBg = "#F1F5F9";
              isBold = true;
            } else if (cleanVal.toUpperCase() === "AB" || cleanVal.toUpperCase() === "ABSENT") {
              cellBg = "#FEE2E2";
              cellFg = "#DC2626";
              isBold = true;
            }

            return {
              val: cleanVal,
              bg: cellBg,
              fg: cellFg,
              bold: isBold,
              italic: false,
              align: "center",
              colSpan: 1,
              rowSpan: 1
            };
          })
        );
      }

      const pasteRowsCount = matrix.length;
      const pasteColsCount = Math.max(...matrix.map((r) => r.length));

      // Determine starting cell
      const startR = isSelectAll ? 0 : activeCell.r;
      const startC = isSelectAll ? 0 : activeCell.c;

      // Dynamic sizing: ensure the grid has enough rows and columns to hold all pasted data!
      const requiredRows = Math.max(140, startR + pasteRowsCount + 10);
      const requiredCols = Math.max(16, startC + pasteColsCount + 2);

      setSheetGrid((prevGrid) => {
        // Expand grid if needed
        let newGrid = Array.from({ length: requiredRows }, (_, rIdx) => {
          if (rIdx < prevGrid.length) {
            const existingRow = [...prevGrid[rIdx]];
            while (existingRow.length < requiredCols) {
              existingRow.push({ val: "", bg: "#FFFFFF", fg: "#000000", bold: false, italic: false, align: "center", border: "border-slate-300" });
            }
            return existingRow;
          }
          return Array.from({ length: requiredCols }, () => ({
            val: "",
            bg: "#FFFFFF",
            fg: "#000000",
            bold: false,
            italic: false,
            align: "center",
            border: "border-slate-300"
          }));
        });

        // Apply pasted cells with 100% exact properties
        matrix.forEach((pRow, rOffset) => {
          const targetR = startR + rOffset;
          pRow.forEach((pCell, cOffset) => {
            const targetC = startC + cOffset;
            newGrid[targetR][targetC] = {
              val: pCell.val,
              bg: pCell.bg || "#FFFFFF",
              fg: pCell.fg || "#000000",
              bold: pCell.bold || false,
              italic: pCell.italic || false,
              align: pCell.align || "center",
              colSpan: pCell.colSpan || 1,
              rowSpan: pCell.rowSpan || 1
            };
          });
        });

        pushHistory(newGrid);
        return newGrid;
      });

      setIsSelectAll(false);
      setSelectionRange(null);
      setPublishSuccessMsg(`📋 All Copied Properties (Colors, Highlights, Text, Formats) Pasted Exactly! (${pasteRowsCount} rows x ${pasteColsCount} cols starting at ${colToLetter(startC)}${startR + 1})`);
      setTimeout(() => setPublishSuccessMsg(""), 6000);

      // AutoFit columns and rows to newly pasted data
      setTimeout(() => {
        autoFitColumns();
        autoFitRows();
      }, 50);
    } catch (err) {
      console.error("Paste error:", err);
      alert("Failed to paste data: " + err.message);
    }
  }, [activeCell, editingCell, isSelectAll, pushHistory, autoFitColumns, autoFitRows]);

  // Track sequence for Excel Alt shortcuts (Alt+H+O+I and Alt+H+O+A)
  const altKeySequenceRef = useRef([]);

  // ── Keyboard Navigation (Ctrl+A, Delete, Arrows, Tab, Enter, Alt Shortcuts) ──
  const handleKeyDown = useCallback((e) => {
    // Excel Alt+H+O+I (AutoFit Columns) and Alt+H+O+A (AutoFit Rows)
    if (e.altKey) {
      if (e.key.toLowerCase() === "i") {
        e.preventDefault();
        autoFitColumns();
        return;
      }
      if (e.key.toLowerCase() === "a") {
        e.preventDefault();
        autoFitRows();
        return;
      }
    }

    // Sequence tracking for Alt -> H -> O -> I / A
    if (e.altKey && e.key.toLowerCase() === "h") {
      altKeySequenceRef.current = ["h"];
    } else if (altKeySequenceRef.current.length === 1 && e.key.toLowerCase() === "o") {
      altKeySequenceRef.current.push("o");
    } else if (altKeySequenceRef.current.length === 2) {
      if (e.key.toLowerCase() === "i") {
        e.preventDefault();
        altKeySequenceRef.current = [];
        autoFitColumns();
        return;
      } else if (e.key.toLowerCase() === "a") {
        e.preventDefault();
        altKeySequenceRef.current = [];
        autoFitRows();
        return;
      } else {
        altKeySequenceRef.current = [];
      }
    }

    // Ctrl+F -> Search Focus
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f") {
      e.preventDefault();
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
      return;
    }

    // Ctrl+A -> Select All
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "a") {
      if (!editingCell) {
        e.preventDefault();
        selectAll();
        return;
      }
    }

    // Ctrl+Z -> Undo
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
      if (!editingCell && historyIndex > 0) {
        e.preventDefault();
        setSheetGrid(history[historyIndex - 1]);
        setHistoryIndex((prev) => prev - 1);
        return;
      }
    }

    if (editingCell) {
      if (e.key === "Enter") {
        commitCellValue(editingCell.r, editingCell.c, editValue);
        setActiveCell((prev) => ({ r: Math.min(sheetGrid.length - 1, prev.r + 1), c: prev.c }));
      } else if (e.key === "Escape") {
        setEditingCell(null);
      } else if (e.key === "Tab") {
        e.preventDefault();
        commitCellValue(editingCell.r, editingCell.c, editValue);
        setActiveCell((prev) => ({ r: prev.r, c: Math.min(sheetGrid[0].length - 1, prev.c + 1) }));
      }
      return;
    }

    if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      clearSelectionOrAll();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setIsSelectAll(false);
      setSelectionRange(null);
      setActiveCell((prev) => ({ r: Math.max(0, prev.r - 1), c: prev.c }));
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setIsSelectAll(false);
      setSelectionRange(null);
      setActiveCell((prev) => ({ r: Math.min(sheetGrid.length - 1, prev.r + 1), c: prev.c }));
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      setIsSelectAll(false);
      setSelectionRange(null);
      setActiveCell((prev) => ({ r: prev.r, c: Math.max(0, prev.c - 1) }));
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      setIsSelectAll(false);
      setSelectionRange(null);
      setActiveCell((prev) => ({ r: prev.r, c: Math.min(sheetGrid[0].length - 1, prev.c + 1) }));
    } else if (e.key === "Tab") {
      e.preventDefault();
      setIsSelectAll(false);
      setSelectionRange(null);
      setActiveCell((prev) => ({ r: prev.r, c: (prev.c + 1) % sheetGrid[0].length }));
    } else if (e.key === "Enter") {
      e.preventDefault();
      setEditingCell(activeCell);
      setEditValue(sheetGrid[activeCell.r]?.[activeCell.c]?.val || "");
    } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      setEditingCell(activeCell);
      setEditValue(e.key);
    }
  }, [editingCell, editValue, activeCell, sheetGrid, history, historyIndex, selectAll, clearSelectionOrAll, commitCellValue, autoFitColumns, autoFitRows]);

  // Attach global keyboard, paste, and copy handlers
  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("paste", handlePaste);
    window.addEventListener("copy", handleCopy);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("paste", handlePaste);
      window.removeEventListener("copy", handleCopy);
    };
  }, [handleKeyDown, handlePaste, handleCopy]);

  // ── Open Excel File (.xlsx, .xls, .csv) ──
  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const binaryStr = evt.target?.result;
        const workbook = XLSX.read(binaryStr, { type: "binary" });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const rawRows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" });

        if (rawRows.length > 0) {
          const NUM_ROWS = Math.max(140, rawRows.length + 10);
          const NUM_COLS = Math.max(16, Math.max(...rawRows.map((r) => r.length)) + 2);
          const newGrid = createEmptyGrid(NUM_ROWS, NUM_COLS);

          rawRows.forEach((row, rIdx) => {
            row.forEach((cellVal, cIdx) => {
              const strVal = String(cellVal !== undefined && cellVal !== null ? cellVal : "").trim();
              const is88 = strVal.startsWith("88000");
              const isReg = /^\d{5}$/.test(strVal);

              newGrid[rIdx][cIdx] = {
                val: strVal,
                bg: rIdx === 0 ? "#38BDF8" : is88 ? "#93C5FD" : isReg ? "#BBF7D0" : "#FFFFFF",
                fg: "#000000",
                bold: rIdx <= 1 || cIdx === 0 || cIdx === 4 || cIdx === 5 || cIdx === 8,
                italic: false,
                align: cIdx === 4 || cIdx === 10 ? "left" : "center",
                colSpan: rIdx === 0 && cIdx === 0 ? 14 : 1
              };
            });
          });

          setSheetGrid(newGrid);
          pushHistory(newGrid);
          setPublishSuccessMsg(`📊 Excel Sheet "${file.name}" Loaded Completely! (${rawRows.length} Rows Imported)`);
          setTimeout(() => setPublishSuccessMsg(""), 6000);

          setTimeout(() => {
            autoFitColumns();
            autoFitRows();
          }, 50);
        }
      } catch (err) {
        console.error("File load error:", err);
        alert("Failed to load Excel file: " + err.message);
      }
    };
    reader.readAsBinaryString(file);
  };

  // ── 1-Click Publish to Train Operators with 7-Day Auto-Purge ──
  const handlePublishForCrew = async () => {
    setIsPublishing(true);
    setPublishSuccessMsg("");
    try {
      const now = new Date();
      const expires = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

      const payload = {
        dayType: activeSheetTab,
        title: sheetGrid[0]?.[0]?.val || "BMRCL Line 2 Roster Sheet",
        publishedAt: now.toISOString(),
        expiresAt: expires.toISOString(),
        publishedDate: now.toLocaleDateString("en-GB"),
        version: "BMRCL_EXCEL_V" + Date.now().toString().slice(-4),
        sheetGrid: sheetGrid,
        colWidths: colWidths,
        rowHeights: rowHeights
      };

      const docId = `BMRCL_ROSTER_${activeSheetTab.replace(/\s+/g, "_").toUpperCase()}`;
      await setDoc(doc(db, "published_roster_sheets", docId), payload);

      setPublishSuccessMsg(`✅ Official Excel Roster Published to all Train Operators! (Auto-expires in 7 days)`);
      setTimeout(() => setPublishSuccessMsg(""), 7000);
    } catch (err) {
      console.error("Failed to publish roster:", err);
      setPublishSuccessMsg(`❌ Publication failed: ${err.message}`);
    } finally {
      setIsPublishing(false);
    }
  };

  // ── 1-Click High-Resolution PNG Image Download ──
  const handleDownloadImage = async () => {
    if (!sheetRef.current) return;
    setIsGeneratingImage(true);
    try {
      const element = sheetRef.current;
      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#ffffff",
        logging: false
      });

      const image = canvas.toDataURL("image/png");
      const link = document.createElement("a");
      link.href = image;
      link.download = `BMRCL_Roster_Sheet_${activeSheetTab.replace(/\s+/g, "_")}.png`;
      link.click();
    } catch (err) {
      console.error("Image generation error:", err);
      alert("Failed to export image: " + err.message);
    } finally {
      setIsGeneratingImage(false);
    }
  };

  // ── 1-Click Export to Real Excel File (.xlsx) ──
  const handleExportExcel = () => {
    try {
      const data = sheetGrid.map((row) => row.map((cell) => cell.val || ""));
      const ws = XLSX.utils.aoa_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, activeSheetTab);
      XLSX.writeFile(wb, `BMRCL_Peenya_Roster_${activeSheetTab.replace(/\s+/g, "_")}.xlsx`);
    } catch (err) {
      console.error("Export error:", err);
      alert("Failed to export Excel: " + err.message);
    }
  };

  // Check if cell is in active selection
  const isCellSelected = (r, c) => {
    if (isSelectAll) return true;
    if (!selectionRange) return activeCell.r === r && activeCell.c === c;
    const minR = Math.min(selectionRange.r1, selectionRange.r2);
    const maxR = Math.max(selectionRange.r1, selectionRange.r2);
    const minC = Math.min(selectionRange.c1, selectionRange.c2);
    const maxC = Math.max(selectionRange.c1, selectionRange.c2);
    return r >= minR && r <= maxR && c >= minC && c <= maxC;
  };

  const activeCellCoord = isSelectAll
    ? `A1:${colToLetter((sheetGrid[0]?.length || 15) - 1)}${sheetGrid.length}`
    : selectionRange
      ? `${colToLetter(Math.min(selectionRange.c1, selectionRange.c2))}${Math.min(selectionRange.r1, selectionRange.r2) + 1}:${colToLetter(Math.max(selectionRange.c1, selectionRange.c2))}${Math.max(selectionRange.r1, selectionRange.r2) + 1}`
      : `${colToLetter(activeCell.c)}${activeCell.r + 1}`;

  const activeCellValue = sheetGrid[activeCell.r]?.[activeCell.c]?.val || "";

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-2 sm:p-4 space-y-3 font-sans select-none">
      {/* ── Excel Ribbon & Command Toolbar ── */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 shadow-2xl space-y-2.5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-emerald-500/20 border border-emerald-500/40 rounded-lg text-emerald-400 shadow-inner">
              <FileSpreadsheet className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <h1 className="text-base sm:text-lg font-black tracking-wider text-white uppercase flex items-center gap-2">
                BMRCL Line 2 Roster Spreadsheet
                <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 font-mono">
                  EXCEL AUTOFIT & RESIZE ENGINE
                </span>
              </h1>
              <p className="text-[11px] text-slate-400">
                Excel Shortcuts: <kbd className="px-1 py-0.2 bg-slate-800 border border-slate-700 rounded text-cyan-300 font-mono">Alt+H+O+I</kbd> AutoFit Widths, <kbd className="px-1 py-0.2 bg-slate-800 border border-slate-700 rounded text-cyan-300 font-mono">Alt+H+O+A</kbd> AutoFit Heights, or drag/double-click column & row borders!
              </p>
            </div>
          </div>

          {/* Action Toolbar */}
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              accept=".xlsx, .xls, .csv"
              className="hidden"
            />

            {/* AutoFit Columns Button */}
            <button
              onClick={autoFitColumns}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-cyan-500/40 font-bold text-xs uppercase transition active:scale-95 shadow-sm"
              title="AutoFit Column Widths (Alt+H+O+I / Alt+I)"
            >
              <Maximize2 className="w-3.5 h-3.5 rotate-45 text-cyan-400" />
              <span>AutoFit Columns (Alt+H+O+I)</span>
            </button>

            {/* AutoFit Rows Button */}
            <button
              onClick={autoFitRows}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-cyan-500/40 font-bold text-xs uppercase transition active:scale-95 shadow-sm"
              title="AutoFit Row Heights (Alt+H+O+A / Alt+A)"
            >
              <Maximize2 className="w-3.5 h-3.5 text-cyan-400" />
              <span>AutoFit Rows (Alt+H+O+A)</span>
            </button>

            {/* Reset Sizing */}
            <button
              onClick={resetSizing}
              className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 font-bold text-xs uppercase transition active:scale-95"
              title="Reset Sizing to Default"
            >
              <RefreshCw className="w-3.5 h-3.5 text-slate-400" />
              <span>Reset</span>
            </button>

            {/* Select All Button */}
            <button
              onClick={selectAll}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border font-bold text-xs uppercase transition active:scale-95 ${
                isSelectAll ? "bg-cyan-500 text-slate-950 border-cyan-400 font-black shadow-md shadow-cyan-950/50" : "bg-slate-800 hover:bg-slate-700 text-cyan-300 border-cyan-500/40"
              }`}
              title="Select All Cells (Ctrl+A)"
            >
              <CheckSquare className="w-3.5 h-3.5" />
              <span>Select All (Ctrl+A)</span>
            </button>

            {/* Clear All / Delete Button */}
            <button
              onClick={clearSelectionOrAll}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-rose-950/80 hover:bg-rose-900 text-rose-300 border border-rose-500/40 font-bold text-xs uppercase transition active:scale-95"
              title="Delete Selected Cells (Delete Key)"
            >
              <Eraser className="w-3.5 h-3.5" />
              <span>{isSelectAll ? "Clear Sheet" : "Delete"}</span>
            </button>

            {userRole === "CONTROLLER" && (
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-bold text-xs uppercase transition active:scale-95"
              >
                <UploadCloud className="w-3.5 h-3.5 text-cyan-400" />
                <span>Open File</span>
              </button>
            )}

            <button
              onClick={handleExportExcel}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-emerald-300 border border-emerald-500/40 font-bold text-xs uppercase transition active:scale-95"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Save .XLSX</span>
            </button>

            <button
              onClick={handleDownloadImage}
              disabled={isGeneratingImage}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs uppercase transition active:scale-95"
            >
              {isGeneratingImage ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <ImageIcon className="w-3.5 h-3.5" />}
              <span>PNG</span>
            </button>

            {userRole === "CONTROLLER" && (
              <button
                onClick={handlePublishForCrew}
                disabled={isPublishing}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-slate-950 font-black text-xs uppercase shadow-md shadow-amber-950/50 transition active:scale-95 disabled:opacity-50"
              >
                {isPublishing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                <span>Publish</span>
              </button>
            )}
          </div>
        </div>

        {/* Excel Formula & Selection Bar */}
        <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-lg p-1.5 text-xs font-mono">
          <div className="px-2.5 py-1 bg-slate-900 border border-slate-700 rounded text-cyan-300 font-bold min-w-[70px] text-center">
            {activeCellCoord}
          </div>
          <span className="text-slate-500 font-bold select-none">fx</span>
          <input
            type="text"
            value={editingCell ? editValue : activeCellValue}
            onChange={(e) => {
              setEditingCell(activeCell);
              setEditValue(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                commitCellValue(activeCell.r, activeCell.c, e.target.value);
              }
            }}
            placeholder="Click any cell or paste copied Excel content..."
            className="flex-1 bg-transparent text-white px-2 py-0.5 focus:outline-none placeholder-slate-600"
          />
        </div>

        {/* ── Real-Time Immediate Search & Navigation Bar (Ctrl+F) ── */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs">
          <div className="flex items-center gap-2 flex-1">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-cyan-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    if (e.shiftKey) jumpToMatch(currentMatchIndex - 1);
                    else jumpToMatch(currentMatchIndex + 1);
                  } else if (e.key === "Escape") {
                    setSearchQuery("");
                  }
                }}
                placeholder="🔍 Immediate Search: Type Train Operator Name, Emp ID (21xxx / 88000xxx), Duty No (Ctrl+F)..."
                className="w-full bg-slate-900 border border-slate-700 focus:border-cyan-500 rounded-lg pl-9 pr-8 py-1.5 text-white placeholder-slate-500 font-medium focus:outline-none focus:ring-1 focus:ring-cyan-500 text-xs"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-0.5 font-bold"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Match Counter & Prev/Next Navigator */}
            {searchQuery.trim() && (
              <div className="flex items-center gap-1.5 shrink-0">
                <span
                  className={`px-2 py-1 rounded text-[11px] font-bold ${
                    searchMatches.length > 0
                      ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                      : "bg-rose-500/20 text-rose-300 border border-rose-500/40"
                  }`}
                >
                  {searchMatches.length > 0
                    ? `${currentMatchIndex + 1} of ${searchMatches.length} matches`
                    : "0 matches"}
                </span>

                <button
                  onClick={() => jumpToMatch(currentMatchIndex - 1)}
                  disabled={searchMatches.length === 0}
                  className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-white rounded border border-slate-700 disabled:opacity-40 text-xs font-bold transition active:scale-95"
                  title="Previous Match (Shift+Enter)"
                >
                  ▲ Prev
                </button>
                <button
                  onClick={() => jumpToMatch(currentMatchIndex + 1)}
                  disabled={searchMatches.length === 0}
                  className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-white rounded border border-slate-700 disabled:opacity-40 text-xs font-bold transition active:scale-95"
                  title="Next Match (Enter)"
                >
                  ▼ Next
                </button>

                {/* Filter / Focus Mode Toggle */}
                <button
                  onClick={() => setIsFilterOnly((prev) => !prev)}
                  className={`px-2 py-1 rounded border text-xs font-bold transition active:scale-95 flex items-center gap-1 ${
                    isFilterOnly
                      ? "bg-amber-500 text-slate-950 border-amber-400 font-black shadow-md"
                      : "bg-slate-800 hover:bg-slate-700 text-amber-300 border-amber-500/40"
                  }`}
                  title="Filter to show ONLY matching duty rows"
                >
                  <span>{isFilterOnly ? "🎯 Filter ON" : "🎯 Filter Matches"}</span>
                </button>
              </div>
            )}
          </div>

          {/* Active Match Duty Information Pill */}
          {searchMatches.length > 0 && searchMatches[currentMatchIndex] && (
            <div className="bg-emerald-950/80 border border-emerald-500/50 rounded-lg px-2.5 py-1 text-[11px] text-emerald-200 flex items-center gap-2 font-mono truncate max-w-full">
              <span className="font-bold text-white">
                👤 {searchMatches[currentMatchIndex].name || searchMatches[currentMatchIndex].val}
              </span>
              {searchMatches[currentMatchIndex].empId && (
                <span className="text-cyan-300 font-bold">ID: {searchMatches[currentMatchIndex].empId}</span>
              )}
              {searchMatches[currentMatchIndex].dutyNo && (
                <span className="text-amber-300 font-black">Duty: #{searchMatches[currentMatchIndex].dutyNo}</span>
              )}
              {searchMatches[currentMatchIndex].signOnTime && (
                <span className="text-slate-300">
                  ON: {searchMatches[currentMatchIndex].signOnTime} ({searchMatches[currentMatchIndex].signOnPlace || "PYID"})
                </span>
              )}
              {searchMatches[currentMatchIndex].signOffTime && (
                <span className="text-slate-300">
                  OFF: {searchMatches[currentMatchIndex].signOffTime} ({searchMatches[currentMatchIndex].signOffPlace || "PYID"})
                </span>
              )}
              {searchMatches[currentMatchIndex].trainLink && (
                <span className="text-orange-300 font-bold">Link: {searchMatches[currentMatchIndex].trainLink}</span>
              )}
            </div>
          )}
        </div>

        {publishSuccessMsg && (
          <div className="p-2 bg-emerald-950/80 border border-emerald-500/60 rounded-lg text-emerald-300 text-xs font-bold flex items-center gap-2 animate-fadeIn">
            <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{publishSuccessMsg}</span>
          </div>
        )}
      </div>

      {/* ── Interactive 1:1 Excel Single-Sheet Grid Canvas ── */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-2xl flex flex-col">
        <div
          className="overflow-auto max-h-[80vh] bg-white text-black font-sans relative"
          ref={sheetRef}
          onMouseUp={() => setIsDragging(false)}
        >
          <table className="border-collapse text-[10px] w-full" style={{ fontFamily: "Segoe UI, Arial, sans-serif" }}>
            {/* Top Excel Column Header (Corner Box, A, B, C, D, ..., N) */}
            <thead>
              <tr className="bg-slate-200 text-slate-700 font-bold border-b border-black select-none text-center h-[22px]">
                {/* Top-left corner box (Click to Select All) */}
                <th
                  onClick={selectAll}
                  className={`w-[34px] min-w-[34px] max-w-[34px] border-r border-b border-black cursor-pointer text-[9px] hover:bg-cyan-300 transition relative ${
                    isSelectAll ? "bg-cyan-400 text-slate-950 font-black" : "bg-slate-300"
                  }`}
                  title="Click to Select Entire Sheet (Ctrl+A)"
                >
                  ◢
                </th>

                {Array.from({ length: Math.min(15, sheetGrid[0]?.length || 15) }).map((_, cIdx) => (
                  <th
                    key={cIdx}
                    onClick={() => {
                      setIsSelectAll(false);
                      setSelectionRange({ r1: 0, c1: cIdx, r2: sheetGrid.length - 1, c2: cIdx });
                      setActiveCell({ r: 0, c: cIdx });
                    }}
                    style={{
                      width: `${colWidths[cIdx] || 55}px`,
                      minWidth: `${colWidths[cIdx] || 55}px`,
                      maxWidth: `${colWidths[cIdx] || 55}px`
                    }}
                    className={`border-r border-black p-0.5 cursor-pointer hover:bg-cyan-200 transition relative ${
                      activeCell.c === cIdx || (selectionRange && cIdx >= Math.min(selectionRange.c1, selectionRange.c2) && cIdx <= Math.max(selectionRange.c1, selectionRange.c2))
                        ? "bg-cyan-300 text-cyan-950 font-black"
                        : "bg-slate-200"
                    }`}
                    title={`Click to select column ${colToLetter(cIdx)} (Drag right border to resize, double-click to AutoFit)`}
                  >
                    <span>{colToLetter(cIdx)}</span>

                    {/* Draggable Column Resize Handle */}
                    <div
                      className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-cyan-500 active:bg-cyan-600 z-20"
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        setResizingCol({ cIdx, startX: e.clientX, startWidth: colWidths[cIdx] || 55 });
                      }}
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        // AutoFit this specific column
                        let maxLen = 0;
                        for (let r = 1; r < sheetGrid.length; r++) {
                          const cell = sheetGrid[r]?.[cIdx];
                          if (cell?.val && (!cell.colSpan || cell.colSpan === 1)) {
                            const lines = String(cell.val).split("\n");
                            lines.forEach((l) => (maxLen = Math.max(maxLen, l.length)));
                          }
                        }
                        const newWidth = Math.max(45, Math.min(350, Math.round(maxLen * 7.6 + 18)));
                        setColWidths((prev) => {
                          const copy = [...prev];
                          copy[cIdx] = newWidth;
                          return copy;
                        });
                      }}
                    />
                  </th>
                ))}
              </tr>
            </thead>

            {/* Spreadsheet Rows */}
            <tbody>
              {sheetGrid.map((row, rIdx) => {
                // Filter check: If filter mode is ON, only render Row 0, Row 1, and matching rows
                if (isFilterOnly && searchQuery.trim() && rIdx > 1 && !matchingRowIndices.has(rIdx)) {
                  return null;
                }

                let skipCols = 0;
                const rowHeight = rowHeights[rIdx] || 19;
                const isMatchingRow = searchQuery.trim() && matchingRowIndices.has(rIdx);
                const isCurrentMatchRow = searchQuery.trim() && searchMatches[currentMatchIndex]?.r === rIdx;

                return (
                  <tr
                    key={rIdx}
                    id={`bmrcl-row-${rIdx}`}
                    style={{ height: `${rowHeight}px` }}
                    className={`border-b border-slate-300 transition-all ${
                      isCurrentMatchRow
                        ? "bg-amber-100/90 ring-2 ring-amber-500 font-bold"
                        : isMatchingRow
                          ? "bg-amber-50/70"
                          : ""
                    }`}
                  >
                    {/* Left Excel Row Number (Click to Select Entire Row) */}
                    <td
                      onClick={() => {
                        setIsSelectAll(false);
                        setSelectionRange({ r1: rIdx, c1: 0, r2: rIdx, c2: (sheetGrid[0]?.length || 15) - 1 });
                        setActiveCell({ r: rIdx, c: 0 });
                      }}
                      style={{ height: `${rowHeight}px` }}
                      className={`border-r border-black text-center font-mono text-[9px] select-none p-0.5 cursor-pointer hover:bg-cyan-200 transition relative ${
                        isCurrentMatchRow
                          ? "bg-amber-400 text-slate-950 font-black"
                          : isMatchingRow
                            ? "bg-amber-200 text-slate-900 font-bold"
                            : activeCell.r === rIdx || (selectionRange && rIdx >= Math.min(selectionRange.r1, selectionRange.r2) && rIdx <= Math.max(selectionRange.r1, selectionRange.r2))
                              ? "bg-cyan-300 text-cyan-950 font-black"
                              : "bg-slate-200 text-slate-700 font-bold"
                      }`}
                      title={`Click to select row ${rIdx + 1} (Drag bottom border to resize, double-click to AutoFit)`}
                    >
                      <span>{rIdx + 1}</span>

                      {/* Draggable Row Resize Handle */}
                      <div
                        className="absolute left-0 right-0 bottom-0 h-1.5 cursor-row-resize hover:bg-cyan-500 active:bg-cyan-600 z-20"
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          setResizingRow({ rIdx, startY: e.clientY, startHeight: rowHeight });
                        }}
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          let maxLines = 1;
                          row.forEach((c) => {
                            if (c?.val) maxLines = Math.max(maxLines, String(c.val).split("\n").length);
                          });
                          const newHeight = Math.max(19, maxLines * 16 + 3);
                          setRowHeights((prev) => {
                            const copy = [...prev];
                            copy[rIdx] = newHeight;
                            return copy;
                          });
                        }}
                      />
                    </td>

                    {/* Cells A to N */}
                    {row.slice(0, 15).map((cell, cIdx) => {
                      if (skipCols > 0) {
                        skipCols--;
                        return null;
                      }

                      const isSelected = isCellSelected(rIdx, cIdx);
                      const isFocused = activeCell.r === rIdx && activeCell.c === cIdx;
                      const isEditing = editingCell?.r === rIdx && editingCell?.c === cIdx;

                      // Check search match
                      const isSearchMatch =
                        searchQuery.trim() &&
                        cell?.val &&
                        String(cell.val).toLowerCase().includes(searchQuery.trim().toLowerCase());

                      const isCurrentMatch =
                        searchMatches[currentMatchIndex]?.r === rIdx &&
                        (searchMatches[currentMatchIndex]?.c === cIdx || (isCurrentMatchRow && (cIdx === 4 || cIdx === 5 || cIdx === 10 || cIdx === 11)));

                      if (cell.colSpan && cell.colSpan > 1) {
                        skipCols = cell.colSpan - 1;
                      }

                      let cellBg = isMatchingRow ? "#FEF9C3" : cell.bg || "#FFFFFF";
                      let cellFg = cell.fg || "#000000";
                      let cellWeight = cell.bold ? "bold" : "normal";

                      if (isCurrentMatch) {
                        cellBg = "#F59E0B";
                        cellFg = "#000000";
                        cellWeight = "900";
                      } else if (isSearchMatch) {
                        cellBg = "#FEF08A";
                        cellFg = "#000000";
                        cellWeight = "bold";
                      } else if (isSelected) {
                        cellBg = isFocused ? "#E0F2FE" : "#BAE6FD";
                      }

                      return (
                        <td
                          key={cIdx}
                          colSpan={cell.colSpan || 1}
                          rowSpan={cell.rowSpan || 1}
                          onMouseDown={() => {
                            setIsDragging(true);
                            setIsSelectAll(false);
                            setActiveCell({ r: rIdx, c: cIdx });
                            setSelectionRange({ r1: rIdx, c1: cIdx, r2: rIdx, c2: cIdx });
                            setEditingCell(null);
                          }}
                          onMouseEnter={() => {
                            if (isDragging && selectionRange) {
                              setSelectionRange((prev) => ({
                                ...prev,
                                r2: rIdx,
                                c2: cIdx
                              }));
                            }
                          }}
                          onDoubleClick={() => {
                            setActiveCell({ r: rIdx, c: cIdx });
                            setEditingCell({ r: rIdx, c: cIdx });
                            setEditValue(cell.val || "");
                          }}
                          style={{
                            backgroundColor: cellBg,
                            color: cellFg,
                            fontWeight: cellWeight,
                            fontStyle: cell.italic ? "italic" : "normal",
                            textAlign: cell.align || "center",
                            width: `${colWidths[cIdx] || 55}px`,
                            maxWidth: `${colWidths[cIdx] || 55}px`,
                            height: `${rowHeight}px`
                          }}
                          className={`border-r border-black p-0.5 relative truncate cursor-cell transition-all ${
                            isCurrentMatch
                              ? "ring-2 ring-amber-600 z-20 shadow-md scale-[1.01]"
                              : isSearchMatch
                                ? "ring-1 ring-amber-500 z-10"
                                : isFocused
                                  ? "ring-2 ring-blue-600 z-10 font-bold"
                                  : isSelected
                                    ? "ring-1 ring-cyan-500"
                                    : ""
                          }`}
                        >
                          {isEditing ? (
                            <input
                              ref={cellInputRef}
                              type="text"
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              onBlur={() => commitCellValue(rIdx, cIdx, editValue)}
                              className="w-full h-full bg-white text-black font-bold p-0 outline-none border border-blue-600"
                            />
                          ) : cell.verticalText ? (
                            <div style={{ writingMode: "vertical-rl", transform: "rotate(180deg)", margin: "0 auto" }}>
                              {cell.val}
                            </div>
                          ) : (
                            <span className="whitespace-pre-line">{cell.val}</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* ── Excel Bottom Sheet Tabs ── */}
        <div className="bg-slate-950 border-t border-slate-800 p-2 flex items-center justify-between text-xs">
          <div className="flex items-center gap-1.5 overflow-x-auto">
            {["11 Aug Tue", "16 Aug Sun", "15 Aug Sat", "10 Aug Mon"].map((tab) => (
              <button
                key={tab}
                onClick={() => {
                  setActiveSheetTab(tab);
                  setSheetGrid((prev) => {
                    const newGrid = prev.map((r) => [...r]);
                    newGrid[0][0] = {
                      ...newGrid[0][0],
                      val: tab === "16 Aug Sun" ? "16 August 2026 Sunday" : tab === "15 Aug Sat" ? "15 August 2026 Saturday" : tab === "10 Aug Mon" ? "10 August 2026 Monday" : "11 August 2026 Tuesday",
                      bg: tab === "16 Aug Sun" ? "#FACC15" : tab === "15 Aug Sat" ? "#F472B6" : tab === "10 Aug Mon" ? "#A3E635" : "#38BDF8"
                    };
                    return newGrid;
                  });
                }}
                className={`px-3 py-1 rounded-t-lg font-bold transition flex items-center gap-1.5 ${
                  activeSheetTab === tab
                    ? "bg-white text-slate-950 shadow-md font-black border-t-2 border-emerald-500"
                    : "bg-slate-900 text-slate-400 hover:text-white"
                }`}
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-500" />
                <span>{tab}</span>
              </button>
            ))}
          </div>

          <div className="text-[11px] text-slate-400 font-mono hidden sm:block">
            READY | Range: <strong className="text-cyan-300">{activeCellCoord}</strong> | Total: {sheetGrid.length} Rows
          </div>
        </div>
      </div>
    </div>
  );
}
