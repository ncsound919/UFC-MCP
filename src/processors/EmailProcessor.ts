import { readFile, writeFile } from "fs/promises";
import { ConversionState } from "../state/ConversionState.js";

export interface EmailConvertOptions {
  inputPath: string;
  outputPath: string;
  inputFormat?: string;
  outputFormat?: string;
  includeAttachments?: boolean;
  bodyOnly?: boolean;
}

/**
 * EmailProcessor — email format conversion
 * Supported input:  eml, mbox, msg (basic)
 * Supported output: json, html, txt, md
 */
export class EmailProcessor {
  constructor(private state: ConversionState) {}

  async convert(options: EmailConvertOptions) {
    const { inputPath, outputPath } = options;
    const inExt = (options.inputFormat ?? inputPath.split(".").pop() ?? "").toLowerCase();
    const outExt = (options.outputFormat ?? outputPath.split(".").pop() ?? "").toLowerCase();
    const record = this.state.createRecord("email", inputPath, outputPath, options);

    try {
      const raw = await readFile(inputPath, "utf8");
      let emails: any[];

      if (inExt === "mbox") {
        emails = this.parseMbox(raw);
      } else if (inExt === "eml") {
        emails = [this.parseEml(raw)];
      } else {
        throw new Error(`Unsupported email input format: ${inExt}. Supported: eml, mbox`);
      }

      let output = "";
      if (outExt === "json") {
        output = JSON.stringify(options.bodyOnly ? emails.map(e => ({ subject: e.subject, from: e.from, to: e.to, date: e.date, body: e.body })) : emails, null, 2);
      } else if (outExt === "html") {
        output = emails.map(e => this.toHTML(e)).join("\n<hr>\n");
      } else if (outExt === "txt") {
        output = emails.map(e => this.toText(e)).join("\n\n" + "=".repeat(60) + "\n\n");
      } else if (outExt === "md") {
        output = emails.map(e => this.toMarkdown(e)).join("\n\n---\n\n");
      } else {
        throw new Error(`Unsupported email output format: ${outExt}. Supported: json, html, txt, md`);
      }

      await writeFile(outputPath, output, "utf8");
      this.state.completeRecord(record, true, {});
      return { success: true, id: record.id, input: inputPath, output: outputPath, emailCount: emails.length, durationMs: record.durationMs, message: `Converted ${emails.length} email(s) in ${record.durationMs}ms` };
    } catch (err: any) {
      this.state.completeRecord(record, false, { error: err.message });
      throw err;
    }
  }

  private parseEml(raw: string): any {
    const lines = raw.split("\n");
    const headers: Record<string, string> = {};
    let bodyStart = 0;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].trim() === "") { bodyStart = i + 1; break; }
      const match = lines[i].match(/^([\w-]+):\s*(.*)/);
      if (match) headers[match[1].toLowerCase()] = match[2];
    }
    const body = lines.slice(bodyStart).join("\n");
    return {
      messageId: headers["message-id"] ?? "",
      subject: this.decodeHeader(headers["subject"] ?? ""),
      from: headers["from"] ?? "",
      to: headers["to"] ?? "",
      date: headers["date"] ?? "",
      contentType: headers["content-type"] ?? "text/plain",
      body: body.trim(),
      headers,
    };
  }

  private parseMbox(raw: string): any[] {
    const messages = raw.split(/^From /m).filter(Boolean);
    return messages.map(msg => this.parseEml("From " + msg));
  }

  private decodeHeader(value: string): string {
    return value.replace(/=\?([^?]+)\?(B|Q)\?([^?]*)\?=/gi, (_, charset, encoding, text) => {
      if (encoding.toUpperCase() === "B") return Buffer.from(text, "base64").toString("utf8");
      return text.replace(/_/g, " ").replace(/=([0-9A-F]{2})/gi, (__, hex) => String.fromCharCode(parseInt(hex, 16)));
    });
  }

  private toHTML(email: any): string {
    return `<div class="email"><h2>${email.subject}</h2><p><strong>From:</strong> ${email.from}</p><p><strong>To:</strong> ${email.to}</p><p><strong>Date:</strong> ${email.date}</p><hr><pre>${email.body}</pre></div>`;
  }

  private toText(email: any): string {
    return `Subject: ${email.subject}\nFrom: ${email.from}\nTo: ${email.to}\nDate: ${email.date}\n\n${email.body}`;
  }

  private toMarkdown(email: any): string {
    return `## ${email.subject}\n\n**From:** ${email.from}  \n**To:** ${email.to}  \n**Date:** ${email.date}\n\n${email.body}`;
  }
}
