import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware, isAPIError } from "better-auth/api";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { twoFactor } from "better-auth/plugins/two-factor";
import { getDb } from "@/db/client";
import { clearFailures, lockedUntil, recordFailure } from "@/modules/identity/lockout";
import { authAccount, authRateLimit, authSession, authTwoFactor, authUser, authVerification } from "@/db/schema";

export const APP_NAME = "Plataforma Financiera";

function createAuth() {
  return betterAuth({
    appName: APP_NAME,
    database: drizzleAdapter(getDb(), {
      provider: "pg",
      schema: {
        user: authUser,
        session: authSession,
        account: authAccount,
        verification: authVerification,
        twoFactor: authTwoFactor,
        rateLimit: authRateLimit,
      },
    }),
    user: {
      additionalFields: {
        mustChangePassword: { type: "boolean", defaultValue: false, input: false },
      },
    },
    emailAndPassword: {
      enabled: true,
      // Sin registro público: los usuarios los da de alta un Administrador.
      disableSignUp: true,
      minPasswordLength: 12,
      maxPasswordLength: 128,
    },
    session: {
      expiresIn: 60 * 60 * 8, // jornada laboral
      updateAge: 60 * 30,
    },
    rateLimit: {
      enabled: true,
      storage: "database",
      window: 60,
      max: 100,
      customRules: {
        // 5 intentos de login cada 15 minutos
        "/sign-in/email": { window: 15 * 60, max: 5 },
        "/two-factor/verify-totp": { window: 15 * 60, max: 5 },
        "/two-factor/verify-backup-code": { window: 15 * 60, max: 5 },
      },
    },
    advanced: {
      useSecureCookies: process.env.NODE_ENV === "production",
      database: { generateId: () => crypto.randomUUID() },
    },
    hooks: {
      // Bloqueo por cuenta, además del límite por IP.
      before: createAuthMiddleware(async (ctx) => {
        if (ctx.path !== "/sign-in/email") return;
        const email = String(ctx.body?.email ?? "");
        if (email && (await lockedUntil(getDb(), email))) {
          throw new APIError("TOO_MANY_REQUESTS", {
            code: "ACCOUNT_LOCKED",
            message: "Cuenta bloqueada temporalmente por intentos fallidos",
          });
        }
      }),
      after: createAuthMiddleware(async (ctx) => {
        if (ctx.path !== "/sign-in/email") return;
        const email = String(ctx.body?.email ?? "");
        if (!email) return;
        const returned = ctx.context.returned;
        if (isAPIError(returned)) {
          if (returned.statusCode === 401) await recordFailure(getDb(), email);
        } else {
          await clearFailures(getDb(), email);
        }
      }),
    },
    plugins: [twoFactor({ issuer: APP_NAME }), nextCookies()],
  });
}

type Auth = ReturnType<typeof createAuth>;
let instance: Auth | undefined;

/** Instancia única, creada bajo demanda (no abre conexiones al importar). */
export function getAuth(): Auth {
  instance ??= createAuth();
  return instance;
}
