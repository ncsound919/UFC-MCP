import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { statSync } from 'fs';
import { dirname } from 'path';
import { ConversionState } from '../state/ConversionState.js';

export type FinFormat = 'ofx' | 'qfx' | 'qif' | 'mt940' | 'json' | 'csv';

export interface FinConvertOptions {
  inputPath: string;
  outputPath: string;
  inputFormat?: FinFormat;
  outputFormat?: FinFormat;
}

export class FintechProcessor {
  constructor(private state: ConversionState) {}

  private extToFormat(ext: string): FinFormat {
    const map: Record<string, FinFormat> = {
      ofx: 'ofx', qfx: 'qfx', qif: 'qif', mt940: 'mt940', json: 'json', csv: 'csv',
    };
    return map[ext.toLowerCase()] ?? 'json';
  }

  async convert(opts: FinConvertOptions) {
    const { inputPath, outputPath, inputFormat, outputFormat } = opts;
    const inExt = inputPath.split('.').pop() ?? '';
    const outExt = outputPath.split('.').pop() ?? '';
    const inFmt = inputFormat ?? this.extToFormat(inExt);
    const outFmt = outputFormat ?? this.extToFormat(outExt);
    const record = this.state.createRecord('fintech', inputPath, outputPath, opts);
    try {
      const input = readFileSync(inputPath, 'utf8');
      mkdirSync(dirname(outputPath), { recursive: true });
      const output = this.transform(input, inFmt, outFmt);
      writeFileSync(outputPath, output);
      const inStat = statSync(inputPath);
      const outStat = statSync(outputPath);
      this.state.completeRecord(record, true, { inputSize: inStat.size, outputSize: outStat.size });
      return { success: true, inputPath, outputPath, inputFormat: inFmt, outputFormat: outFmt, inputSize: inStat.size, outputSize: outStat.size };
    } catch (err: any) {
      this.state.completeRecord(record, false, { error: err.message });
      throw err;
    }
  }

  private transform(input: string, inFmt: FinFormat, outFmt: FinFormat): string {
    if (inFmt === 'ofx' || inFmt === 'qfx') {
      const parsed = this.parseOFX(input);
      if (outFmt === 'json') return JSON.stringify(parsed, null, 2);
      if (outFmt === 'csv') return this.txnsToCsv(parsed.transactions);
      throw new Error(`Unsupported OFX output: ${outFmt}`);
    }
    if (inFmt === 'qif') {
      const parsed = this.parseQIF(input);
      if (outFmt === 'json') return JSON.stringify(parsed, null, 2);
      if (outFmt === 'csv') return this.txnsToCsv(parsed.transactions);
      throw new Error(`Unsupported QIF output: ${outFmt}`);
    }
    if (inFmt === 'mt940') {
      const parsed = this.parseMT940(input);
      if (outFmt === 'json') return JSON.stringify(parsed, null, 2);
      if (outFmt === 'csv') return this.txnsToCsv(parsed.transactions);
      throw new Error(`Unsupported MT940 output: ${outFmt}`);
    }
    throw new Error(`Unsupported fintech conversion: ${inFmt} -> ${outFmt}`);
  }

  private parseOFX(src: string) {
    const isXml = src.trim().startsWith('<?xml') || src.trim().startsWith('<OFX');
    const getVal = (tag: string, text: string) => {
      const m = text.match(new RegExp(`<${tag}[^>]*>([^<]*)`, 'i'));
      return m ? m[1].trim() : '';
    };
    const getAllBlocks = (tag: string, text: string) => {
      const re = new RegExp(`<${tag}[\\s\\S]*?<\/${tag}>`, 'gi');
      return isXml ? [...text.matchAll(re)].map(m => m[0]) : [];
    };
    // Flatten SGML OFX
    const flatSrc = isXml ? src : src.replace(/<([A-Z.]+)>([^<\n]+)/gi, '<$1>$2</$1>');
    const acctId = getVal('ACCTID', flatSrc);
    const bankId = getVal('BANKID', flatSrc);
    const currency = getVal('CURDEF', flatSrc);
    const stmtBlocks = getAllBlocks('STMTTRN', flatSrc);
    const transactions = (isXml ? stmtBlocks : flatSrc.split(/<STMTTRN>/i).slice(1)).map((block: string) => ({
      type: getVal('TRNTYPE', block),
      date: getVal('DTPOSTED', block),
      amount: parseFloat(getVal('TRNAMT', block)) || 0,
      id: getVal('FITID', block),
      name: getVal('NAME', block),
      memo: getVal('MEMO', block),
    }));
    return { format: 'OFX', accountId: acctId, bankId, currency, transactionCount: transactions.length, transactions };
  }

  private parseQIF(src: string) {
    const lines = src.split(/\r?\n/);
    let type = '';
    const transactions: any[] = [];
    let current: any = {};
    for (const line of lines) {
      if (!line.trim()) continue;
      const code = line[0];
      const val = line.slice(1).trim();
      if (code === '!') { type = val; continue; }
      if (code === '^') { if (Object.keys(current).length) transactions.push(current); current = {}; continue; }
      if (code === 'D') current.date = val;
      else if (code === 'T') current.amount = parseFloat(val.replace(/,/g, '')) || 0;
      else if (code === 'P') current.payee = val;
      else if (code === 'M') current.memo = val;
      else if (code === 'N') current.number = val;
      else if (code === 'C') current.cleared = val;
      else if (code === 'L') current.category = val;
    }
    if (Object.keys(current).length) transactions.push(current);
    return { format: 'QIF', type, transactionCount: transactions.length, transactions };
  }

  private parseMT940(src: string) {
    const lines = src.split(/\r?\n/);
    let accountId = '';
    let statementDate = '';
    let openingBalance = 0;
    let closingBalance = 0;
    let currency = '';
    const transactions: any[] = [];
    for (const line of lines) {
      if (line.startsWith(':25:')) accountId = line.slice(4).trim();
      else if (line.startsWith(':60F:') || line.startsWith(':60M:')) {
        const rest = line.slice(5);
        currency = rest.slice(1, 4);
        openingBalance = parseFloat(rest.slice(4).replace(',', '.')) * (rest[0] === 'D' ? -1 : 1);
        statementDate = rest.slice(1, 7);
      } else if (line.startsWith(':62F:') || line.startsWith(':62M:')) {
        const rest = line.slice(5);
        closingBalance = parseFloat(rest.slice(4).replace(',', '.')) * (rest[0] === 'D' ? -1 : 1);
      } else if (line.startsWith(':61:')) {
        const rest = line.slice(4);
        const valueDate = rest.slice(0, 6);
        const crdr = rest[6] === 'D' ? -1 : 1;
        const amountStr = rest.slice(7).match(/^([\d,]+)/)?.[1] ?? '0';
        const amount = parseFloat(amountStr.replace(',', '.')) * crdr;
        transactions.push({ valueDate, amount, currency, raw: rest });
      } else if (line.startsWith(':86:') && transactions.length) {
        transactions[transactions.length - 1].description = line.slice(4).trim();
      }
    }
    return { format: 'MT940', accountId, statementDate, currency, openingBalance, closingBalance, transactionCount: transactions.length, transactions };
  }

  private txnsToCsv(txns: any[]): string {
    if (!txns.length) return 'date,amount,description';
    const keys = Object.keys(txns[0]);
    const rows = [keys.join(',')];
    for (const t of txns) rows.push(keys.map(k => `"${String(t[k] ?? '').replace(/"/g, '""')}"`).join(','));
    return rows.join('\n');
  }
}
