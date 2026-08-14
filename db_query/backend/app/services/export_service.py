"""Export service for query results.

This module provides three subtasks for data export:
1. fetch_query_result() - Get query result (reuses existing query service)
2. format_to_csv() / format_to_json() / format_to_excel() - Format data
3. build_export_file() - Create final file bytes

The export_query_result() orchestrator chains these together for one-click automation.
"""

import csv
import io
import logging
from datetime import datetime
from typing import Dict, List, Any, Tuple, Literal

from openpyxl import Workbook
from openpyxl.styles import Font
from openpyxl.utils import get_column_letter

from app.models.database import DatabaseType
from app.adapters.base import QueryResult, ConnectionConfig
from app.adapters.registry import DatabaseAdapterRegistry, adapter_registry
from app.services.sql_validator import validate_and_transform_sql

logger = logging.getLogger(__name__)


ExportFormat = Literal["csv", "json", "excel"]


async def fetch_query_result(
    db_type: DatabaseType,
    name: str,
    url: str,
    sql: str,
    limit: int = 100000,
) -> QueryResult:
    """Subtask 1: Execute SQL and fetch query result.

    Reuses existing query service infrastructure including:
    - SQL validation and transformation
    - Query execution
    - Standardized QueryResult format

    Args:
        db_type: Database type (mysql or postgresql)
        name: Connection name
        url: Database connection URL
        sql: SQL query to execute
        limit: Maximum rows to return (default 100000 for exports)

    Returns:
        QueryResult with columns and rows

    Raises:
        Exception: If query execution fails
    """
    # Validate and transform SQL
    validated_sql = validate_and_transform_sql(sql, limit=limit, db_type=db_type)

    # Get adapter and execute query
    config = ConnectionConfig(url=url, name=name)
    adapter = adapter_registry.get_adapter(db_type, config)
    result = await adapter.execute_query(validated_sql)

    logger.info(
        f"Fetched query result for export from {name}: "
        f"{result.row_count} rows"
    )

    return result


def _serialize_value(value: Any) -> Any:
    """Serialize value for export formats.

    Handles:
    - datetime objects -> ISO 8601 string
    - None -> empty string for CSV/Excel, null for JSON
    - boolean -> string for CSV/Excel, boolean for JSON

    Args:
        value: Value to serialize

    Returns:
        Serialized value
    """
    if isinstance(value, datetime):
        return value.isoformat()
    if value is None:
        return ""
    return value


def format_to_csv(result: QueryResult) -> str:
    """Subtask 2a: Format query result as CSV string.

    Generates CSV with:
    - BOM header for UTF-8 encoding (Chinese character support)
    - Column headers
    - Proper value serialization

    Args:
        result: QueryResult to format

    Returns:
        CSV string with BOM header
    """
    output = io.StringIO()
    writer = csv.DictWriter(
        output,
        fieldnames=[col["name"] for col in result.columns],
        quoting=csv.QUOTE_MINIMAL,
    )
    writer.writeheader()

    for row in result.rows:
        serialized_row = {
            key: _serialize_value(value) for key, value in row.items()
        }
        writer.writerow(serialized_row)

    csv_content = output.getvalue()
    output.close()

    # Add UTF-8 BOM for Excel to correctly display Chinese characters
    return "\uFEFF" + csv_content


def format_to_json(result: QueryResult) -> str:
    """Subtask 2b: Format query result as JSON string.

    Generates JSON with:
    - ensure_ascii=False for Chinese character support
    - Pretty formatting (indent=2)
    - Proper datetime serialization

    Args:
        result: QueryResult to format

    Returns:
        JSON string
    """
    import json

    serialized_rows = []
    for row in result.rows:
        serialized_row = {
            key: _serialize_value(value) for key, value in row.items()
        }
        serialized_rows.append(serialized_row)

    return json.dumps(
        {
            "columns": result.columns,
            "rows": serialized_rows,
            "rowCount": result.row_count,
            "exportedAt": datetime.now().isoformat(),
        },
        ensure_ascii=False,
        indent=2,
    )


