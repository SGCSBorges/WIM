/**
 * Passkey (WebAuthn) routes, mounted under /api/auth alongside the password
 * flow. Free-standing standard — no external service, no API key.
 *
 * Challenge handling mirrors the TOTP challenge-token pattern: the server
 * signs the challenge into a short-lived JWT (`kind` discriminates reg vs
 * auth so tokens can't cross flows) that the client returns with the
 * authenticator's response — no server-side session state needed.
 *
 * A successful passkey assertion IS phishing-resistant multi-factor proof
 * (possession + on-device user verification), so passkey login mints a full
 * session even for TOTP-enabled accounts — the same stance the platform
 * vendors take.
 *
 * Enumeration safety: /login/options answers with valid-looking options
 * (empty allowCredentials + a decoy challenge token) for unknown emails, and
 * /login/verify fails with the same 401 for every failure mode.
 */
import { Router, Request, Response } from "express";
import { z } from "zod";
import jwt from "jsonwebtoken";
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
  type RegistrationResponseJSON,
  type AuthenticationResponseJSON,
  type AuthenticatorTransportFuture,
} from "@simplewebauthn/server";
import { prisma } from "../../libs/prisma";
import { asyncHandler } from "../common/http";
import { auditAction } from "../common/audit";
import { authGuard, AuthRequest } from "./auth.middleware";
import { signTokenWithJti } from "./auth.service";
import { SessionService } from "./session.service";
import { cookieOptsFor } from "./cookies";
import { normalizedEmail, idParam } from "../common/schemas";
import { createHttpError } from "../../utils/http-error";

const router = Router();

const RP_NAME = "WIM";
const CHALLENGE_TTL = "5m";

// Relying-party identity. APP_URL is authoritative in production (single
// origin, validated at deploy); the request Origin header covers local dev.
function relyingParty(req: Request): { rpID: string; origin: string } {
  const raw = process.env.APP_URL?.replace(/\/$/, "") || req.get("origin");
  if (!raw) throw createHttpError(500, "Relying party origin not configured");
  const url = new URL(raw);
  return { rpID: url.hostname, origin: url.origin };
}

type ChallengeKind = "webauthn-reg" | "webauthn-auth";

function signChallenge(
  kind: ChallengeKind,
  sub: number,
  challenge: string
): string {
  return jwt.sign({ sub, kind, chal: challenge }, process.env.JWT_SECRET!, {
    expiresIn: CHALLENGE_TTL,
  });
}

function verifyChallenge(
  token: string,
  kind: ChallengeKind
): { sub: number; challenge: string } {
  const payload = jwt.verify(token, process.env.JWT_SECRET!) as unknown as {
    sub: number;
    kind: string;
    chal: string;
  };
  if (payload.kind !== kind)
    throw createHttpError(401, "Invalid challenge token");
  return { sub: payload.sub, challenge: payload.chal };
}

function parseTransports(
  csv: string | null
): AuthenticatorTransportFuture[] | undefined {
  if (!csv) return undefined;
  return csv.split(",").filter(Boolean) as AuthenticatorTransportFuture[];
}

// POST /api/auth/webauthn/register/options — begin enrolling a passkey.
router.post(
  "/webauthn/register/options",
  authGuard,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const user = await prisma.user.findUnique({
      where: { userId: req.user!.sub },
      select: { userId: true, email: true },
    });
    if (!user) throw createHttpError(404, "User not found");
    const existing = await prisma.webAuthnCredential.findMany({
      where: { userId: user.userId },
      select: { credentialId: true, transports: true },
    });

    const { rpID } = relyingParty(req);
    const options = await generateRegistrationOptions({
      rpName: RP_NAME,
      rpID,
      userName: user.email,
      attestationType: "none",
      excludeCredentials: existing.map((c) => ({
        id: c.credentialId,
        transports: parseTransports(c.transports),
      })),
      authenticatorSelection: {
        residentKey: "preferred",
        userVerification: "preferred",
      },
    });

    res.json({
      options,
      challengeToken: signChallenge(
        "webauthn-reg",
        user.userId,
        options.challenge
      ),
    });
  })
);

const RegisterVerifySchema = z.object({
  challengeToken: z.string().min(1),
  deviceLabel: z.string().trim().max(120).optional().nullable(),
  // Verified structurally by @simplewebauthn — pass through opaquely.
  response: z.unknown(),
});

