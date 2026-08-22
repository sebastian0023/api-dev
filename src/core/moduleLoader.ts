import { readdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { Express } from "express";
import { z } from "zod";
import { db } from "./db.js";
import { redis } from "./redis.js";
import { eventBus } from "./eventBus.js";
import { ManifestSchema, ModuleLoadError, type ModuleManifest, type Logger } from "./moduleContract.js";
import { moduleAuthGuard } from "./middleware/auth.js";

const MODULES_DIR = path.join(import.meta.dirname, "..", "modules");

const logger: Logger = {
  info: (msg, meta) => console.log(`[module] ${msg}`, meta ?? ""),
  warn: (msg, meta) => console.warn(`[module] ${msg}`, meta ?? ""),
  error: (msg, meta) => console.error(`[module] ${msg}`, meta ?? ""),
};

async function discoverModuleDirs(): Promise<string[]> {
  const entries = await readdir(MODULES_DIR, { withFileTypes: true });
  return entries
    .filter((e) => e.isDirectory() && !e.name.startsWith("_"))
    .map((e) => e.name)
    .sort();
}

async function loadManifest(dirName: string): Promise<ModuleManifest> {
  const dirPath = path.join(MODULES_DIR, dirName);
  const files = (await readdir(dirPath)).sort();
  const manifestFile = files.find((f) => /\.module\.(ts|js)$/.test(f));

  if (!manifestFile) {
    throw new ModuleLoadError(
      `Module directory "${dirName}" has no *.module.ts file. Every module under src/modules/ must ` +
        `export a manifest from <name>.module.ts (see src/modules/_template).`,
    );
  }

  const modulePath = path.join(dirPath, manifestFile);
  let imported: { default?: unknown };
  try {
    imported = (await import(pathToFileURL(modulePath).href)) as { default?: unknown };
  } catch (err) {
    throw new ModuleLoadError(
      `Failed to import module "${dirName}" from ${manifestFile}: ` +
        `${err instanceof Error ? err.message : String(err)}`,
    );
  }

  if (imported.default === undefined) {
    throw new ModuleLoadError(
      `Module "${dirName}" (${manifestFile}) has no default export. Expected: ` +
        `export default { name, version, basePath, routes, requiresAuth, dependencies, onInit }.`,
    );
  }

  const result = ManifestSchema.safeParse(imported.default);
  if (!result.success) {
    throw new ModuleLoadError(
      `Module "${dirName}" (${manifestFile}) has a malformed manifest:\n${z.prettifyError(result.error)}`,
    );
  }

  if (result.data.name !== dirName) {
    logger.warn(
      `Module directory "${dirName}" exports a manifest with name "${result.data.name}" — ` +
        `these should normally match.`,
    );
  }

  return result.data as ModuleManifest;
}

function assertNoDuplicateNames(manifests: ModuleManifest[]): void {
  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const m of manifests) {
    if (seen.has(m.name)) dupes.add(m.name);
    seen.add(m.name);
  }
  if (dupes.size > 0) {
    throw new ModuleLoadError(`Duplicate module name(s): ${[...dupes].join(", ")}.`);
  }
}

function assertNoDuplicateBasePaths(manifests: ModuleManifest[]): void {
  const byBasePath = new Map<string, string>();
  for (const m of manifests) {
    const existing = byBasePath.get(m.basePath);
    if (existing) {
      throw new ModuleLoadError(
        `Modules "${existing}" and "${m.name}" both declare basePath "${m.basePath}". ` +
          `Each module's basePath must be unique.`,
      );
    }
    byBasePath.set(m.basePath, m.name);
  }
}

function assertDependenciesExist(manifests: ModuleManifest[], byName: Map<string, ModuleManifest>): void {
  const loadedNames = manifests.map((m) => m.name).join(", ") || "(none)";
  for (const m of manifests) {
    for (const dep of m.dependencies) {
      if (!byName.has(dep)) {
        throw new ModuleLoadError(
          `Module "${m.name}" depends on "${dep}", which was not found. Loaded modules: ${loadedNames}.`,
        );
      }
    }
  }
}

/** Kahn's algorithm — deterministic (alphabetical tie-breaking) topological sort by `dependencies`. */
function topologicalSort(manifests: ModuleManifest[]): ModuleManifest[] {
  const byName = new Map(manifests.map((m) => [m.name, m]));

  assertNoDuplicateNames(manifests);
  assertNoDuplicateBasePaths(manifests);
  assertDependenciesExist(manifests, byName);

  const inDegree = new Map<string, number>();
  const dependents = new Map<string, string[]>();
  for (const m of manifests) {
    inDegree.set(m.name, m.dependencies.length);
  }
  for (const m of manifests) {
    for (const dep of m.dependencies) {
      const list = dependents.get(dep) ?? [];
      list.push(m.name);
      dependents.set(dep, list);
    }
  }

  const queue = manifests
    .filter((m) => inDegree.get(m.name) === 0)
    .map((m) => m.name)
    .sort();
  const ordered: string[] = [];

  while (queue.length > 0) {
    const name = queue.shift();
    if (name === undefined) break;
    ordered.push(name);
    for (const dependent of dependents.get(name) ?? []) {
      const remaining = (inDegree.get(dependent) ?? 0) - 1;
      inDegree.set(dependent, remaining);
      if (remaining === 0) queue.push(dependent);
    }
    queue.sort();
  }

  if (ordered.length !== manifests.length) {
    const stuck = manifests.map((m) => m.name).filter((n) => !ordered.includes(n));
    throw new ModuleLoadError(
      `Circular dependency detected among module(s): ${stuck.join(", ")}. Check their "dependencies" arrays.`,
    );
  }

  return ordered.map((name) => {
    const m = byName.get(name);
    if (!m) throw new ModuleLoadError(`Internal error: module "${name}" vanished during sort.`);
    return m;
  });
}

/**
 * Discovers every folder under src/modules (ignoring `_`-prefixed ones like
 * _template), validates + topologically sorts their manifests, runs onInit
 * for each in dependency order, then mounts each router at its basePath.
 * Every failure mode throws a ModuleLoadError with a specific, actionable
 * message — this function is meant to fail loudly at boot, not degrade.
 */
export async function loadModules(app: Express): Promise<ModuleManifest[]> {
  const dirNames = await discoverModuleDirs();
  if (dirNames.length === 0) {
    throw new ModuleLoadError(`No modules found under ${MODULES_DIR}.`);
  }

  const manifests = await Promise.all(dirNames.map((dir) => loadManifest(dir)));
  const ordered = topologicalSort(manifests);

  logger.info(`Module load order: ${ordered.map((m) => m.name).join(" → ")}`);

  for (const module of ordered) {
    try {
      await module.onInit({ db, eventBus, redis, logger });
    } catch (err) {
      throw new ModuleLoadError(
        `Module "${module.name}" threw during onInit: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    logger.info(`Initialized "${module.name}" v${module.version}`);
  }

  for (const module of ordered) {
    app.use(module.basePath, moduleAuthGuard(module), module.routes);
    logger.info(`Mounted "${module.name}" at ${module.basePath} (requiresAuth=${module.requiresAuth})`);
  }

  return ordered;
}
