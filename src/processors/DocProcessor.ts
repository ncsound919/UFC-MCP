import { readFile, writeFile, stat, mkdir } from "fs/promises";
import { dirname, extname } from "path";
import { ConversionState } from "../state/ConversionState.js";

type DocFormat = "md" | "json" | "yaml" | "html" | "csv" | "txt";

export interface DocConvertOptions {
  inputPath: string;
  outputPath: string;
  inputFormat?: DocFormat;
  outputFormat?: DocFormat;
  pretty?: boolean;
}

export class DocProcessor {
  constructor(private state: ConversionState) {}

  async convert(options: DocConvertOptions) {
    const { inputPath, outputPath, pretty = true } = options;

    const inFmt = (options.inputFormat || extname(inputPath).slice(1).toLowerCase()) as DocFormat;
    const outFmt = (options.outputFormat || extname(outputPath).slice(1).toLowerCase()) as DocFormat;

    const record = this.state.createRecord("document", inputPath, outputPath, {
      inputFormat: inFmt,
      outputFormat: outFmt,
    });

    try {
      const inStat = await stat(inputPath).catch(() => null);
      const raw = await readFile(inputPath, "utf-8");
      const outDir = dirname(outputPath);
      await mkdir(outDir, { recursive: true });

      const output = await this.transform(raw, inFmt, outFmt, pretty);
      await writeFile(outputPath, output, "utf-8");

      const outStat = await stat(outputPath).catch(() => null);
      this.state.completeRecord(record, true, {
        inputSize: inStat?.size,
        outputSize: outStat?.size,
      });

      return {
        success: true,
        id: record.id,
        input: inputPath,
        output: outputPath,
        conversion: `${inFmt} → ${outFmt}`,
        durationMs: record.durationMs,
        inputSize: inStat ? `${(inStat.size / 1024).toFixed(1)} KB` : null,
        outputSize: outStat ? `${(outStat.size / 1024).toFixed(1)} KB` : null,
        message: `Document converted (${inFmt} → ${outFmt}) in ${record.durationMs}ms`,
      };
    } catch (err: any) {
      this.state.completeRecord(record, false, { error: err.message });
      throw err;
    }
  }

  private async transform(raw: string, from: DocFormat, to: DocFormat, pretty: boolean): Promise<string> {
    const key = `${normalizeFormat(from)}_to_${normalizeFormat(to)}`;

    switch (key) {
      case "md_to_html":
        return this.mdToHtml(raw);
      case "md_to_json":
        return this.mdToJson(raw, pretty);
      case "md_to_txt":
        return this.stripMarkdown(raw);
      case "html_to_md":
        return this.htmlToMd(raw);
      case "json_to_md":
        return this.jsonToMd(raw, pretty);
      case "json_to_yaml":
        return this.jsonToYaml(raw, pretty);
      case "json_to_csv":
        return this.jsonToCsv(raw);
      case "json_to_txt":
        return JSON.stringify(JSON.parse(raw), null, pretty ? 2 : 0);
      case "yaml_to_json":
        return this.yamlToJson(raw, pretty);
      case "csv_to_json":
        return this.csvToJson(raw, pretty);
      case "csv_to_md":
        return this.csvToMd(raw);
      case "txt_to_md":
        return this.txtToMd(raw);
      case "txt_to_json":
        return JSON.stringify({ content: raw, lines: raw.split("\n"), wordCount: raw.split(/\s+/).length }, null, 2);
      default:
        if (from === to) return raw;
        throw new Error(`Unsupported conversion: ${from} → ${to}`);
    }
  }

  // ─── Converters ─────────────────────────────────────────────────────────────

