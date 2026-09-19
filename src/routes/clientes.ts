import { Router, type Request } from "express";
import { authenticate } from "../middlewares/authenticate";
import { asyncHandler } from "../utils/asyncHandler";
import { AppError } from "../utils/AppError";
import { createClienteSchema, updateClienteSchema } from "../schemas/cliente.schema";
import * as clienteService from "../services/cliente.service";

export const clientesRouter = Router();

clientesRouter.use(authenticate);

function requireOrganizationId(req: Request): string {
  const organizationId = req.auth?.organizationId;
  if (!organizationId) {
    throw new AppError("Este usuario no pertenece a ninguna organización", 403);
  }
  return organizationId;
}

clientesRouter.get(
  "/api/clientes",
  asyncHandler(async (req, res) => {
    const organizationId = requireOrganizationId(req);
    res.json(await clienteService.listClientes(organizationId));
  }),
);

clientesRouter.get(
  "/api/clientes/:id",
  asyncHandler(async (req, res) => {
    const organizationId = requireOrganizationId(req);
    res.json(await clienteService.getCliente(organizationId, req.params.id));
  }),
);

clientesRouter.post(
  "/api/clientes",
  asyncHandler(async (req, res) => {
    const organizationId = requireOrganizationId(req);
    const input = createClienteSchema.parse(req.body);
    res.status(201).json(await clienteService.createCliente(organizationId, input));
  }),
);

clientesRouter.patch(
  "/api/clientes/:id",
  asyncHandler(async (req, res) => {
    const organizationId = requireOrganizationId(req);
    const input = updateClienteSchema.parse(req.body);
    res.json(await clienteService.updateCliente(organizationId, req.params.id, input));
  }),
);

clientesRouter.delete(
  "/api/clientes/:id",
  asyncHandler(async (req, res) => {
    const organizationId = requireOrganizationId(req);
    await clienteService.deleteCliente(organizationId, req.params.id);
    res.status(204).send();
  }),
);
