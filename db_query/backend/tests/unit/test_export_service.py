"""Unit tests for export_service module.

Tests cover:
- TestFormatToCSV: 3 tests for CSV generation
- TestFormatToJSON: 3 tests for JSON generation
- TestFormatToExcel: 2 tests for Excel generation
- TestBuildExportFile: 4 tests for file building with all formats
"""

import pytest
from datetime import datetime
from app.adapters.base import QueryResult
from app.services.export_service import (
    format_to_csv,
    format_to_json,
    format_to_excel,
    build_export_file,
    _serialize_value,
)


class TestFormatToCSV:
    """Test CSV formatting functionality."""

    def test_csv_generates_headers(self):
        """Test CSV output includes correct column headers."""
        result = QueryResult(
            columns=[
                {"name": "id", "dataType": "integer"},
                {"name": "name", "dataType": "text"},
            ],
            rows=[
                {"id": 1, "name": "Alice"},
                {"id": 2, "name": "Bob"},
            ],
            row_count=2,
        )

        csv_output = format_to_csv(result)

        # Check BOM header and column headers
        assert csv_output.startswith("\uFEFFid,name")
        assert "Alice" in csv_output
        assert "Bob" in csv_output

    def test_csv_row_count_matches(self):
        """Test CSV output contains correct number of data rows."""
        result = QueryResult(
            columns=[
                {"name": "id", "dataType": "integer"},
            ],
            rows=[{"id": i} for i in range(1, 101)],
            row_count=100,
        )

        csv_output = format_to_csv(result)
        lines = csv_output.split("\n")

        # First line is header, remaining are data rows
        assert len([line for line in lines if line]) == 101  # 1 header + 100 rows

    def test_csv_handles_null_values(self):
        """Test CSV output properly handles NULL values."""
        result = QueryResult(
            columns=[
                {"name": "id", "dataType": "integer"},
                {"name": "email", "dataType": "text"},
            ],
            rows=[
                {"id": 1, "email": "alice@example.com"},
                {"id": 2, "email": None},
            ],
            row_count=2,
        )

        csv_output = format_to_csv(result)

        # Check that NULL is represented as empty string
        lines = csv_output.split("\n")
        assert "alice@example.com" in lines[1]
        # Second data row should have empty email
        row_parts = lines[2].split(",") if len(lines) > 2 else []
        assert len(row_parts) == 2
        assert row_parts[1] == ""


class TestFormatToJSON:
    """Test JSON formatting functionality."""

    def test_json_is_valid(self):
        """Test JSON output is valid JSON string."""
        import json

        result = QueryResult(
            columns=[
                {"name": "id", "dataType": "integer"},
                {"name": "name", "dataType": "text"},
            ],
            rows=[
                {"id": 1, "name": "Alice"},
            ],
            row_count=1,
        )

        json_output = format_to_json(result)
        parsed = json.loads(json_output)

        assert "columns" in parsed
        assert "rows" in parsed
        assert "rowCount" in parsed
        assert "exportedAt" in parsed

    def test_json_preserves_values(self):
        """Test JSON output preserves all row values."""
        import json

        result = QueryResult(
            columns=[
                {"name": "id", "dataType": "integer"},
                {"name": "name", "dataType": "text"},
            ],
            rows=[
                {"id": 1, "name": "Alice"},
                {"id": 2, "name": "Bob"},
            ],
            row_count=2,
        )

        json_output = format_to_json(result)
        parsed = json.loads(json_output)

        assert parsed["rowCount"] == 2
        assert parsed["rows"][0]["id"] == 1
        assert parsed["rows"][0]["name"] == "Alice"
        assert parsed["rows"][1]["name"] == "Bob"

    def test_json_serializes_datetime(self):
        """Test JSON output serializes datetime objects as ISO strings."""
        import json

        test_datetime = datetime(2024, 1, 1, 12, 0, 0)

        result = QueryResult(
            columns=[
                {"name": "created_at", "dataType": "timestamp"},
            ],
            rows=[
                {"created_at": test_datetime},
            ],
            row_count=1,
        )

        json_output = format_to_json(result)
        parsed = json.loads(json_output)

        assert parsed["rows"][0]["created_at"] == "2024-01-01T12:00:00"


class TestFormatToExcel:
    """Test Excel formatting functionality."""

    def test_excel_returns_bytes(self):
        """Test Excel output returns bytes."""
        result = QueryResult(
            columns=[
                {"name": "id", "dataType": "integer"},
                {"name": "name", "dataType": "text"},
            ],
            rows=[
                {"id": 1, "name": "Alice"},
            ],
            row_count=1,
        )

        excel_bytes = format_to_excel(result)

        assert isinstance(excel_bytes, bytes)
        assert len(excel_bytes) > 0

    def test_excel_workbook_is_readable(self):
        """Test Excel output can be read by openpyxl."""
        import io
        from openpyxl import load_workbook

        result = QueryResult(
            columns=[
                {"name": "id", "dataType": "integer"},
                {"name": "name", "dataType": "text"},
            ],
            rows=[
                {"id": 1, "name": "Alice"},
                {"id": 2, "name": "Bob"},
            ],
            row_count=2,
        )

        excel_bytes = format_to_excel(result)

        # Load workbook
        wb = load_workbook(io.BytesIO(excel_bytes))
        ws = wb.active

        # Check headers
        assert ws.cell(row=1, column=1).value == "id"
        assert ws.cell(row=1, column=2).value == "name"

        # Check data rows
        assert ws.cell(row=2, column=1).value == 1
        assert ws.cell(row=2, column=2).value == "Alice"
        assert ws.cell(row=3, column=2).value == "Bob"


class TestBuildExportFile:
    """Test build_export_file functionality."""

    def test_build_csv_file(self):
        """Test build_export_file with CSV format."""
        result = QueryResult(
            columns=[
                {"name": "id", "dataType": "integer"},
            ],
            rows=[{"id": 1}],
            row_count=1,
        )

        file_bytes, media_type, ext = build_export_file(result, "csv")

        assert isinstance(file_bytes, bytes)
        assert media_type == "text/csv; charset=utf-8"
        assert ext == "csv"
        assert b"\uFEFF" in file_bytes  # BOM header

    def test_build_json_file(self):
        """Test build_export_file with JSON format."""
        result = QueryResult(
            columns=[
                {"name": "id", "dataType": "integer"},
            ],
            rows=[{"id": 1}],
            row_count=1,
        )

        file_bytes, media_type, ext = build_export_file(result, "json")

        assert isinstance(file_bytes, bytes)
        assert media_type == "application/json"
        assert ext == "json"

    def test_build_excel_file(self):
        """Test build_export_file with Excel format."""
        result = QueryResult(
            columns=[
                {"name": "id", "dataType": "integer"},
            ],
            rows=[{"id": 1}],
            row_count=1,
        )

        file_bytes, media_type, ext = build_export_file(result, "excel")

        assert isinstance(file_bytes, bytes)
        assert (
            media_type
            == "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        )
        assert ext == "xlsx"

    def test_build_unsupported_format_raises_error(self):
        """Test build_export_file raises ValueError for unsupported format."""
        result = QueryResult(
            columns=[
                {"name": "id", "dataType": "integer"},
            ],
            rows=[{"id": 1}],
            row_count=1,
        )

        with pytest.raises(ValueError, match="Unsupported format"):
            build_export_file(result, "pdf")