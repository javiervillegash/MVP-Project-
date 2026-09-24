"use client";

import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import { useState, type FormEvent } from "react";
import { Alert, Button, Input, Label } from "@/components/ui/primitives";
import { authClient } from "@/lib/auth-client";
import { authErrorMessage } from "@/lib/auth-errors";

type Step =
  | { kind: "password" }
  | { kind: "scan"; qr: string; secretUri: string; backupCodes: string[] }
  | { kind: "done"; backupCodes: string[] };

export function EnableTwoFactor() {
  const router = useRouter();
  const [step, setStep] = useState<Step>({ kind: "password" });
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onPassword(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const password = String(new FormData(e.currentTarget).get("password"));
    const { data, error } = await authClient.twoFactor.enable({ password });
    setPending(false);
    if (error || !data || data.method !== "totp") return setError(authErrorMessage(error ?? {}));
    const qr = await QRCode.toDataURL(data.totpURI, { margin: 1, width: 200 });
    setStep({ kind: "scan", qr, secretUri: data.totpURI, backupCodes: data.backupCodes });
  }

  async function onCode(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (step.kind !== "scan") return;
    setError(null);
    setPending(true);
    const code = String(new FormData(e.currentTarget).get("code")).trim();
    const { error } = await authClient.twoFactor.verifyTotp({ code });
    setPending(false);
    if (error) return setError(authErrorMessage(error));
    setStep({ kind: "done", backupCodes: step.backupCodes });
  }

  if (step.kind === "password") {
    return (
      <form onSubmit={onPassword} className="space-y-4">
        <div>
          <Label htmlFor="password">Confirma tu contraseña</Label>
          <Input id="password" name="password" type="password" autoComplete="current-password" required />
        </div>
        {error && <Alert>{error}</Alert>}
        <Button type="submit" className="w-full" disabled={pending}>
          Continuar
        </Button>
      </form>
    );
  }

  if (step.kind === "scan") {
    const secret = new URL(step.secretUri).searchParams.get("secret") ?? "";
    return (
      <form onSubmit={onCode} className="space-y-4">
        <p className="text-sm">1. Escanea este código con Google Authenticator, Microsoft Authenticator o similar.</p>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={step.qr}
          alt="Código QR para la app de autenticación"
          width={200}
          height={200}
          className="mx-auto rounded bg-white p-2"
        />
        <p className="text-xs text-muted">
          ¿No puedes escanearlo? Introduce esta clave a mano: <code className="num break-all">{secret}</code>
        </p>
        <div>
          <Label htmlFor="code">2. Escribe el código de 6 dígitos que muestra la app</Label>
          <Input
            id="code"
            name="code"
            inputMode="numeric"
            pattern="[0-9]{6}"
            autoComplete="one-time-code"
            required
            className="num tracking-widest"
          />
        </div>
        {error && <Alert>{error}</Alert>}
        <Button type="submit" className="w-full" disabled={pending}>
          Activar
        </Button>
      </form>
    );
  }

  return (
    <div className="space-y-4">
      <Alert tone="success">Verificación en dos pasos activada.</Alert>
      <p className="text-sm">
        Guarda estos códigos de recuperación en un lugar seguro. Cada uno sirve una vez si pierdes el móvil. No se
        volverán a mostrar.
      </p>
      <ul className="num grid grid-cols-2 gap-1 rounded-md bg-surface-muted p-3 font-mono text-sm">
        {step.backupCodes.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>
      <Button
        className="w-full"
        onClick={() => {
          router.replace("/");
          router.refresh();
        }}
      >
        He guardado los códigos, ir al inicio
      </Button>
    </div>
  );
}