  private mdToHtml(md: string): string {
    // Lightweight Markdown → HTML (no external dep needed for basics)
    return md
      .replace(/^# (.+)$/gm, "<h1>$1</h1>")
      .replace(/^## (.+)$/gm, "<h2>$1</h2>")
      .replace(/^### (.+)$/gm, "<h3>$1</h3>")
      .replace(/^#### (.+)$/gm, "<h4>$1</h4>")
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.+?)\*/g, "<em>$1</em>")
      .replace(/`(.+?)`/g, "<code>$1</code>")
      .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2">$1</a>')
      .replace(/^- (.+)$/gm, "<li>$1</li>")
      .replace(/(<li>.*<\/li>\n?)+/g, (m) => `<ul>\n${m}</ul>\n`)
      .replace(/^(\d+)\. (.+)$/gm, "<li>$2</li>")
      .replace(/\n\n/g, "</p>\n<p>")
      .replace(/^(?!<[h|u|o|l|p])(.+)$/gm, "<p>$1</p>")
      .trim();
  }

  private mdToJson(md: string, pretty: boolean): string {
    const lines = md.split("\n");
    const sections: any[] = [];
    let current: any = null;

    for (const line of lines) {
      const h1 = line.match(/^# (.+)/);
      const h2 = line.match(/^## (.+)/);
      const h3 = line.match(/^### (.+)/);
      const li = line.match(/^[-*] (.+)/);
      const numbered = line.match(/^\d+\. (.+)/);

      if (h1) {
        current = { type: "h1", heading: h1[1], content: [] };
        sections.push(current);
      } else if (h2) {
        current = { type: "h2", heading: h2[1], content: [] };
        sections.push(current);
      } else if (h3) {
        current = { type: "h3", heading: h3[1], content: [] };
        sections.push(current);
      } else if (li) {
        if (current) current.content.push({ type: "list_item", text: li[1] });
        else sections.push({ type: "list_item", text: li[1] });
      } else if (numbered) {
        if (current) current.content.push({ type: "ordered_item", text: numbered[1] });
      } else if (line.trim()) {
        if (current) current.content.push({ type: "paragraph", text: line.trim() });
        else sections.push({ type: "paragraph", text: line.trim() });
      }
    }

    return JSON.stringify({ document: sections }, null, pretty ? 2 : 0);
  }

  private stripMarkdown(md: string): string {
    return md
      .replace(/^#{1,6} /gm, "")
      .replace(/\*\*(.+?)\*\*/g, "$1")
      .replace(/\*(.+?)\*/g, "$1")
      .replace(/`(.+?)`/g, "$1")
      .replace(/\[(.+?)\]\(.+?\)/g, "$1")
      .replace(/^[-*] /gm, "• ")
      .trim();
  }

  private htmlToMd(html: string): string {
    // Iteratively strip script/style blocks to ensure no nested obfuscation survives.
    // This is a file-to-file converter: output is Markdown on disk, not browser-rendered.
    let clean = html;
    let prev: string;
    do {
      prev = clean;
      clean = clean.replace(/<script[^>]*>[\s\S]*?<\/script[^>]*>/gi, "");
      clean = clean.replace(/<style[^>]*>[\s\S]*?<\/style[^>]*>/gi, "");
    } while (prev !== clean);

    let md = clean;
    md = md.replace(/<h1[^>]*>(.*?)<\/h1>/gi, "# $1\n");
    md = md.replace(/<h2[^>]*>(.*?)<\/h2>/gi, "## $1\n");
    md = md.replace(/<h3[^>]*>(.*?)<\/h3>/gi, "### $1\n");
    md = md.replace(/<strong[^>]*>(.*?)<\/strong>/gi, "**$1**");
    md = md.replace(/<b[^>]*>(.*?)<\/b>/gi, "**$1**");
    md = md.replace(/<em[^>]*>(.*?)<\/em>/gi, "*$1*");
    md = md.replace(/<i[^>]*>(.*?)<\/i>/gi, "*$1*");
    md = md.replace(/<code[^>]*>(.*?)<\/code>/gi, "`$1`");
    md = md.replace(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi, "[$2]($1)");
    md = md.replace(/<li[^>]*>(.*?)<\/li>/gi, "- $1\n");
    md = md.replace(/<[^>]+>/g, "");
    md = md.replace(/\n{3,}/g, "\n\n");
    return md.trim();
  }

  private jsonToMd(raw: string, _pretty: boolean): string {
    const data = JSON.parse(raw);
    return this.objectToMd(data, 1);
  }

  private objectToMd(obj: any, depth: number): string {
    if (typeof obj !== "object" || obj === null) return String(obj);
    if (Array.isArray(obj)) {
      return obj.map((item) => `- ${typeof item === "object" ? "\n" + this.objectToMd(item, depth + 1) : item}`).join("\n");
    }
    const heading = "#".repeat(Math.min(depth, 6));
    return Object.entries(obj)
      .map(([key, val]) => {
        if (typeof val === "object" && val !== null) {
          return `${heading} ${key}\n\n${this.objectToMd(val, depth + 1)}`;
        }
        return `**${key}**: ${val}`;
      })
      .join("\n\n");
  }

  private jsonToYaml(raw: string, _pretty: boolean): string {
    const obj = JSON.parse(raw);
    return this.toYaml(obj, 0);
  }

  private toYaml(obj: any, indent: number): string {
    const pad = "  ".repeat(indent);
    if (obj === null) return "null";
    if (typeof obj === "string") return obj.includes("\n") ? `|\n${obj.split("\n").map((l) => pad + "  " + l).join("\n")}` : obj;
    if (typeof obj !== "object") return String(obj);
    if (Array.isArray(obj)) {
      return obj.map((item) => `${pad}- ${typeof item === "object" ? "\n" + this.toYaml(item, indent + 1) : item}`).join("\n");
    }
    return Object.entries(obj)
      .map(([k, v]) => {
        if (typeof v === "object" && v !== null) {
          return `${pad}${k}:\n${this.toYaml(v, indent + 1)}`;
        }
        return `${pad}${k}: ${v}`;
      })
      .join("\n");
  }

  private yamlToJson(raw: string, pretty: boolean): string {
    // Basic YAML parser for simple key-value pairs, nested objects, and scalar arrays.
    // Note: advanced YAML features (multiline strings with > or |, anchors/aliases,
    // custom tags, nested arrays) are not supported. For complex YAML use a dedicated library.
    const lines = raw.split("\n").filter((l) => l.trim() && !l.trim().startsWith("#"));
    const result: any = {};
    const stack: { obj: any; indent: number }[] = [{ obj: result, indent: -1 }];

    for (const line of lines) {
      const indent = line.search(/\S/);
      const trimmed = line.trim();
      const [rawKey, ...valueParts] = trimmed.split(":");
      const key = rawKey.replace(/^- /, "").trim();
      const value = valueParts.join(":").trim();

      while (stack.length > 1 && indent <= stack[stack.length - 1].indent) stack.pop();
      const parent = stack[stack.length - 1].obj;

      if (value) {
        const parsed = value === "true" ? true : value === "false" ? false : value === "null" ? null : isNaN(Number(value)) ? value : Number(value);
        if (Array.isArray(parent)) parent.push(parsed);
        else parent[key] = parsed;
      } else {
        const child: any = trimmed.startsWith("- ") ? [] : {};
        if (Array.isArray(parent)) parent.push(child);
        else parent[key] = child;
        stack.push({ obj: child, indent });
      }
    }

    return JSON.stringify(result, null, pretty ? 2 : 0);
  }

  private jsonToCsv(raw: string): string {
    const data = JSON.parse(raw);
    const arr = Array.isArray(data) ? data : [data];
    if (!arr.length) return "";
    const headers = Object.keys(arr[0]);
    const rows = arr.map((row: any) =>
      headers.map((h) => {
        const val = row[h];
        const str = val === null || val === undefined ? "" : String(val);
        return str.includes(",") || str.includes('"') || str.includes("\n")
          ? `"${str.replace(/"/g, '""')}"`
          : str;
      }).join(",")
    );
    return [headers.join(","), ...rows].join("\n");
  }

  private parseCsvLine(line: string): string[] {
    const fields: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"') {
          if (i + 1 < line.length && line[i + 1] === '"') {
            current += '"';
            i++; // skip escaped double-quote
          } else {
            inQuotes = false;
          }
        } else {
          current += ch;
        }
      } else {
        if (ch === '"') {
          inQuotes = true;
        } else if (ch === ",") {
          fields.push(current);
          current = "";
        } else {
          current += ch;
        }
      }
    }
    fields.push(current);
    return fields;
  }

  private csvToJson(raw: string, pretty: boolean): string {
    const lines = raw.trim().split("\n");
    if (!lines.length) return "[]";
    const headers = this.parseCsvLine(lines[0]).map((h) => h.trim());
    const rows = lines.slice(1).map((line) => {
      const vals = this.parseCsvLine(line);
      return headers.reduce((acc: any, h, i) => {
        const val = (vals[i] ?? "").trim();
        acc[h] = isNaN(Number(val)) || val === "" ? val : Number(val);
        return acc;
      }, {});
    });
    return JSON.stringify(rows, null, pretty ? 2 : 0);
  }

  private csvToMd(raw: string): string {
    const lines = raw.trim().split("\n");
    if (!lines.length) return "";
    const [header, ...rows] = lines;
    const cols = this.parseCsvLine(header).map((c) => c.trim());
    const separator = cols.map(() => "---").join(" | ");
    const mdRows = rows.map((r) => this.parseCsvLine(r).map((c) => c.trim()).join(" | "));
    return [cols.join(" | "), separator, ...mdRows].join("\n");
  }

  private txtToMd(txt: string): string {
    return txt
      .split("\n")
      .map((line) => (line.trim() ? line : ""))
      .join("\n")
      .replace(/\n{3,}/g, "\n\n");
  }
}

function normalizeFormat(f: string): string {
  if (f === "markdown") return "md";
  if (f === "yml") return "yaml";
  if (f === "jpeg") return "jpg";
  return f;
}
