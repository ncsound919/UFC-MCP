import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { statSync } from 'fs';
import { dirname } from 'path';
import { ConversionState } from '../state/ConversionState.js';

export type LogisticsFormat = 'edi' | 'edifact' | 'gpx' | 'geojson' | 'json' | 'csv';

export interface LogisticsConvertOptions {
  inputPath: string;
  outputPath: string;
  inputFormat?: LogisticsFormat;
  outputFormat?: LogisticsFormat;
}

export class LogisticsProcessor {
  constructor(private state: ConversionState) {}

  private extToFormat(ext: string): LogisticsFormat {
    const map: Record<string, LogisticsFormat> = {
      edi: 'edi', x12: 'edi', edifact: 'edifact',
      gpx: 'gpx', geojson: 'geojson', json: 'json', csv: 'csv',
    };
    return map[ext.toLowerCase()] ?? 'json';
  }

  async convert(opts: LogisticsConvertOptions) {
    const { inputPath, outputPath, inputFormat, outputFormat } = opts;
    const inExt = inputPath.split('.').pop() ?? '';
    const outExt = outputPath.split('.').pop() ?? '';
    const inFmt = inputFormat ?? this.extToFormat(inExt);
    const outFmt = outputFormat ?? this.extToFormat(outExt);
    const record = this.state.createRecord(inputPath, outputPath, `logistics:${inFmt}->${outFmt}`);
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

  private transform(input: string, inFmt: LogisticsFormat, outFmt: LogisticsFormat): string {
    switch (`${inFmt}->${outFmt}`) {
      case 'edi->json': return JSON.stringify(this.parseEDI(input), null, 2);
      case 'edi->csv': return this.ediToCsv(input);
      case 'edifact->json': return JSON.stringify(this.parseEDIFACT(input), null, 2);
      case 'gpx->json': return JSON.stringify(this.parseGPX(input), null, 2);
      case 'gpx->geojson': return JSON.stringify(this.gpxToGeoJSON(input), null, 2);
      case 'geojson->gpx': return this.geojsonToGpx(input);
      case 'json->geojson': return JSON.stringify(this.jsonToGeoJSON(input), null, 2);
      default: throw new Error(`Unsupported logistics conversion: ${inFmt} -> ${outFmt}`);
    }
  }

  private parseEDI(src: string) {
    const lines = src.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const interchange: any = { segments: [], functionalGroups: [] };
    let currentGroup: any = null;
    let currentTransaction: any = null;
    for (const line of lines) {
      const parts = line.split('*');
      const segId = parts[0];
      if (segId === 'ISA') {
        interchange.senderId = parts[6]?.trim();
        interchange.receiverId = parts[8]?.trim();
        interchange.date = parts[9];
        interchange.controlNumber = parts[13];
      } else if (segId === 'GS') {
        currentGroup = { functionalId: parts[1], senderId: parts[2], receiverId: parts[3], date: parts[4], controlNumber: parts[6], transactions: [] };
        interchange.functionalGroups.push(currentGroup);
      } else if (segId === 'ST') {
        currentTransaction = { transactionSetId: parts[1], controlNumber: parts[2], segments: [] };
        currentGroup?.transactions.push(currentTransaction);
      } else if (segId === 'SE') {
        // close transaction
      } else if (segId === 'GE') {
        currentGroup = null;
      } else if (segId !== 'IEA') {
        currentTransaction?.segments.push({ id: segId, elements: parts.slice(1) });
      }
    }
    return interchange;
  }

  private ediToCsv(src: string): string {
    const data = this.parseEDI(src);
    const rows = ['groupIndex,transactionId,segmentId,elementIndex,value'];
    data.functionalGroups.forEach((g: any, gi: number) => {
      g.transactions.forEach((t: any) => {
        t.segments.forEach((s: any) => {
          s.elements.forEach((e: string, ei: number) => {
            rows.push(`${gi},${t.transactionSetId},${s.id},${ei},"${e.replace(/"/g, '""')}"`);
          });
        });
      });
    });
    return rows.join('\n');
  }

  private parseEDIFACT(src: string) {
    const segSep = "'";
    const elSep = '+';
    const compSep = ':';
    const segments = src.split(segSep).map(s => s.trim()).filter(Boolean);
    const interchange: any = { messages: [] };
    let currentMessage: any = null;
    for (const seg of segments) {
      const elements = seg.split(elSep).map(e => e.split(compSep));
      const segId = elements[0][0];
      if (segId === 'UNB') {
        interchange.syntaxVersion = elements[1]?.[1];
        interchange.sender = elements[2]?.[0];
        interchange.recipient = elements[3]?.[0];
        interchange.date = elements[4]?.[0];
      } else if (segId === 'UNH') {
        currentMessage = { referenceNumber: elements[1]?.[0], messageType: elements[2]?.[0], version: elements[2]?.[1], release: elements[2]?.[2], segments: [] };
        interchange.messages.push(currentMessage);
      } else if (segId === 'UNT') {
        currentMessage = null;
      } else if (segId !== 'UNZ') {
        currentMessage?.segments.push({ id: segId, elements: elements.slice(1) });
      }
    }
    return interchange;
  }

  private getXmlAttr(attr: string, xml: string): string {
    const m = xml.match(new RegExp(`${attr}="([^"]+)"`, 'i'));
    return m ? m[1] : '';
  }

  private getXmlTag(tag: string, xml: string): string {
    const m = xml.match(new RegExp(`<${tag}[^>]*>([^<]*)<\/${tag}>`, 'i'));
    return m ? m[1].trim() : '';
  }

  private parseGPX(src: string) {
    const name = this.getXmlTag('name', src);
    const desc = this.getXmlTag('desc', src);
    const author = this.getXmlTag('author', src);
    const wptRe = /<wpt([^>]*)>([\s\S]*?)<\/wpt>/gi;
    const waypoints = [...src.matchAll(wptRe)].map(m => ({
      lat: parseFloat(this.getXmlAttr('lat', m[1])),
      lon: parseFloat(this.getXmlAttr('lon', m[1])),
      name: this.getXmlTag('name', m[2]),
      ele: parseFloat(this.getXmlTag('ele', m[2])) || null,
      time: this.getXmlTag('time', m[2]),
    }));
    const trkptRe = /<trkpt([^>]*)>([\s\S]*?)<\/trkpt>/gi;
    const trackPoints = [...src.matchAll(trkptRe)].map(m => ({
      lat: parseFloat(this.getXmlAttr('lat', m[1])),
      lon: parseFloat(this.getXmlAttr('lon', m[1])),
      ele: parseFloat(this.getXmlTag('ele', m[2])) || null,
      time: this.getXmlTag('time', m[2]),
    }));
    return { name, desc, author, waypointCount: waypoints.length, trackPointCount: trackPoints.length, waypoints, trackPoints };
  }

  private gpxToGeoJSON(src: string) {
    const data = this.parseGPX(src);
    const features: any[] = [];
    for (const wp of data.waypoints) {
      features.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [wp.lon, wp.lat, wp.ele].filter(v => v !== null) }, properties: { name: wp.name, time: wp.time, type: 'waypoint' } });
    }
    if (data.trackPoints.length) {
      features.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: data.trackPoints.map(tp => [tp.lon, tp.lat, tp.ele].filter(v => v !== null)) }, properties: { name: data.name, type: 'track' } });
    }
    return { type: 'FeatureCollection', features };
  }

  private geojsonToGpx(src: string): string {
    const geojson = JSON.parse(src);
    const features = geojson.type === 'FeatureCollection' ? geojson.features : [geojson];
    const wptXml: string[] = [];
    const trkptXml: string[] = [];
    for (const f of features) {
      const props = f.properties ?? {};
      if (f.geometry?.type === 'Point') {
        const [lon, lat, ele] = f.geometry.coordinates;
        wptXml.push(`  <wpt lat="${lat}" lon="${lon}">${ele != null ? `<ele>${ele}</ele>` : ''}${props.name ? `<name>${props.name}</name>` : ''}</wpt>`);
      } else if (f.geometry?.type === 'LineString') {
        for (const [lon, lat, ele] of f.geometry.coordinates) {
          trkptXml.push(`      <trkpt lat="${lat}" lon="${lon}">${ele != null ? `<ele>${ele}</ele>` : ''}</trkpt>`);
        }
      }
    }
    return `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="UFC-MCP">\n${wptXml.join('\n')}\n  <trk><trkseg>\n${trkptXml.join('\n')}\n  </trkseg></trk>\n</gpx>`;
  }

  private jsonToGeoJSON(src: string) {
    const data = JSON.parse(src);
    const items = Array.isArray(data) ? data : [data];
    const features = items.map((item: any) => {
      const lat = item.lat ?? item.latitude ?? item.y;
      const lon = item.lon ?? item.lng ?? item.longitude ?? item.x;
      const { lat: _a, latitude: _b, y: _c, lon: _d, lng: _e, longitude: _f, x: _g, ...rest } = item;
      return { type: 'Feature', geometry: { type: 'Point', coordinates: [lon, lat] }, properties: rest };
    });
    return { type: 'FeatureCollection', features };
  }
}
