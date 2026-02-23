export interface ConversionRecord {
  id: string;
  type: "audio" | "video" | "image" | "document";
  inputPath: string;
  outputPath: string;
  status: "processing" | "success" | "error";
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
  inputSize?: number;
  outputSize?: number;
  error?: string;
  options?: Record<string, any>;
}

export class ConversionState {
  private history: ConversionRecord[] = [];
  private activeCount = 0;
  private totalSuccess = 0;
  private totalError = 0;

  createRecord(
    type: ConversionRecord["type"],
    inputPath: string,
    outputPath: string,
    options?: Record<string, any>
  ): ConversionRecord {
    const record: ConversionRecord = {
      id: `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      type,
      inputPath,
      outputPath,
      status: "processing",
      startedAt: new Date().toISOString(),
      options,
    };
    this.history.unshift(record);
    this.activeCount++;
    return record;
  }

  completeRecord(
    record: ConversionRecord,
    success: boolean,
    details?: { inputSize?: number; outputSize?: number; error?: string }
  ) {
    record.completedAt = new Date().toISOString();
    record.durationMs = Date.now() - new Date(record.startedAt).getTime();
    record.status = success ? "success" : "error";
    if (details?.inputSize) record.inputSize = details.inputSize;
    if (details?.outputSize) record.outputSize = details.outputSize;
    if (details?.error) record.error = details.error;
    this.activeCount = Math.max(0, this.activeCount - 1);
    success ? this.totalSuccess++ : this.totalError++;
  }

  getHistory(limit = 20, statusFilter = "all"): ConversionRecord[] {
    let records = this.history;
    if (statusFilter !== "all") {
      records = records.filter((r) => r.status === statusFilter);
    }
    return records.slice(0, limit);
  }

  getStatus() {
    return {
      active: this.activeCount,
      totalSuccess: this.totalSuccess,
      totalError: this.totalError,
      totalProcessed: this.totalSuccess + this.totalError,
      recentConversions: this.history.slice(0, 5),
    };
  }
}
