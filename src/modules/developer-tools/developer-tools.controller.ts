import type { RequestHandler } from "express";
import type { Base64Service } from "./application/base64.service.js";
import type { HashService } from "./application/hash.service.js";
import type { JwtService } from "./application/jwt.service.js";
import type { UuidService } from "./application/uuid.service.js";
import type { Base64Body, DecodeJwtBody, GenerateUuidBody, HashBody } from "./developer-tools.schemas.js";

export function createDeveloperToolsController(deps: {
  uuidService: UuidService;
  hashService: HashService;
  base64Service: Base64Service;
  jwtService: JwtService;
}) {
  const { uuidService, hashService, base64Service, jwtService } = deps;

  const uuid: RequestHandler = (req, res) => {
    res.ok(uuidService.generate(req.validated.body as GenerateUuidBody));
  };

  const hash: RequestHandler = async (req, res) => {
    res.ok(await hashService.hash(req.validated.body as HashBody));
  };

  const base64Encode: RequestHandler = (req, res) => {
    res.ok(base64Service.encode((req.validated.body as Base64Body).value));
  };

  const base64Decode: RequestHandler = (req, res) => {
    res.ok(base64Service.decode((req.validated.body as Base64Body).value));
  };

  const jwtDecode: RequestHandler = (req, res) => {
    res.ok(jwtService.decode((req.validated.body as DecodeJwtBody).token));
  };

  return { uuid, hash, base64Encode, base64Decode, jwtDecode };
}

export type DeveloperToolsController = ReturnType<typeof createDeveloperToolsController>;
