import { readFile, writeFile } from "fs/promises";
import { ConversionState } from "../state/ConversionState.js";

export interface SpreadsheetConvertOptions {
  inputPath: string;
  outputPath: string;
  inputFormat?: string;
  outputFormat?: string;
  sheet?: string | number;
  delimiter?: string;
  header?: boolean;
  skipRows?: number;
}

/**
 * SpreadsheetProcessor — spreadsheet and tabular data conversion
 * Supported input:  csv, tsv, json, jsonl, ndjson
 * Supported output: csv, tsv, json, jsonl, html, markdown
 * For xlsx/ods/xlsb: requires optional `xlsx` npm package (install separately)
 */
export class SpreadsheetProcessor {
  constructor(private state: ConversionState) {}

  async convert(options: SpreadsheetConvertOptions) {
    const { inputPath, outputPath } = options;
    const inExt = (options.inputFormat ?? inputPath.split(".").pop() ?? "").toLowerCase();
    const outExt = (options.outputFormat ?? outputPath.split(".").pop() ?? "").toLowerCase();
    const record = this.state.createRecord("spreadsheet", inputPath, outputPath, options);

    try {
      const rawInput = await readFile(inputPath, "utf8");
      let rows: Record<string, any>[] = [];

      // Parse input
      if (inExt === "csv" || inExt === "tsv") {
        const delim = inExt === "tsv" ? "\t" : (options.delimiter ?? ",");
        rows = this.parseCSV(rawInput, delim, options.header ?? true, options.skipRows ?? 0);
      } else if (inExt === "json") {
        const parsed = JSON.parse(rawInput);
        rows = Array.isArray(parsed) ? parsed : [parsed];
      } else if (inExt === "jsonl" || inExt === "ndjson") {
        rows = rawInput.trim().split("\n").filter(Boolean).map(l => JSON.parse(l));
      } else if (inExt === "xlsx" || inExt === "ods" || inExt === "xlsb") {
        rows = await this.parseXlsx(inputPath, options.sheet);
      } else {
        throw new Error(`Unsupported spreadsheet input format: ${inExt}`);
      }

      // Serialize output
      let output = "";
      if (outExt === "csv" || outExt === "tsv") {
        const delim = outExt === "tsv" ? "\t" : (options.delimiter ?? ",");
        output = this.toCSV(rows, delim);
      } else if (outExt === "json") {
        output = JSON.stringify(rows, null, 2);
      } else if (outExt === "jsonl" || outExt === "ndjson") {
        output = rows.map(r => JSON.stringify(r)).join("\n");
      } else if (outExt === "html") {
        output = this.toHTMLTable(rows);
      } else if (outExt === "md" || outExt === "markdown") {
        output = this.toMarkdownTable(rows);
      } else if (outExt === "xlsx") {
        await this.writeXlsx(rows, outputPath);
        this.state.completeRecord(record, true, {});
        return { success: true, id: record.id, input: inputPath, output: outputPath, rows: rows.length, durationMs: record.durationMs, message: `Spreadsheet converted (${rows.length} rows) in ${record.durationMs}ms` };
      } else {
        throw new Error(`Unsupported spreadsheet output format: ${outExt}`);
      }

      await writeFile(outputPath, output, "utf8");
      this.state.completeRecord(record, true, {});
      return { success: true, id: record.id, input: inputPath, output: outputPath, rows: rows.length, durationMs: record.durationMs, message: `Spreadsheet converted (${rows.length} rows) in ${record.durationMs}ms` };
    } catch (err: any) {
      this.state.completeRecord(record, false, { error: err.message });
      throw err;
    }
  }

  private parseCSV(raw: string, delimiter: string, header: boolean, skipRows: number): Record<string, any>[] {
    const lines = raw.trim().split("\n").slice(skipRows);
    if (lines.length === 0) return [];
    const headers = header ? this.parseCSVLine(lines[0], delimiter) : lines[0].split(delimiter).map((_,i) => `col${i}`);
    const dataLines = header ? lines.slice(1) : lines;
    return dataLines.map(line => {
      const vals = this.parseCSVLine(line, delimiter);
      const row: Record<string, any> = {};
      headers.forEach((h, i) => { row[h] = vals[i] ?? ""; });
      return row;
    });
  }

  private parseCSVLine(line: string, delimiter: string): string[] {
    const result: string[] = [];
    let current = "", inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { inQuotes = !inQuotes; }
      else if (ch === delimiter && !inQuotes) { result.push(current.trim()); current = ""; }
      else { current += ch; }
    }
    result.push(current.trim());
    return result;
  }

  private toCSV(rows: Record<string, any>[], delimiter: string): string {
    if (rows.length === 0) return "";
    const headers = Object.keys(rows[0]);
    const escape = (v: any) => {
      const s = String(v ?? "");
      return s.includes(delimiter) || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s;
    };
    return [headers.map(escape).join(delimiter), ...rows.map(r => headers.map(h => escape(r[h])).join(delimiter))].join("\n");
  }

  private toHTMLTable(rows: Record<string, any>[]): string {
    if (rows.length === 0) return "<table></table>";
    const headers = Object.keys(rows[0]);
    const thead = `<thead><tr>${headers.map(h => `<th>${h}</th>`).join("")}</tr></thead>`;
    const tbody = `<tbody>${rows.map(r => `<tr>${headers.map(h => `<td>${r[h] ?? ""}</td>`).join("")}</tr>`).join("\n")}</tbody>`;
    return `<table>\n${thead}\n${tbody}\n</table>`;
  }

  private toMarkdownTable(rows: Record<string, any>[]): string {
    if (rows.length === 0) return "";
    const headers = Object.keys(rows[0]);
    const header = `| ${headers.join(" | ")} |`;
    const separator = `| ${headers.map(() => "---").join(" | ")} |`;
    const body = rows.map(r => `| ${headers.map(h => String(r[h] ?? "").replace(/\|/g, "\\|")).join(" | ")} |`).join("\n");
    return [header, separator, body].join("\n");
  }

  private async parseXlsx(inputPath: string, sheet?: string | number): Promise<Record<string, any>[]> {
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.readFile(inputPath);
      const sheetName = typeof sheet === "string" ? sheet : wb.SheetNames[typeof sheet === "number" ? sheet : 0];
      const ws = wb.Sheets[sheetName];
      return XLSX.utils.sheet_to_json(ws, { defval: "" });
    } catch {
      throw new Error("xlsx package not found. Run: npm install xlsx");
    }
  }

  private async writeXlsx(rows: Record<string, any>[], outputPath: string): Promise<void> {
    try {
      const XLSX = await import("xlsx");
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
      XLSX.writeFile(wb, outputPath);
    } catch {
      throw new Error("xlsx package not found. Run: npm install xlsx");
    }
  }
}
