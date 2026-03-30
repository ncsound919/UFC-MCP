import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { statSync } from 'fs';
import { dirname } from 'path';
import { ConversionState } from '../state/ConversionState.js';

export type DevFormat = 'toml' | 'ini' | 'env' | 'xml' | 'jsonl' | 'json' | 'csv' | 'proto' | 'graphql' | 'gql';

export interface DevConvertOptions {
  inputPath: string;
  outputPath: string;
  inputFormat?: DevFormat;
  outputFormat?: DevFormat;
}

export class DevFormatProcessor {
  constructor(private state: ConversionState) {}

  private extToFormat(ext: string): DevFormat {
    const map: Record<string, DevFormat> = {
      toml: 'toml', ini: 'ini', env: 'env',
      xml: 'xml', jsonl: 'jsonl', ndjson: 'jsonl',
      json: 'json', csv: 'csv', proto: 'proto',
      graphql: 'graphql', gql: 'gql',
    };
    return map[ext.toLowerCase()] ?? 'json';
  }

  async convert(opts: DevConvertOptions) {
    const { inputPath, outputPath, inputFormat, outputFormat } = opts;
    const inExt = inputPath.split('.').pop() ?? '';
    const outExt = outputPath.split('.').pop() ?? '';
    const inFmt = inputFormat ?? this.extToFormat(inExt);
    const outFmt = outputFormat ?? this.extToFormat(outExt);
    const record = this.state.createRecord(inputPath, outputPath, `dev:${inFmt}->${outFmt}`);
    try {
      const input = readFileSync(inputPath, 'utf8');
      mkdirSync(dirname(outputPath), { recursive: true });
      const output = this.transform(input, inFmt, outFmt);
      writeFileSync(outputPath, output);
      const inStat = statSync(inputPath);
      const outStat = statSync(outputPath);
      this.state.completeRecord(record.id, { inputSize: inStat.size, outputSize: outStat.size });
      return { success: true, inputPath, outputPath, inputFormat: inFmt, outputFormat: outFmt, inputSize: inStat.size, outputSize: outStat.size };
    } catch (err: any) {
      this.state.failRecord(record.id, err.message);
      throw err;
    }
  }

  private transform(input: string, inFmt: DevFormat, outFmt: DevFormat): string {
    switch (`${inFmt}->${outFmt}`) {
      case 'toml->json': return JSON.stringify(this.parseTOML(input), null, 2);
      case 'json->toml': return this.jsonToToml(JSON.parse(input));
      case 'ini->json': return JSON.stringify(this.parseINI(input), null, 2);
      case 'json->ini': return this.jsonToIni(JSON.parse(input));
      case 'env->json': return JSON.stringify(this.parseENV(input), null, 2);
      case 'json->env': return this.jsonToEnv(JSON.parse(input));
      case 'xml->json': return JSON.stringify(this.parseXML(input), null, 2);
      case 'jsonl->json': return JSON.stringify(this.parseJSONL(input), null, 2);
      case 'json->jsonl': return this.jsonToJSONL(input);
      case 'proto->json': return JSON.stringify(this.parseProto(input), null, 2);
      case 'graphql->json': case 'gql->json': return JSON.stringify(this.parseGraphQL(input), null, 2);
      default:
        if (inFmt === outFmt) return input;
        throw new Error(`Unsupported dev format conversion: ${inFmt} -> ${outFmt}`);
    }
  }

  private parseTOML(src: string): Record<string, any> {
    const lines = src.split(/\r?\n/);
    const root: Record<string, any> = {};
    let current = root;
    let currentPath: string[] = [];
    const arrayTables: Record<string, any[]> = {};
    for (const raw of lines) {
      const line = raw.split('#')[0].trim();
      if (!line) continue;
      if (line.startsWith('[[')) {
        const key = line.slice(2, line.indexOf(']]')).trim();
        if (!arrayTables[key]) { arrayTables[key] = []; this.setNestedKey(root, key.split('.'), arrayTables[key]); }
        const entry: Record<string, any> = {};
        arrayTables[key].push(entry);
        current = entry;
        currentPath = key.split('.');
      } else if (line.startsWith('[')) {
        const key = line.slice(1, line.indexOf(']')).trim();
        currentPath = key.split('.');
        current = {};
        this.setNestedKey(root, currentPath, current);
      } else if (line.includes('=')) {
        const eqIdx = line.indexOf('=');
        const k = line.slice(0, eqIdx).trim();
        const v = line.slice(eqIdx + 1).trim();
        current[k] = this.parseTOMLValue(v);
      }
    }
    return root;
  }