// POST /api/auth/webauthn/register/verify — finish enrolling.
router.post(
  "/webauthn/register/verify",
  authGuard,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const body = RegisterVerifySchema.parse(req.body);
    let claim;
    try {
      claim = verifyChallenge(body.challengeToken, "webauthn-reg");
    } catch {
      return res.status(401).json({ error: "Invalid or expired challenge" });
    }
    if (claim.sub !== req.user!.sub)
      return res.status(401).json({ error: "Invalid or expired challenge" });

    const { rpID, origin } = relyingParty(req);
    const verification = await verifyRegistrationResponse({
      response: body.response as RegistrationResponseJSON,
      expectedChallenge: claim.challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
    }).catch(() => null);
    if (!verification?.verified || !verification.registrationInfo)
      return res.status(400).json({ error: "Passkey verification failed" });

    const cred = verification.registrationInfo.credential;
    const created = await prisma.webAuthnCredential.create({
      data: {
        userId: req.user!.sub,
        credentialId: cred.id,
        publicKey: Buffer.from(cred.publicKey),
        counter: cred.counter,
        transports: cred.transports?.join(",") ?? null,
        deviceLabel: body.deviceLabel?.trim() || null,
      },
      select: { id: true, deviceLabel: true, createdAt: true },
    });
    await auditAction(req, {
      action: "UPDATE",
      entity: "User",
      entityId: req.user!.sub,
      metadata: { passkeyRegistered: created.id },
    });
    res.status(201).json(created);
  })
);

// POST /api/auth/webauthn/login/options — begin a passkey sign-in.
router.post(
  "/webauthn/login/options",
  asyncHandler(async (req: Request, res: Response) => {
    const { email } = z.object({ email: normalizedEmail }).parse(req.body);
    const user = await prisma.user.findUnique({
      where: { email },
      select: { userId: true },
    });
    const credentials = user
      ? await prisma.webAuthnCredential.findMany({
          where: { userId: user.userId },
          select: { credentialId: true, transports: true },
        })
      : [];

    const { rpID } = relyingParty(req);
    const options = await generateAuthenticationOptions({
      rpID,
      userVerification: "preferred",
      allowCredentials: credentials.map((c) => ({
        id: c.credentialId,
        transports: parseTransports(c.transports),
      })),
    });

    // Unknown email → decoy sub 0; verify rejects it with the same 401 as
    // any other failure, so the endpoint never confirms account existence.
    res.json({
      options,
      challengeToken: signChallenge(
        "webauthn-auth",
        user?.userId ?? 0,
        options.challenge
      ),
    });
  })
);

const LoginVerifySchema = z.object({
  challengeToken: z.string().min(1),
  response: z.unknown(),
});

// POST /api/auth/webauthn/login/verify — finish a passkey sign-in.
router.post(
  "/webauthn/login/verify",
  asyncHandler(async (req: Request, res: Response) => {
    const body = LoginVerifySchema.parse(req.body);
    const fail = () =>
      res.status(401).json({ error: "Passkey sign-in failed" });

    let claim;
    try {
      claim = verifyChallenge(body.challengeToken, "webauthn-auth");
    } catch {
      return fail();
    }
    if (!claim.sub) return fail();

    const response = body.response as AuthenticationResponseJSON;
    const row = await prisma.webAuthnCredential.findFirst({
      where: { credentialId: response?.id ?? "", userId: claim.sub },
    });
    if (!row) return fail();

    const { rpID, origin } = relyingParty(req);
    const verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge: claim.challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      credential: {
        id: row.credentialId,
        publicKey: new Uint8Array(row.publicKey),
        counter: row.counter,
        transports: parseTransports(row.transports),
      },
    }).catch(() => null);
    if (!verification?.verified) return fail();

    await prisma.webAuthnCredential.update({
      where: { id: row.id },
      data: {
        counter: verification.authenticationInfo.newCounter,
        lastUsedAt: new Date(),
      },
    });

    const user = await prisma.user.findUnique({
      where: { userId: claim.sub },
      select: { userId: true, email: true, role: true, tokenVersion: true },
    });
    if (!user) return fail();

    const { token, jti } = signTokenWithJti(
      user.userId,
      user.role,
      user.tokenVersion
    );
    void SessionService.create({
      userId: user.userId,
      jti,
      ip: req.ip ?? null,
      userAgent: req.get("user-agent") ?? null,
    }).catch(() => {});
    await auditAction(req, {
      userId: user.userId,
      action: "LOGIN",
      entity: "User",
      entityId: user.userId,
      metadata: { method: "passkey" },
    });
    res.cookie("wim_token", token, cookieOptsFor(req));
    res.json({
      user: { userId: user.userId, email: user.email, role: user.role },
    });
  })
);

// GET /api/auth/webauthn/credentials — the caller's registered passkeys.
router.get(
  "/webauthn/credentials",
  authGuard,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const items = await prisma.webAuthnCredential.findMany({
      where: { userId: req.user!.sub },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        deviceLabel: true,
        transports: true,
        createdAt: true,
        lastUsedAt: true,
      },
    });
    res.json({ items });
  })
);

// DELETE /api/auth/webauthn/credentials/:id — remove a passkey.
router.delete(
  "/webauthn/credentials/:id",
  authGuard,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const id = idParam.parse(req.params.id);
    const { count } = await prisma.webAuthnCredential.deleteMany({
      where: { id, userId: req.user!.sub },
    });
    if (count === 0) throw createHttpError(404, "Passkey not found");
    await auditAction(req, {
      action: "UPDATE",
      entity: "User",
      entityId: req.user!.sub,
      metadata: { passkeyDeleted: id },
    });
    res.status(204).end();
  })
);

export default router;
