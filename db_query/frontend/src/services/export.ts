/** Export utilities for query results.

Supports:
- Client-side CSV export (with BOM header for Chinese character support)
- Client-side JSON export
- Client-side Excel export (HTML table approach, no third-party library needed)
- Server-side one-click query + export (POST /api/v1/dbs/{name}/query/export)
*/

import { apiClient } from "./api";
import { message } from "antd";

export type ExportFormat = "csv" | "json" | "excel";

interface ExportResult {
  columns: Array<{ name: string; dataType: string }>;
  rows: Record<string, any>[];
  rowCount: number;
}

/**
 * Serialize a value for export formats.
 * Handles datetime objects, null values, etc.
 */
function serializeValue(value: any): string {
  if (value === null || value === undefined) {
    return "";
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  return String(value);
}

/**
 * Export query result to CSV format (client-side).
 * Includes UTF-8 BOM header for proper Chinese character display in Excel.
 */
export function exportToCSV(result: ExportResult, filename: string = "export.csv"): void {
  if (!result || result.rows.length === 0) {
    message.warning("No data to export");
    return;
  }

  // Generate CSV content
  const headers = result.columns.map((col) => col.name);
  const csvRows: string[] = [];

  // Add BOM header for UTF-8 (helps Excel display Chinese correctly)
  const BOM = "\uFEFF";

  // Header row
  csvRows.push(headers.join(","));

  // Data rows
  result.rows.forEach((row) => {
    const values = headers.map((header) => {
      const value = serializeValue(row[header]);
      // Escape quotes and wrap in quotes if contains comma, quote, or newline
      if (value.includes(",") || value.includes('"') || value.includes("\n")) {
        return `"${value.replace(/"/g, '""')}"`;
      }
      return value;
    });
    csvRows.push(values.join(","));
  });

  const csvContent = BOM + csvRows.join("\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);

  message.success(`Exported ${result.rowCount} rows to CSV`);
}

/**
 * Export query result to JSON format (client-side).
 */
export function exportToJSON(result: ExportResult, filename: string = "export.json"): void {
  if (!result || result.rows.length === 0) {
    message.warning("No data to export");
    return;
  }

  const jsonContent = JSON.stringify(
    {
      columns: result.columns,
      rows: result.rows,
      rowCount: result.rowCount,
      exportedAt: new Date().toISOString(),
    },
    null,
    2
  );

  const blob = new Blob([jsonContent], { type: "application/json;charset=utf-8;" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);

  message.success(`Exported ${result.rowCount} rows to JSON`);
}

/**
 * Export query result to Excel format (client-side).
 * Uses HTML table approach (no third-party library needed).
 */
export function exportToExcel(result: ExportResult, filename: string = "export.xls"): void {
  if (!result || result.rows.length === 0) {
    message.warning("No data to export");
    return;
  }

  // Generate HTML table
  let html = `
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        table {
          border-collapse: collapse;
        }
        td, th {
          border: 1px solid #000;
          padding: 4px;
          font-family: Arial, sans-serif;
          font-size: 11px;
        }
        th {
          font-weight: bold;
          background-color: #f0f0f0;
        }
      </style>
    </head>
    <body>
      <table>
        <thead>
          <tr>
  `;

  // Add header row
  result.columns.forEach((col) => {
    html += `<th>${col.name}</th>`;
  });
  html += `</tr></thead><tbody>`;

  // Add data rows
  result.rows.forEach((row) => {
    html += "<tr>";
    result.columns.forEach((col) => {
      const value = serializeValue(row[col.name]);
      // Escape HTML entities
      const escapedValue = value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
      html += `<td>${escapedValue}</td>`;
    });
    html += "</tr>";
  });

  html += `</tbody></table></body></html>`;

  // Add BOM for UTF-8
  const BOM = "\uFEFF";
  const blob = new Blob([BOM + html], {
    type: "application/vnd.ms-excel;charset=utf-8;",
  });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);

  message.success(`Exported ${result.rowCount} rows to Excel`);
}

/**
 * One-click query execution and export (server-side).
 * Executes a SQL query on the server and returns a downloadable file.
 */
export async function oneClickQueryAndExport(
  databaseName: string,
  sql: string,
  format: ExportFormat
): Promise<void> {
  try {
    const response = await apiClient.post(
      `/api/v1/dbs/${databaseName}/query/export`,
      {
        sql,
        format,
      },
      {
        responseType: "blob",
      }
    );

    // Get headers from response
    const contentDisposition = response.headers["content-disposition"] || "";
    const filenameMatch = contentDisposition.match(/filename=(.+)/);
    const filename = filenameMatch ? filenameMatch[1] : `export.${format}`;
    const rowCount = response.headers["x-export-row-count"] || "unknown";

    // Create download
    const blob = new Blob([response.data]);
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    URL.revokeObjectURL(link.href);

    message.success(`Exported ${rowCount} rows as ${format.toUpperCase()}`);
  } catch (error: any) {
    message.error(error.response?.data?.detail || "Export failed");
    throw error;
  }
}

/**
 * Generate export filename with timestamp.
 */
export function generateExportFilename(
  databaseName: string,
  format: ExportFormat
): string {
  const timestamp = new Date()
    .toISOString()
    .replace(/[:.]/g, "-")
    .slice(0, -5)
    .replace("T", "_");
  const extensions: Record<ExportFormat, string> = {
    csv: "csv",
    json: "json",
    excel: "xls",
  };
  return `${databaseName}_export_${timestamp}.${extensions[format]}`;
}