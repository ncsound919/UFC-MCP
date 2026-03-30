import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { statSync } from 'fs';
import { dirname } from 'path';
import { ConversionState } from '../state/ConversionState.js';

export type MusicFormat = 'midi' | 'mid' | 'abc' | 'musicxml' | 'mxl' | 'json';

export interface MusicConvertOptions {
  inputPath: string;
  outputPath: string;
  inputFormat?: MusicFormat;
  outputFormat?: MusicFormat;
}

export class MusicProcessor {
  constructor(private state: ConversionState) {}

  private extToFormat(ext: string): MusicFormat {
    const map: Record<string, MusicFormat> = {
      mid: 'midi', midi: 'midi', abc: 'abc',
      musicxml: 'musicxml', mxl: 'mxl', json: 'json',
    };
    return map[ext.toLowerCase()] ?? 'json';
  }

  async convert(opts: MusicConvertOptions) {
    const { inputPath, outputPath, inputFormat, outputFormat } = opts;
    const inExt = inputPath.split('.').pop() ?? '';
    const outExt = outputPath.split('.').pop() ?? '';
    const inFmt = inputFormat ?? this.extToFormat(inExt);
    const outFmt = outputFormat ?? this.extToFormat(outExt);

    const record = this.state.createRecord(inputPath, outputPath, `music:${inFmt}->${outFmt}`);
    try {
      const isBinary = inFmt === 'midi' || inFmt === 'mid';
      const input = isBinary ? readFileSync(inputPath) : readFileSync(inputPath, 'utf8');
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

  private transform(input: Buffer | string, inFmt: MusicFormat, outFmt: MusicFormat): string {
    if (inFmt === 'midi' || inFmt === 'mid') {
      const parsed = this.parseMidi(input as Buffer);
      if (outFmt === 'json') return JSON.stringify(parsed, null, 2);
      throw new Error(`Unsupported MIDI output format: ${outFmt}`);
    }
    if (inFmt === 'abc') {
      const parsed = this.parseABC(input as string);
      if (outFmt === 'json') return JSON.stringify(parsed, null, 2);
      throw new Error(`Unsupported ABC output format: ${outFmt}`);
    }
    if (inFmt === 'musicxml' || inFmt === 'mxl') {
      const parsed = this.parseMusicXML(input as string);
      if (outFmt === 'json') return JSON.stringify(parsed, null, 2);
      throw new Error(`Unsupported MusicXML output format: ${outFmt}`);
    }
    throw new Error(`Unsupported conversion: ${inFmt} -> ${outFmt}`);
  }

  private readVarLen(buf: Buffer, offset: number): { value: number; bytesRead: number } {
    let value = 0;
    let bytesRead = 0;
    let byte: number;
    do {
      byte = buf[offset + bytesRead];
      value = (value << 7) | (byte & 0x7f);
      bytesRead++;
    } while (byte & 0x80);
    return { value, bytesRead };
  }

  private parseMidi(buf: Buffer) {
    if (buf.toString('ascii', 0, 4) !== 'MThd') throw new Error('Not a valid MIDI file');
    const format = buf.readUInt16BE(8);
    const numTracks = buf.readUInt16BE(10);
    const division = buf.readUInt16BE(12);
    const timecodeMode = !!(division & 0x8000);
    const tracks: any[] = [];
    let pos = 14;
    for (let t = 0; t < numTracks; t++) {
      if (pos >= buf.length) break;
      const chunkType = buf.toString('ascii', pos, pos + 4);
      const chunkLen = buf.readUInt32BE(pos + 4);
      pos += 8;
      if (chunkType !== 'MTrk') { pos += chunkLen; continue; }
      const end = pos + chunkLen;
      const events: any[] = [];
      let runningStatus = 0;
      while (pos < end) {
        const { value: delta, bytesRead: db } = this.readVarLen(buf, pos);
        pos += db;
        let statusByte = buf[pos];
        if (statusByte & 0x80) { runningStatus = statusByte; pos++; }
        else { statusByte = runningStatus; }
        if (statusByte === 0xff) {
          const metaType = buf[pos++];
          const { value: metaLen, bytesRead: mb } = this.readVarLen(buf, pos);
          pos += mb;
          const data = buf.slice(pos, pos + metaLen).toString('utf8');
          pos += metaLen;
          let metaName = 'unknown';
          if (metaType === 0x01) metaName = 'text';
          else if (metaType === 0x02) metaName = 'copyright';
          else if (metaType === 0x03) metaName = 'trackName';
          else if (metaType === 0x51) metaName = 'setTempo';
          else if (metaType === 0x2f) metaName = 'endOfTrack';
          events.push({ delta, type: 'meta', metaType: metaName, data });
        } else if ((statusByte & 0xf0) === 0xf0) {
          const { value: sysexLen, bytesRead: sb } = this.readVarLen(buf, pos);
          pos += sb + sysexLen;
          events.push({ delta, type: 'sysex' });
        } else {
          const eventType = (statusByte & 0xf0) >> 4;
          const channel = statusByte & 0x0f;
          let evName = 'unknown';
          let params: any = {};
          if (eventType === 0x9) { evName = 'noteOn'; params = { note: buf[pos++], velocity: buf[pos++] }; }
          else if (eventType === 0x8) { evName = 'noteOff'; params = { note: buf[pos++], velocity: buf[pos++] }; }
          else if (eventType === 0xa) { evName = 'aftertouch'; params = { note: buf[pos++], pressure: buf[pos++] }; }
          else if (eventType === 0xb) { evName = 'controlChange'; params = { controller: buf[pos++], value: buf[pos++] }; }
          else if (eventType === 0xc) { evName = 'programChange'; params = { program: buf[pos++] }; }
          else if (eventType === 0xd) { evName = 'channelPressure'; params = { pressure: buf[pos++] }; }
          else if (eventType === 0xe) { evName = 'pitchBend'; params = { lsb: buf[pos++], msb: buf[pos++] }; }
          else { pos += 1; }
          events.push({ delta, type: evName, channel, ...params });
        }
      }
      pos = end;
      tracks.push({ events, eventCount: events.length });
    }
    return { format, numTracks, timecodeMode, division: timecodeMode ? null : division, tracks };
  }

  private parseABC(src: string) {
    const lines = src.split(/\r?\n/);
    const headers: Record<string, string> = {};
    const bodyLines: string[] = [];
    let inBody = false;
    for (const line of lines) {
      if (!inBody) {
        const m = line.match(/^([A-Za-z]):\s*(.*)$/);
        if (m) {
          headers[m[1]] = m[2].trim();
          if (m[1] === 'K') inBody = true;
        }
      } else {
        bodyLines.push(line);
      }
    }
    return {
      title: headers['T'] ?? '',
      composer: headers['C'] ?? '',
      meter: headers['M'] ?? '',
      tempo: headers['Q'] ?? '',
      key: headers['K'] ?? '',
      referenceNumber: headers['X'] ?? '',
      notes: headers['N'] ?? '',
      source: headers['S'] ?? '',
      rawHeaders: headers,
      body: bodyLines.join('\n'),
    };
  }

  private parseMusicXML(src: string) {
    const getTag = (tag: string, text: string) => {
      const m = text.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\/${tag}>`, 'i'));
      return m ? m[1].trim() : '';
    };
    const getAllTags = (tag: string, text: string) => {
      const re = new RegExp(`<${tag}[^>]*>[\\s\\S]*?<\/${tag}>`, 'gi');
      return [...text.matchAll(re)].map(m => m[0]);
    };
    const title = getTag('movement-title', src) || getTag('work-title', src);
    const composer = getTag('creator', src);
    const parts = getAllTags('part', src).map((partXml, i) => {
      const measures = getAllTags('measure', partXml).map((mXml) => {
        const number = (mXml.match(/number="(\d+)"/) ?? [])[1] ?? String(i);
        const notes = getAllTags('note', mXml).map((nXml) => ({
          pitch: getTag('step', nXml) + getTag('octave', nXml),
          duration: getTag('duration', nXml),
          type: getTag('type', nXml),
          rest: /<rest/.test(nXml),
        }));
        return { number, beats: getTag('beats', mXml), beatType: getTag('beat-type', mXml), notes };
      });
      return { partId: i + 1, measureCount: measures.length, measures };
    });
    return { title, composer, partCount: parts.length, parts };
  }
}
