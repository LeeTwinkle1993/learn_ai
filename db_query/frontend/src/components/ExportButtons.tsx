/** Export buttons component for query results.

Displays buttons for:
- CSV export (client-side)
- JSON export (client-side)
- Excel export (client-side)
- Query + Export dropdown (server-side one-click)
*/

import React, { useState } from "react";
import { Button, Dropdown, Menu, Modal, message } from "antd";
import {
  FileExcelOutlined,
  FileTextOutlined,
  FilePdfOutlined,
  DownloadOutlined,
} from "@ant-design/icons";
import { exportToCSV, exportToJSON, exportToExcel, oneClickQueryAndExport, generateExportFilename, ExportFormat } from "../services/export";

interface QueryResult {
  columns: Array<{ name: string; dataType: string }>;
  rows: Record<string, any>[];
  rowCount: number;
  executionTimeMs: number;
  sql: string;
}

interface ExportButtonsProps {
  queryResult: QueryResult | null;
  databaseName: string | null;
  onOneClickExport?: (format: ExportFormat) => void;
}

export const ExportButtons: React.FC<ExportButtonsProps> = ({
  queryResult,
  databaseName,
  onOneClickExport,
}) => {
  const [loading, setLoading] = useState<ExportFormat | null>(null);

  const handleLargeDatasetWarning = (
    callback: () => void,
    rowCount: number
  ): void => {
    if (rowCount > 10000) {
      Modal.confirm({
        title: "Large Dataset Warning",
        icon: <FilePdfOutlined />,
        content: `You are about to export ${rowCount.toLocaleString()} rows. Continue?`,
        onOk: callback,
      });
    } else {
      callback();
    }
  };

  const handleExportCSV = () => {
    if (!queryResult || queryResult.rows.length === 0) {
      message.warning("No data to export");
      return;
    }

    const callback = () => {
      const filename = generateExportFilename(databaseName || "export", "csv");
      exportToCSV(queryResult, filename);
    };

    handleLargeDatasetWarning(callback, queryResult.rowCount);
  };

  const handleExportJSON = () => {
    if (!queryResult || queryResult.rows.length === 0) {
      message.warning("No data to export");
      return;
    }

    const callback = () => {
      const filename = generateExportFilename(databaseName || "export", "json");
      exportToJSON(queryResult, filename);
    };

    handleLargeDatasetWarning(callback, queryResult.rowCount);
  };

  const handleExportExcel = () => {
    if (!queryResult || queryResult.rows.length === 0) {
      message.warning("No data to export");
      return;
    }

    const callback = () => {
      const filename = generateExportFilename(databaseName || "export", "excel");
      exportToExcel(queryResult, filename);
    };

    handleLargeDatasetWarning(callback, queryResult.rowCount);
  };

  const handleOneClickExport = async (format: ExportFormat) => {
    if (!databaseName) {
      message.warning("Please select a database");
      return;
    }

    if (!queryResult?.sql) {
      message.warning("No query to export");
      return;
    }

    if (onOneClickExport) {
      onOneClickExport(format);
      return;
    }

    setLoading(format);
    try {
      await oneClickQueryAndExport(databaseName, queryResult.sql, format);
    } catch (error) {
      // Error already handled by oneClickQueryAndExport
    } finally {
      setLoading(null);
    }
  };

  const dropdownMenu = (
    <Menu
      items={[
        {
          key: "csv",
          label: (
            <span>
              <FileTextOutlined /> CSV
            </span>
          ),
          onClick: () => handleOneClickExport("csv"),
        },
        {
          key: "json",
          label: (
            <span>
              <FileTextOutlined /> JSON
            </span>
          ),
          onClick: () => handleOneClickExport("json"),
        },
        {
          key: "excel",
          label: (
            <span>
              <FileExcelOutlined /> Excel
            </span>
          ),
          onClick: () => handleOneClickExport("excel"),
        },
      ]}
    />
  );

  return (
    <div style={{ display: "flex", gap: 8 }}>
      <Button
        size="small"
        icon={<FileTextOutlined />}
        onClick={handleExportCSV}
        disabled={!queryResult || queryResult.rows.length === 0}
        style={{ fontSize: 12, fontWeight: 700 }}
      >
        CSV
      </Button>
      <Button
        size="small"
        icon={<FileTextOutlined />}
        onClick={handleExportJSON}
        disabled={!queryResult || queryResult.rows.length === 0}
        style={{ fontSize: 12, fontWeight: 700 }}
      >
        JSON
      </Button>
      <Button
        size="small"
        icon={<FileExcelOutlined />}
        onClick={handleExportExcel}
        disabled={!queryResult || queryResult.rows.length === 0}
        style={{ fontSize: 12, fontWeight: 700 }}
      >
        EXCEL
      </Button>
      <Dropdown
        overlay={dropdownMenu}
        trigger={["click"]}
        disabled={!databaseName}
      >
        <Button
          size="small"
          icon={<DownloadOutlined />}
          loading={loading !== null}
          style={{ fontSize: 12, fontWeight: 700 }}
        >
          QUERY + EXPORT
        </Button>
      </Dropdown>
    </div>
  );
};