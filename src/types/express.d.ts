// Aumenta el tipo de Request de Express con rawBody -- lo agrega el
// `verify` callback de express.json() en app.ts, necesario para validar
// la firma X-Hub-Signature-256 del webhook de WhatsApp (HMAC sobre los
// bytes crudos del body, no sobre el JSON ya parseado).
import "express";

declare module "express-serve-static-core" {
  interface Request {
    rawBody?: Buffer;
  }
}
