import { readFile, writeFile } from "fs/promises";
import { ConversionState } from "../state/ConversionState.js";

export interface DocConvertOptions {
  inputPath: string;
  outputPath: string;
  inputFormat?: string;
  outputFormat?: string;
  pretty?: boolean;
}

/**
 * DocProcessor — document format conversion (pure Node.js)
 * Supported input:  md, markdown, json, yaml, yml, html, csv, txt, rst, ndjson, jsonl
 * Supported output: md, markdown, json, yaml, yml, html, csv, txt, ndjson, jsonl
 */
export class DocProcessor {
  constructor(private state: ConversionState) {}

  async convert(options: DocConvertOptions) {
    const { inputPath, outputPath, pretty = true } = options;
    const inExt = (options.inputFormat ?? inputPath.split(".").pop() ?? "").toLowerCase();
    const outExt = (options.outputFormat ?? outputPath.split(".").pop() ?? "").toLowerCase();
    const record = this.state.createRecord("document", inputPath, outputPath, options);

    try {
      const raw = await readFile(inputPath, "utf8");
      let parsed: any;

      // Parse
      if (inExt === "json") {
        parsed = JSON.parse(raw);
      } else if (inExt === "yaml" || inExt === "yml") {
        parsed = this.parseYaml(raw);
      } else if (inExt === "csv") {
        parsed = this.parseCsv(raw);
      } else if (inExt === "jsonl" || inExt === "ndjson") {
        parsed = raw.trim().split("\n").filter(Boolean).map(l => JSON.parse(l));
      } else {
        parsed = raw;
      }

      // Serialize
      let output = "";
      if (outExt === "json") {
        output = pretty ? JSON.stringify(parsed, null, 2) : JSON.stringify(parsed);
      } else if (outExt === "yaml" || outExt === "yml") {
        output = this.toYaml(parsed);
      } else if (outExt === "csv") {
        output = this.toCsv(Array.isArray(parsed) ? parsed : [parsed]);
      } else if (outExt === "html") {
        output = this.toHtml(parsed, inExt);
      } else if (outExt === "md" || outExt === "markdown") {
        output = this.toMarkdown(parsed, inExt);
      } else if (outExt === "txt") {
        output = typeof parsed === "string" ? parsed : JSON.stringify(parsed, null, 2);
      } else if (outExt === "jsonl" || outExt === "ndjson") {
        const arr = Array.isArray(parsed) ? parsed : [parsed];
        output = arr.map((r: any) => JSON.stringify(r)).join("\n");
      } else {
        output = typeof parsed === "string" ? parsed : JSON.stringify(parsed, null, 2);
      }

      await writeFile(outputPath, output, "utf8");
      this.state.completeRecord(record, true, {});
      return { success: true, id: record.id, input: inputPath, output: outputPath, durationMs: record.durationMs, message: `Document converted (${inExt} → ${outExt}) in ${record.durationMs}ms` };
    } catch (err: any) {
      this.state.completeRecord(record, false, { error: err.message });
      throw err;
    }
  }

  private parseYaml(raw: string): any {
    const result: Record<string, any> = {};
    const lines = raw.split("\n");
    const stack: Array<{ indent: number; obj: Record<string, any> | any[] }> = [{ indent: -1, obj: result }];
    for (const line of lines) {
      if (!line.trim() || line.trim().startsWith("#")) continue;
      const indent = line.search(/\S/);
      const keyValMatch = line.trim().match(/^([^:]+):\s*(.*)$/);
      if (!keyValMatch) continue;
      const key = keyValMatch[1].trim();
      const val = keyValMatch[2].trim();
      while (stack.length > 1 && stack[stack.length - 1].indent >= indent) stack.pop();
      const parent = stack[stack.length - 1].obj as Record<string, any>;
      if (!val) {
        parent[key] = {};
        stack.push({ indent, obj: parent[key] });
      } else {
        parent[key] = val === "true" ? true : val === "false" ? false : isNaN(Number(val)) ? val : Number(val);
      }
    }
    return result;
  }

  private toYaml(obj: any, indent = 0): string {
    if (typeof obj !== "object" || obj === null) return String(obj);
    return Object.entries(obj).map(([k, v]) => {
      if (typeof v === "object" && v !== null && !Array.isArray(v)) {
        return `${" ".repeat(indent)}${k}:\n${this.toYaml(v, indent + 2)}`;
      } else if (Array.isArray(v)) {
        return `${" ".repeat(indent)}${k}:\n${(v as any[]).map(item => `${" ".repeat(indent + 2)}- ${typeof item === "object" ? JSON.stringify(item) : item}`).join("\n")}`;
      }
      return `${" ".repeat(indent)}${k}: ${v}`;
    }).join("\n");
  }

  private parseCsv(raw: string): Record<string, string>[] {
    const lines = raw.trim().split("\n");
    const headers = lines[0].split(",").map(h => h.trim().replace(/^"|"$/g, ""));
    return lines.slice(1).map(line => {
      const vals = line.split(",").map(v => v.trim().replace(/^"|"$/g, ""));
      const row: Record<string, string> = {};
      headers.forEach((h, i) => { row[h] = vals[i] ?? ""; });
      return row;
    });
  }

  private toCsv(rows: any[]): string {
    if (!rows.length) return "";
    const headers = Object.keys(rows[0]);
    return [headers.join(","), ...rows.map(r => headers.map(h => `"${String(r[h] ?? "").replace(/"/g, '""')}"`).join(","))].join("\n");
  }

  private toHtml(parsed: any, inExt: string): string {
    if (typeof parsed === "string") return `<html><body><pre>${parsed}</pre></body></html>`;
    if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === "object") {
      const headers = Object.keys(parsed[0]);
      return `<html><body><table border="1"><thead><tr>${headers.map(h => `<th>${h}</th>`).join("")}</tr></thead><tbody>${parsed.map((r: any) => `<tr>${headers.map(h => `<td>${r[h] ?? ""}</td>`).join("")}</tr>`).join("")}</tbody></table></body></html>`;
    }
    return `<html><body><pre>${JSON.stringify(parsed, null, 2)}</pre></body></html>`;
  }

  private toMarkdown(parsed: any, inExt: string): string {
    if (typeof parsed === "string") return parsed;
    if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === "object") {
      const headers = Object.keys(parsed[0]);
      const header = `| ${headers.join(" | ")} |`;
      const sep = `| ${headers.map(() => "---").join(" | ")} |`;
      const rows = parsed.map((r: any) => `| ${headers.map(h => String(r[h] ?? "").replace(/\|/g, "\\|")).join(" | ")} |`).join("\n");
      return `${header}\n${sep}\n${rows}`;
    }
    return `\`\`\`json\n${JSON.stringify(parsed, null, 2)}\n\`\`\``;
  }
}
