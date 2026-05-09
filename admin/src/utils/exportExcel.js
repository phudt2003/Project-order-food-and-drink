import * as XLSX from "xlsx";
import { saveAs } from "file-saver";

const normalizeFileName = (value) => {
  const raw = String(value || "export.xlsx").trim();
  if (!raw) return "export.xlsx";
  return raw.toLowerCase().endsWith(".xlsx") ? raw : `${raw}.xlsx`;
};

export const exportJsonToExcel = async ({ data, fileName, sheetName = "Sheet1", columns }) => {
  const list = Array.isArray(data) ? data : [];

  const rows =
    Array.isArray(columns) && columns.length > 0
      ? list.map((item, idx) => {
          const row = {};
          columns.forEach((col) => {
            const header = String(col?.header || col?.key || "").trim();
            if (!header) return;
            const value = typeof col.value === "function" ? col.value(item, idx) : item?.[col.key];
            row[header] = value ?? "";
          });
          return row;
        })
      : list;

  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, String(sheetName || "Sheet1"));

  const buffer = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });

  saveAs(blob, normalizeFileName(fileName));
};