  private parseTOMLValue(v: string): any {
    if (v.startsWith('"""')) return v.slice(3, v.lastIndexOf('"""'));
    if (v.startsWith('"')) return v.slice(1, -1).replace(/\\n/g, '\n').replace(/\\t/g, '\t');
    if (v.startsWith("'")) return v.slice(1, -1);
    if (v === 'true') return true;
    if (v === 'false') return false;
    if (v.startsWith('[')) {
      try { return JSON.parse(v.replace(/'/g, '"')); } catch { return v; }
    }
    if (!isNaN(Number(v))) return Number(v);
    return v;
  }

  private setNestedKey(obj: any, keys: string[], val: any): void {
    let curr = obj;
    for (let i = 0; i < keys.length - 1; i++) {
      if (!curr[keys[i]] || typeof curr[keys[i]] !== 'object') curr[keys[i]] = {};
      curr = curr[keys[i]];
    }
    curr[keys[keys.length - 1]] = val;
  }

  private jsonToToml(obj: Record<string, any>, prefix = ''): string {
    const lines: string[] = [];
    const sections: string[] = [];
    for (const [k, v] of Object.entries(obj)) {
      if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
        const sectionKey = prefix ? `${prefix}.${k}` : k;
        sections.push(`[${sectionKey}]\n${this.jsonToToml(v, sectionKey)}`);
      } else {
        const val = typeof v === 'string' ? `"${v}"` : JSON.stringify(v);
        lines.push(`${k} = ${val}`);
      }
    }
    return [...lines, ...sections].join('\n');
  }

  private parseINI(src: string): Record<string, any> {
    const result: Record<string, any> = {};
    let section = '__global__';
    for (const raw of src.split(/\r?\n/)) {
      const line = raw.split(/[;#]/)[0].trim();
      if (!line) continue;
      if (line.startsWith('[') && line.endsWith(']')) { section = line.slice(1, -1).trim(); result[section] = result[section] ?? {}; continue; }
      const eqIdx = line.indexOf('=');
      if (eqIdx < 0) continue;
      const k = line.slice(0, eqIdx).trim();
      const v = line.slice(eqIdx + 1).trim();
      const coerced = v === 'true' || v === 'yes' || v === 'on' ? true
        : v === 'false' || v === 'no' || v === 'off' ? false
        : !isNaN(Number(v)) ? Number(v) : v;
      if (section === '__global__') result[k] = coerced;
      else { if (!result[section]) result[section] = {}; result[section][k] = coerced; }
    }
    return result;
  }

  private jsonToIni(obj: Record<string, any>): string {
    const globals: string[] = [];
    const sections: string[] = [];
    for (const [k, v] of Object.entries(obj)) {
      if (typeof v === 'object' && v !== null) {
        sections.push(`[${k}]`);
        for (const [sk, sv] of Object.entries(v)) sections.push(`${sk} = ${sv}`);
        sections.push('');
      } else globals.push(`${k} = ${v}`);
    }
    return [...globals, '', ...sections].join('\n');
  }

  private parseENV(src: string): Record<string, string | number | boolean> {
    const result: Record<string, any> = {};
    for (const raw of src.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const eqIdx = line.indexOf('=');
      if (eqIdx < 0) continue;
      const k = line.slice(0, eqIdx).trim();
      let v = line.slice(eqIdx + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      result[k] = v;
    }
    return result;
  }

  private jsonToEnv(obj: Record<string, any>): string {
    return Object.entries(obj).map(([k, v]) => `${k.toUpperCase()}="${String(v).replace(/"/g, '\\"')}"`).join('\n');
  }

  private parseXML(src: string): any {
    const parseNode = (text: string): any => {
      const tagRe = /<([a-zA-Z][\w.-]*)([^>]*)>(\s*[\s\S]*?)\s*<\/\1>/g;
      const result: any = {};
      let match;
      while ((match = tagRe.exec(text)) !== null) {
        const [, tag, attrs, inner] = match;
        const attrsObj: any = {};
        [...attrs.matchAll(/([\w:-]+)="([^"]*)"/g)].forEach(a => attrsObj[`@${a[1]}`] = a[2]);
        const childResult = parseNode(inner);
        const val = Object.keys(childResult).length ? { ...attrsObj, ...childResult } : { ...attrsObj, '#text': inner.trim() };
        if (result[tag]) {
          if (!Array.isArray(result[tag])) result[tag] = [result[tag]];
          result[tag].push(val);
        } else {
          result[tag] = val;
        }
      }
      return result;
    };
    return parseNode(src);
  }

  private parseJSONL(src: string): any[] {
    return src.split(/\r?\n/).filter(l => l.trim()).map(l => JSON.parse(l));
  }

  private jsonToJSONL(src: string): string {
    const data = JSON.parse(src);
    const items = Array.isArray(data) ? data : [data];
    return items.map((item: any) => JSON.stringify(item)).join('\n');
  }

  private parseProto(src: string): any {
    const clean = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    const syntaxM = clean.match(/syntax\s*=\s*"([^"]+)"/);
    const pkgM = clean.match(/package\s+([\w.]+)\s*;/);
    const messages: any[] = [];
    const msgRe = /message\s+(\w+)\s*\{([^{}]*)\}/g;
    let m;
    while ((m = msgRe.exec(clean)) !== null) {
      const fields: any[] = [];
      const fieldRe = /(optional|required|repeated)?\s*([\w.]+)\s+(\w+)\s*=\s*(\d+)\s*;/g;
      let f;
      while ((f = fieldRe.exec(m[2])) !== null) {
        fields.push({ label: f[1] || 'optional', type: f[2], name: f[3], fieldNumber: +f[4] });
      }
      messages.push({ name: m[1], fields });
    }
    const enums: any[] = [];
    const enumRe = /enum\s+(\w+)\s*\{([^{}]*)\}/g;
    let e;
    while ((e = enumRe.exec(clean)) !== null) {
      const vals: any[] = [];
      const valRe = /(\w+)\s*=\s*(\d+)\s*;/g;
      let ev;
      while ((ev = valRe.exec(e[2])) !== null) vals.push({ name: ev[1], number: +ev[2] });
      enums.push({ name: e[1], values: vals });
    }
    return { syntax: syntaxM?.[1] ?? 'proto3', package: pkgM?.[1] ?? '', messageCount: messages.length, messages, enumCount: enums.length, enums };
  }

  private parseGraphQL(src: string): any {
    const clean = src.replace(/#[^\n]*/g, '');
    const schemaM = clean.match(/schema\s*\{([^}]*)\}/);
    const rootTypes: any = {};
    if (schemaM) {
      [...schemaM[1].matchAll(/(query|mutation|subscription)\s*:\s*(\w+)/g)].forEach(m => rootTypes[m[1]] = m[2]);
    }
    const types: any[] = [];
    const typeRe = /(type|input|interface|union|enum|scalar)\s+(\w+)(?:\s+implements\s+([\w &]+))?\s*\{?([^}]*)\}?/g;
    let t;
    while ((t = typeRe.exec(clean)) !== null) {
      const kind = t[1];
      const name = t[2];
      const impl = t[3]?.split('&').map((s: string) => s.trim()).filter(Boolean) ?? [];
      const fields: any[] = [];
      const fieldRe = /(\w+)\s*(?:\([^)]*\))?\s*:\s*([\w!\[\]]+)/g;
      let f;
      while ((f = fieldRe.exec(t[4])) !== null) fields.push({ name: f[1], type: f[2] });
      types.push({ kind, name, implements: impl, fields });
    }
    return { rootTypes, typeCount: types.length, types };
  }
}
