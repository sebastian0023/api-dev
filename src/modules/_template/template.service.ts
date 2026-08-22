import { randomUUID } from "node:crypto";
import type { TemplateRepository } from "./template.repository.js";
import type { EventBus } from "../../core/eventBus.js";
import { notFound } from "../../shared/http/errors.js";

export function createTemplateService(deps: { repo: TemplateRepository; eventBus: EventBus }) {
  const { repo, eventBus } = deps;

  function create(name: string) {
    const row = repo.create({ id: randomUUID(), name, createdAt: new Date() });
    // Cross-module communication happens over the event bus or an
    // explicitly published *.public.ts surface — never another module's
    // repository.ts / service.ts directly.
    eventBus.emit("template.item.created", { id: row.id });
    return row;
  }

  function getById(id: string) {
    const row = repo.findById(id);
    if (!row) throw notFound("Template item not found");
    return row;
  }

  function list() {
    return repo.list();
  }

  return { create, getById, list };
}

export type TemplateService = ReturnType<typeof createTemplateService>;
