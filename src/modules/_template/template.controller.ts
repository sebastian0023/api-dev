import type { RequestHandler } from "express";
import type { TemplateService } from "./template.service.js";
import type { CreateTemplateBody, IdParam } from "./template.schemas.js";

function toResource(row: { id: string; name: string; createdAt: Date }) {
  return { id: row.id, name: row.name, createdAt: row.createdAt.toISOString() };
}

export function createTemplateController(service: TemplateService) {
  const create: RequestHandler = async (req, res) => {
    const body = req.validated.body as CreateTemplateBody;
    res.ok(toResource(service.create(body.name)), 201);
  };

  const getById: RequestHandler = async (req, res) => {
    const params = req.validated.params as IdParam;
    res.ok(toResource(service.getById(params.id)));
  };

  const list: RequestHandler = async (_req, res) => {
    res.ok(service.list().map(toResource));
  };

  return { create, getById, list };
}

export type TemplateController = ReturnType<typeof createTemplateController>;
