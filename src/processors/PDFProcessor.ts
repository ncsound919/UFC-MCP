import { execFile } from "child_process";
import { promisify } from "util";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { statSync } from "fs";
import { dirname, basename } from "path";
import { ConversionState } from "../state/ConversionState.js";

const exec = promisify(execFile);

export type PDFFormat = "pdf" | "json" | "txt" | "md" | "markdown";

export interface PDFConvertOptions {
  inputPath: string;
  outputPath: string;
  outputFormat?: PDFFormat;
  startPage?: number;
  endPage?: number;
  preserveLayout?: boolean;
  pageSeparator?: string;
}

const PYTHON_BRIDGE = `
import json, sys, os
try:
    import pdfplumber
except Exception as e:
    print(json.dumps({"error": f"pdfplumber not installed: {e}"}))
    sys.exit(2)

pdf_path, out_path, fmt, start, end, layout, sep = sys.argv[1:]
start, end = int(start), int(end)
pages = []
with pdfplumber.open(pdf_path) as pdf:
    total = len(pdf.pages)
    page_range = range(start - 1, min(end, total)) if end and end <= total else range(start - 1, total)
    for i in page_range:
        page = pdf.pages[i]
        try:
            text = page.extract_text(layout=layout) or ""
        except Exception:
            text = ""
        pages.append({"page": i + 1, "text": text})

full = f"{sep}\\n".join(f"[Page {p['page']}]\\n{p['text']}" for p in pages if p["text"])
meta = {"pages": len(pages), "total_pages": total, "chars": len(full)}

if fmt == "json":
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump({"metadata": meta, "pages": pages}, f, indent=2)
else:
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(full if fmt == "txt" else f"# {os.path.basename(pdf_path)}\\n\\n" + full)
print(json.dumps(meta))
`;

export class PDFProcessor {
  constructor(private state: ConversionState) {}

  private extToFormat(ext: string): PDFFormat {
    const map: Record<string, PDFFormat> = {
      pdf: "pdf", json: "json", txt: "txt", md: "md", markdown: "md",
    };
    return map[ext.toLowerCase()] ?? "txt";
  }

  async convert(opts: PDFConvertOptions) {
    const { inputPath, outputPath } = opts;
    const inExt = (inputPath.split(".").pop() ?? "").toLowerCase();
    if (inExt !== "pdf") throw new Error(`PDFProcessor only accepts .pdf input, got .${inExt}`);
    const outExt = (outputPath.split(".").pop() ?? "").toLowerCase();
    const outFmt = opts.outputFormat ?? this.extToFormat(outExt);
    const startPage = opts.startPage ?? 1;
    const endPage = opts.endPage ?? 0;
    const layout = opts.preserveLayout ? true : false;
    const sep = opts.pageSeparator ?? "\n\n---\n\n";
    const record = this.state.createRecord("pdf", inputPath, outputPath, opts);

    try {
      mkdirSync(dirname(outputPath), { recursive: true });
      const args = [
        "-c", PYTHON_BRIDGE,
        inputPath, outputPath, outFmt, String(startPage), String(endPage),
        String(layout), sep,
      ];
      const { stdout, stderr } = await exec("python", args, { maxBuffer: 256 * 1024 * 1024 });
      const meta = JSON.parse(stdout.trim().split("\n").pop() ?? "{}");
      if (meta.error) throw new Error(meta.error);
      const inStat = statSync(inputPath);
      const outStat = statSync(outputPath);
      this.state.completeRecord(record, true, { inputSize: inStat.size, outputSize: outStat.size });
      return {
        success: true,
        inputPath, outputPath,
        outputFormat: outFmt,
        ...meta,
        stderr: stderr ? stderr.trim().split("\n").slice(0, 5) : [],
      };
    } catch (err: any) {
      this.state.completeRecord(record, false, { error: err.message });
      throw err;
    }
  }
}
