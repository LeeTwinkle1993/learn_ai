# FEATURE_EXPORT.md — 数据导出功能设计文档

## 1. 功能概述

在"智能数据库查询工具"基础上新增**数据导出功能模块**，实现三大核心能力：

| 能力 | 说明 |
|------|------|
| **多格式导出** | 查询结果可导出为 **CSV、JSON、Excel** 三种格式 |
| **一键自动化** | "执行查询 + 导出结果"通过一个按钮或一个命令触发完成 |
| **AI 对话式交互** | 查询成功后 AI 助手主动弹出对话窗口，询问用户是否导出，支持自然语言回复 |

---

## 2. 设计思路与方案

### 2.1 核心设计原则

| 原则 | 说明 |
|------|------|
| **复用现有架构** | 导出功能构建在已有的 `Adapter → DatabaseService → QueryWrapper` 分层之上，不重复造轮子 |
| **任务分解** | 将"导出数据"分解为 3 个独立子任务（获取查询结果 → 格式化数据 → 创建文件），每个子任务可独立测试和复用 |
| **双通道导出** | 前端客户端导出（CSV/JSON/Excel，零延迟）+ 后端服务端导出（openpyxl 标准 .xlsx，用于一键自动化） |
| **对话式交互** | AI 助手在查询完成后主动发起对话，用户可通过自然语言或快捷按钮触发导出 |

### 2.2 AI Agent 任务分解方案

"导出数据"这个复杂任务被分解为三个清晰子任务，Agent 按序协调执行：

```
用户触发导出
    │
    ▼
┌─────────────────────────────────────────┐
│  子任务 1: 获取查询结果                   │
│  fetch_query_result()                    │
│  - 复用 execute_query_with_service       │
│  - 包含 SQL 校验 + 查询历史记录           │
│  - 返回 QueryResult (columns + rows)     │
└──────────────────┬──────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────┐
│  子任务 2: 格式化数据                     │
│  format_to_csv() / format_to_json()      │
│  format_to_excel()                       │
│  - 类型序列化 (datetime → ISO 字符串)     │
│  - NULL 值处理                           │
│  - Excel: 表头加粗 + 列宽自适应           │
└──────────────────┬──────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────┐
│  子任务 3: 创建文件                       │
│  build_export_file()                     │
│  - 组装最终字节流                         │
│  - 返回 (bytes, media_type, ext)         │
│  - 设置下载头 Content-Disposition         │
└─────────────────────────────────────────┘
```

**设计优势**：每个子任务是一个独立函数，Agent 可以单独调用、单独测试。编排器 `export_query_result()` 将三者串联，实现一键自动化。

### 2.3 三种触发方式

```
┌──────────────────────────────────────────────────────────┐
│                    触发方式总览                             │
├──────────────┬───────────────────────────────────────────┤
│ 方式 1       │ 结果区 "CSV / JSON / EXCEL" 按钮           │
│ (导出已有结果)│ 导出当前内存中的查询结果，纯客户端，零延迟    │
├──────────────┼───────────────────────────────────────────┤
│ 方式 2       │ "QUERY + EXPORT" 下拉按钮                  │
│ (一键查询+导出)│ 调用后端 /query/export，单次请求完成        │
│              │ 执行 SQL → 格式化 → 下载文件               │
├──────────────┼───────────────────────────────────────────┤
│ 方式 3       │ AI 对话式导出                              │
│ (自然语言交互)│ 查询后 AI 助手自动弹出对话，用户输入         │
│              │ "导出 Excel" 等自然语言即可触发导出          │
├──────────────┼───────────────────────────────────────────┤
│ 方式 4       │ /query-and-export Kilo 命令               │
│ (命令行自动化)│ /query-and-export <db> <format> <sql>     │
│              │ 引导 AI Agent 按步骤调用一键导出 API        │
└──────────────┴───────────────────────────────────────────┘
```

---

## 3. 技术架构

### 3.1 后端架构

```
backend/app/
├── services/
│   └── export_service.py        # ★ 新增：导出服务（3 子任务 + 编排器）
├── api/v1/
│   └── queries.py               # ★ 修改：新增 POST /{name}/query/export 端点
├── models/
│   └── schemas.py               # ★ 修改：新增 ExportInput schema
└── pyproject.toml               # ★ 修改：新增 openpyxl + types-openpyxl 依赖
```

#### 导出服务 (`export_service.py`)

| 函数 | 子任务 | 职责 |
|------|--------|------|
| `fetch_query_result()` | 获取查询结果 | 执行 SQL，复用现有查询服务，返回 QueryResult |
| `format_to_csv()` | 格式化数据 | CSV 文本生成（Python csv 模块） |
| `format_to_json()` | 格式化数据 | JSON 序列化（ensure_ascii=False，中文友好） |
| `format_to_excel()` | 格式化数据 | Excel 生成（openpyxl，表头加粗 + 列宽自适应） |
| `build_export_file()` | 创建文件 | 统一入口，返回 `(bytes, media_type, ext)` |
| `export_query_result()` | 编排器 | 一键编排：获取 → 格式化 → 创建文件 |

