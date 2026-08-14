/** AI Conversation Export Assistant.

Provides conversational interface for exporting query results.
- Displays conversation history between AI and user
- Natural language input for export format selection
- DeepSeek-style dialog with arrow send button
- Centered modal dialog interface
*/

import React, { useState, useEffect } from "react";
import {
  Modal,
  Input,
  List,
  Avatar,
  Typography,
  message,
} from "antd";
import {
  RobotOutlined,
  UserOutlined,
} from "@ant-design/icons";
import { exportToCSV, exportToJSON, exportToExcel, oneClickQueryAndExport, ExportFormat } from "../services/export";

const { Text } = Typography;

interface Message {
  id: string;
  sender: "ai" | "user";
  content: string;
  timestamp: Date;
}

interface QueryResult {
  columns: Array<{ name: string; dataType: string }>;
  rows: Record<string, any>[];
  rowCount: number;
  executionTimeMs: number;
  sql: string;
}

interface ExportPromptProps {
  visible: boolean;
  onClose: () => void;
  queryResult: QueryResult | null;
  databaseName: string | null;
  useServerExport?: boolean;
}

export const ExportPrompt: React.FC<ExportPromptProps> = ({
  visible,
  onClose,
  queryResult,
  databaseName,
  useServerExport = false,
}) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [exporting, setExporting] = useState<ExportFormat | null>(null);
  const inputRef = React.useRef<any>(null);

  // Initialize conversation when dialog opens
  useEffect(() => {
    if (visible && queryResult) {
      const initMessage: Message = {
        id: "init",
        sender: "ai",
        content: `查询完成！共返回 ${queryResult.rowCount} 行数据，耗时 ${queryResult.executionTimeMs}ms。\n\n需要将这次查询结果导出为 CSV、JSON 或 Excel 文件吗？\n\n请直接告诉我你想导出什么格式。`,
        timestamp: new Date(),
      };
      setMessages([initMessage]);
      setInputValue("");
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    }
  }, [visible, queryResult]);

  const handleExport = async (format: ExportFormat) => {
    if (!queryResult || !databaseName) return;

    setExporting(format);

    try {
      if (useServerExport) {
        await oneClickQueryAndExport(databaseName, queryResult.sql, format);
      } else {
        // Client-side export
        const timestamp = new Date()
          .toISOString()
          .replace(/[:.]/g, "-")
          .slice(0, -5)
          .replace("T", "_");
        const filename = `${databaseName}_export_${timestamp}.${format}`;

        switch (format) {
          case "csv":
            exportToCSV(queryResult, filename);
            break;
          case "json":
            exportToJSON(queryResult, filename);
            break;
          case "excel":
            exportToExcel(queryResult, filename);
            break;
        }
      }

      // Add success message
      const successMessage: Message = {
        id: Date.now().toString(),
        sender: "ai",
        content: `已成功导出 ${queryResult.rowCount} 行数据为 ${format.toUpperCase()} 文件！文件已开始下载。\n\n如果还需要其他格式，可以继续告诉我。`,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, successMessage]);
    } catch (error) {
      message.error(`导出 ${format.toUpperCase()} 文件失败`);
    } finally {
      setExporting(null);
    }
  };

  const parseNaturalLanguageFormat = (input: string): ExportFormat | null => {
    const lowerInput = input.toLowerCase();

    if (
      lowerInput.includes("excel") ||
      lowerInput.includes("表格") ||
      lowerInput.includes("xlsx") ||
      lowerInput.includes("xls")
    ) {
      return "excel";
    }
    if (lowerInput.includes("csv")) {
      return "csv";
    }
    if (lowerInput.includes("json")) {
      return "json";
    }

    return null;
  };

  const handleSendMessage = async () => {
    if (!inputValue.trim()) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      sender: "user",
      content: inputValue,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    const currentInput = inputValue;
    setInputValue("");

    // Check for dismiss patterns
    const lowerInput = currentInput.toLowerCase();
    if (
      lowerInput.includes("否") ||
      lowerInput.includes("不用") ||
      lowerInput.includes("no") ||
      lowerInput.includes("cancel") ||
      lowerInput.includes("取消")
    ) {
      const dismissMessage: Message = {
        id: Date.now().toString(),
        sender: "ai",
        content: "好的，如果您需要导出数据，随时可以点击右侧的导出按钮。",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, dismissMessage]);
      return;
    }

    // Try to parse format from natural language
    const format = parseNaturalLanguageFormat(currentInput);

    if (format) {
      await handleExport(format);
    } else {
      const errorMessage: Message = {
        id: Date.now().toString(),
        sender: "ai",
        content: "请告诉我你想要哪种格式：CSV、JSON 还是 Excel？",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    }
  };

  return (
    <Modal
      open={visible}
      onCancel={onClose}
      footer={null}
      width={580}
      centered
      closable={true}
      styles={{
        body: { padding: "20px 0" },
        content: { borderRadius: "16px", overflow: "hidden" },
      }}
      title={
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{
            width: 32,
            height: 32,
            borderRadius: "50%",
            background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center"
          }}>
            <RobotOutlined style={{ color: "white", fontSize: 16 }} />
          </div>
          <span style={{ fontSize: 16, fontWeight: 600 }}>AI 导出助手</span>
        </div>
      }
    >
      <div style={{ height: 420, display: "flex", flexDirection: "column" }}>
        {/* Conversation History */}
        <div style={{ flex: 1, overflow: "auto", padding: "0 24px", marginBottom: 16 }}>
          <List
            dataSource={messages}
            renderItem={(msg) => (
              <List.Item
                style={{
                  justifyContent: msg.sender === "user" ? "flex-end" : "flex-start",
                  border: "none",
                  padding: "8px 0",
                }}
              >
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 12,
                  flexDirection: msg.sender === "user" ? "row-reverse" : "row",
                }}
              >
                <Avatar
                  icon={msg.sender === "user" ? <UserOutlined /> : <RobotOutlined />}
                  style={{
                    backgroundColor: msg.sender === "user" ? "#1890ff" : "transparent",
                    background: msg.sender === "ai" ? "linear-gradient(135deg, #667eea 0%, #764ba2 100%)" : "#1890ff",
                  }}
                />
                <div
                    style={{
                      maxWidth: "75%",
                      padding: "12px 16px",
                      borderRadius: 16,
                      borderTopLeftRadius: msg.sender === "ai" ? 4 : 16,
                      borderTopRightRadius: msg.sender === "user" ? 4 : 16,
                      background: msg.sender === "user"
                        ? "linear-gradient(135deg, #667eea 0%, #764ba2 100%)"
                        : "#f7f8fa",
                      color: msg.sender === "user" ? "white" : "#1a1a1a",
                      whiteSpace: "pre-wrap",
                      fontSize: 14,
                      lineHeight: 1.6,
                      boxShadow: msg.sender === "ai" ? "0 1px 2px rgba(0,0,0,0.08)" : "none",
                    }}
                  >
                    <Text style={{ color: msg.sender === "user" ? "white" : "#1a1a1a" }}>
                      {msg.content}
                    </Text>
                  </div>
                </div>
              </List.Item>
            )}
          />
        </div>

        {/* Input Area - DeepSeek Style */}
        <div style={{ padding: "16px 24px 0", borderTop: "1px solid #e8e8e8" }}>
          <div style={{
            position: "relative",
            display: "flex",
            alignItems: "center",
            background: "#f7f8fa",
            borderRadius: 12,
            padding: "4px 4px 4px 16px",
            gap: 8,
            transition: "all 0.2s ease"
          }}>
            <Input.TextArea
              ref={inputRef}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
              placeholder="输入想导出的格式，如'导出 Excel'..."
              autoSize={{ minRows: 1, maxRows: 3 }}
              disabled={exporting !== null}
              bordered={false}
              style={{
                fontSize: 14,
                padding: 0,
                resize: "none",
                background: "transparent",
                flex: 1,
              }}
            />
            <button
              onClick={handleSendMessage}
              disabled={!inputValue.trim() || exporting !== null}
              style={{
                height: "100%",
                minHeight: 36,
                padding: "8px 20px",
                borderRadius: 8,
                border: "none",
                background: inputValue.trim() && !exporting
                  ? "linear-gradient(135deg, #667eea 0%, #764ba2 100%)"
                  : "#d9d9d9",
                color: "white",
                fontSize: 14,
                fontWeight: 500,
                cursor: inputValue.trim() && !exporting ? "pointer" : "not-allowed",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                transition: "all 0.2s ease",
                flexShrink: 0,
              }}
              title="提交"
            >
              提交
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
};