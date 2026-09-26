// word-extractor no publica tipos propios -- ambient mínimo con lo único
// que usa este repo (extraerTextoDoc en presupuestoImport.service.ts), mismo
// criterio que mammoth.d.ts. @types/word-extractor existe pero es de un
// tercero y sigue otra versión; para un solo método no vale la dependencia.
declare module "word-extractor" {
  interface WordDocument {
    getBody(): string;
  }

  export default class WordExtractor {
    extract(source: string | Buffer): Promise<WordDocument>;
  }
}