def format_to_excel(result: QueryResult) -> bytes:
    """Subtask 2c: Format query result as Excel workbook bytes.

    Generates Excel with:
    - Bold header row
    - Auto-adjusted column widths
    - Proper value serialization

    Args:
        result: QueryResult to format

    Returns:
        Excel workbook bytes
    """
    wb = Workbook()
    ws = wb.active
    ws.title = "Query Results"

    # Write header row with bold font
    header_font = Font(bold=True)
    for col_idx, col in enumerate(result.columns, start=1):
        cell = ws.cell(row=1, column=col_idx, value=col["name"])
        cell.font = header_font

    # Write data rows
    for row_idx, row in enumerate(result.rows, start=2):
        for col_idx, col in enumerate(result.columns, start=1):
            value = _serialize_value(row.get(col["name"], ""))
            ws.cell(row=row_idx, column=col_idx, value=value)

    # Auto-adjust column widths
    for col_idx in range(1, len(result.columns) + 1):
        column_letter = get_column_letter(col_idx)
        max_length = 0
        for row_idx in range(1, ws.max_row + 1):
            cell = ws.cell(row=row_idx, column=col_idx)
            cell_value = str(cell.value) if cell.value else ""
            max_length = max(max_length, len(cell_value))
        adjusted_width = min(max_length + 2, 50)
        ws.column_dimensions[column_letter].width = adjusted_width

    output = io.BytesIO()
    wb.save(output)
    output.seek(0)
    excel_bytes = output.getvalue()
    output.close()
    wb.close()

    return excel_bytes


def build_export_file(
    result: QueryResult, format: ExportFormat
) -> Tuple[bytes, str, str]:
    """Subtask 3: Build export file with format-specific processing.

    Args:
        result: QueryResult to export
        format: Export format (csv, json, or excel)

    Returns:
        Tuple of (file_bytes, media_type, file_extension)

    Raises:
        ValueError: If format is not supported
    """
    format_handlers = {
        "csv": (lambda r: format_to_csv(r).encode("utf-8")),
        "json": (lambda r: format_to_json(r).encode("utf-8")),
        "excel": format_to_excel,
    }

    if format not in format_handlers:
        raise ValueError(f"Unsupported format: {format}")

    file_bytes = format_handlers[format](result)

    media_types = {
        "csv": "text/csv; charset=utf-8",
        "json": "application/json",
        "excel": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }

    extensions = {"csv": "csv", "json": "json", "excel": "xlsx"}

    return file_bytes, media_types[format], extensions[format]


async def export_query_result(
    db_type: DatabaseType,
    name: str,
    url: str,
    sql: str,
    format: ExportFormat,
) -> Tuple[bytes, str, str, int]:
    """Orchestrator: Execute query and export result to specified format.

    Chains the three subtasks:
    1. fetch_query_result() - Execute SQL
    2. format_to_csv/json/excel() - Format data
    3. build_export_file() - Create file bytes

    Args:
        db_type: Database type (mysql or postgresql)
        name: Connection name
        url: Database connection URL
        sql: SQL query to execute
        format: Export format (csv, json, or excel)

    Returns:
        Tuple of (file_bytes, media_type, file_extension, row_count)

    Raises:
        ValueError: If format is not supported
        Exception: If query execution or formatting fails
    """
    # Subtask 1: Fetch query result
    result = await fetch_query_result(db_type, name, url, sql)

    # Subtask 3: Build export file (includes subtask 2 internally)
    file_bytes, media_type, ext = build_export_file(result, format)

    logger.info(
        f"Exported {result.row_count} rows from {name} as {format}: {ext}"
    )

    return file_bytes, media_type, ext, result.row_count


def _get_export_filename(db_name: str, format: ExportFormat) -> str:
    """Generate export filename with timestamp.

    Args:
        db_name: Database name
        format: Export format

    Returns:
        Filename string (e.g., "mydb_export_20240101_120000.csv")
    """
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    extensions = {"csv": "csv", "json": "json", "excel": "xlsx"}
    return f"{db_name}_export_{timestamp}.{extensions[format]}"