#### API 端点

```
POST /api/v1/dbs/{name}/query/export
Content-Type: application/json

{
  "sql": "SELECT * FROM users LIMIT 100",
  "format": "excel"
}
```

**响应**：二进制文件流（`StreamingResponse`），带以下响应头：
- `Content-Disposition: attachment; filename="mydb_export_20240101_120000.xlsx"`
- `X-Export-Row-Count: 100`
- `X-Export-Format: excel`

### 3.2 前端架构

```
frontend/src/
├── services/
│   └── export.ts                # ★ 新增：导出工具函数
│       ├── exportToCSV()         #   客户端 CSV 导出（含 BOM 头，中文不乱码）
│       ├── exportToJSON()        #   客户端 JSON 导出
│       ├── exportToExcel()       #   客户端 Excel 导出（HTML 表格方案，无需第三方库）
│       └── oneClickQueryAndExport()  # 一键查询+导出（调用后端）
├── components/
│   ├── ExportButtons.tsx        # ★ 新增：结果区导出按钮组件
│   │   ├── CSV / JSON / EXCEL   #   导出当前查询结果
│   │   └── QUERY + EXPORT       #   一键执行查询+导出（下拉选择格式）
│   └── ExportPrompt.tsx         # ★ 新增：AI 对话式导出助手
│       ├── 对话消息流            #   显示 AI 与用户的交互历史
│       ├── 自然语言输入框        #   用户输入"导出 Excel"等触发导出
│       └── 快捷按钮             #   CSV / JSON / Excel 一键点击
└── pages/
    └── Home.tsx                 # ★ 修改：集成导出组件 + AI 对话助手
```

#### 导出策略（双通道设计）

| 格式 | 客户端导出 | 后端导出 | 说明 |
|------|-----------|---------|------|
| CSV | `exportToCSV()` | `/query/export?format=csv` | 客户端添加 UTF-8 BOM 防中文乱码 |
| JSON | `exportToJSON()` | `/query/export?format=json` | 客户端 `JSON.stringify` 格式化输出 |
| Excel | `exportToExcel()` | `/query/export?format=excel` | 客户端用 HTML 表格生成 `.xls`；后端用 openpyxl 生成 `.xlsx` |

**客户端 Excel 方案**（无需安装第三方 npm 包）：
- 构建 HTML 表格字符串，设置 `application/vnd.ms-excel` MIME 类型
- Excel/WPS 可直接打开，表头加粗，边框可见
- 添加 `\uFEFF` BOM 头确保中文编码正确

---

## 4. 用户交互设计

### 4.1 AI 对话式导出（核心交互）

查询成功后，屏幕中央自动弹出 **AI 对话框**（Modal），模拟 AI 助手主动询问：

```
┌────────────────────────────────────────────────────────┐
│  ┌──┐ AI 导出助手                              [×]    │
│  │🤖│                                               │
│  └──┘                                               │
├────────────────────────────────────────────────────────┤
│                                                        │
│  ┌──┐  查询完成！共返回 100 行数据，                     │
│  │🤖│      耗时 42ms。                                   │
│  │   │                                                   │
│  │   │  需要将这次查询结果导出为                          │
│  │   │  CSV、JSON 或 Excel 文件吗？                      │
│  │   │                                                   │
│  │   │  请直接告诉我你想导出什么格式。                    │
│  └──┘                                                   │
│                                        ┌──┐              │
│                                        │👤│  请帮我导出为  │
│                                        └──┘  Excel 文件   │
│                                                        │
│  ┌──┐  已成功导出 100 行数据为 Excel                    │
│  │🤖│  文件！文件已开始下载。 ✅                          │
│  │   │  如果还需要其他格式，可以继续告诉我。              │
│  └──┘                                                   │
│                                                        │
├────────────────────────────────────────────────────────┤
│  ┌────────────────────────────────────────────┐  ┌────┐│
│  │ 输入想导出的格式，如'导出 Excel'...         │  │提交││
│  └────────────────────────────────────────────┘  └────┘│
└────────────────────────────────────────────────────────┘
```

**设计特点**：
- **居中弹窗**：Modal 居中显示，更加醒目和正式
- **现代 UI 风格**：
  - 渐变色头像和按钮（紫色渐变 #667eea → #764ba2）
  - 圆角消息气泡（AI 消息为浅灰色，用户消息为渐变色）
  - 柔和的阴影和边框
- **文本提交按钮**：右侧"提交"文本按钮，与输入框风格协调一致
- **极简交互**：仅保留对话输入框，去除快捷按钮

**自然语言识别逻辑**：

