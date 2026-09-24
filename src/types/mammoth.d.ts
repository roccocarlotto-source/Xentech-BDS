// mammoth no publica tipos propios ni hay @types/mammoth en npm -- ambient
// mínimo con lo único que usa este repo (extraerTextoDocx en
// presupuestoImport.service.ts).
declare module "mammoth" {
  export interface ExtractRawTextResult {
    value: string;
    messages: unknown[];
  }

  export function extractRawText(input: { buffer: Buffer }): Promise<ExtractRawTextResult>;
}
