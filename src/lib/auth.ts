import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { twoFactor } from "better-auth/plugins/two-factor";
import { getDb } from "@/db/client";
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