| 用户输入 | 识别结果 |
|---------|---------|
| "导出 Excel" / "要表格" / "xlsx" | → Excel 导出 |
| "csv" / "导出 CSV" | → CSV 导出 |
| "json" / "导出 JSON" | → JSON 导出 |
| "否" / "不用" / "no" | → 关闭对话 |
| 其他无法识别 | → AI 回复"请告诉我你想要哪种格式" |

### 4.2 结果区导出按钮

查询结果卡片右上角显示 `ExportButtons` 组件：

| 按钮 | 功能 |
|------|------|
| **CSV** | 导出当前结果为 CSV 文件（客户端生成） |
| **JSON** | 导出当前结果为 JSON 文件（客户端生成） |
| **EXCEL** | 导出当前结果为 Excel 文件（客户端生成） |
| **QUERY + EXPORT** ▾ | 下拉菜单，一键执行新查询并导出（后端生成），支持 CSV/JSON/Excel |

### 4.3 大数据量保护

当导出数据超过 10,000 行时，弹出确认对话框：
```
Large Dataset Warning
You are about to export 50,000 rows. Continue?
[Cancel] [OK]
```

---

## 5. 数据类型处理

| 数据库类型 | CSV | JSON | Excel (客户端) | Excel (后端) |
|-----------|-----|------|---------------|-------------|
| NULL | 空字符串 | `null` | 空单元格 | 空单元格 |
| datetime | ISO 8601 字符串 | ISO 8601 字符串 | ISO 字符串 | ISO 字符串 |
| bool | "True"/"False" | `true`/`false` | 文本 | 布尔值 |
| int/float | 原始值 | 原始值 | 文本 | 数值 |

---

## 6. 自动化命令（Kilo Custom Command）

```
.kilo/command/query-and-export.md
```

通过 `/query-and-export` 命令触发，支持参数化调用：

```
/query-and-export <database_name> <format> <sql>
```

**示例**：
```
/query-and-export yc-platform excel SELECT * FROM users LIMIT 100
/query-and-export mydb csv SELECT id, name FROM customers WHERE active = true
```

**命令内部引导 AI Agent 按三步执行**：
1. **验证输入** — 确认数据库连接存在、格式合法、SQL 为 SELECT 语句
2. **调用一键导出 API** — `POST /api/v1/dbs/{name}/query/export`
3. **报告结果** — 输出行数、格式、文件名，或显示错误信息

---

## 7. 测试覆盖

### 后端测试 (`tests/unit/test_export_service.py`)

| 测试类 | 测试数 | 覆盖内容 |
|--------|--------|----------|
| `TestFormatToCSV` | 3 | 表头生成、行数验证、NULL 值处理 |
| `TestFormatToJSON` | 3 | JSON 有效性、值保留、datetime 序列化 |
| `TestFormatToExcel` | 2 | 字节返回验证、工作簿可读性验证 |
| `TestBuildExportFile` | 4 | 三种格式分别验证 + 不支持格式异常 |

全部 12 个测试通过 ✅

---

## 8. 文件变更清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `backend/pyproject.toml` | 修改 | 新增 `openpyxl` + `types-openpyxl` 依赖 |
| `backend/README.md` | 新增 | 修复 pyproject.toml readme 引用（原文件缺失） |
| `backend/app/services/export_service.py` | 新增 | 导出服务（3 子任务 + 编排器，219 行） |
| `backend/app/models/schemas.py` | 修改 | 新增 `ExportInput` schema |
| `backend/app/api/v1/queries.py` | 修改 | 新增 `POST /{name}/query/export` 端点 |
| `backend/tests/unit/test_export_service.py` | 新增 | 12 个单元测试 |
| `frontend/src/services/export.ts` | 新增 | 导出工具函数（CSV/JSON/Excel 客户端 + 一键导出） |
| `frontend/src/components/ExportButtons.tsx` | 新增 | 结果区导出按钮组件 |
| `frontend/src/components/ExportPrompt.tsx` | 新增 | AI 对话式导出助手（Drawer + 自然语言识别） |
| `frontend/src/pages/Home.tsx` | 修改 | 集成 ExportButtons + ExportPrompt |
| `.kilo/command/query-and-export.md` | 新增 | Kilo 自动化命令 |

---

## 9. 验证结果

| 验证项 | 结果 |
|--------|------|
| 后端导出测试（12 个） | ✅ 全部通过 |
| 后端 mypy 类型检查 | ✅ `export_service.py` 零错误 |
| 前端 TypeScript 编译 | ✅ `tsc --noEmit` 零错误 |
| 前端 Vite 构建 | ✅ 构建成功 |
| 后端 OpenAPI 端点注册 | ✅ `POST /api/v1/dbs/{name}/query/export` 已注册 |
| MySQL 连接密码解码 | ✅ 修复 `urlparse` 未 `unquote` 密码的问题 |
| OpenAI API 配置可定制 | ✅ 支持 `OPENAI_BASE_URL` + `OPENAI_MODEL` 环境变量 |
