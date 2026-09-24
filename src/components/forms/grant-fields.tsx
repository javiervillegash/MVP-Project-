"use client";

import { useState } from "react";
import { Field, Select } from "@/components/ui/primitives";
import { ROLE_LABELS } from "@/modules/access/labels";
import { ROLES } from "@/modules/access/permissions";

export interface ScopeOption {
  id: string;
  name: string;
  entities: { id: string; name: string }[];
}

const ROLE_HELP: Record<string, string> = {
  org_admin: "Ve y gestiona todo: clientes, usuarios y precios.",
  gestor: "Lleva la operativa de sus clientes. 2FA obligatorio.",
  client_director: "Ve informes y sube documentos de su empresa.",
  client_member: "Sube facturas y documentos.",
  gestoria: "Ve lo que se le comparte y registra los modelos fiscales.",
};

/** Rol + ámbito (cliente completo o sociedad concreta). */
export function GrantFields({
  options,
  errors,
  defaultScope,
  defaultRole,
}: {
  options: ScopeOption[];
  errors?: Record<string, string>;
  defaultScope?: string;
  defaultRole?: string;
}) {
  const [role, setRole] = useState<string>(defaultRole ?? "gestor");
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Rol" htmlFor="role" error={errors?.role} hint={ROLE_HELP[role]}>
        <Select id="role" name="role" value={role} onChange={(e) => setRole(e.target.value)}>
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS[r]}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Acceso a" htmlFor="scope" error={errors?.scope}>
        <Select
          id="scope"
          name="scope"
          disabled={role === "org_admin"}
          defaultValue={defaultScope ?? ""}
          required={role !== "org_admin"}
        >
          {role === "org_admin" ? (
            <option value="">Toda la organización</option>
          ) : (
            <>
              <option value="" disabled>
                Elige un cliente o una sociedad…
              </option>
              {options.map((c) => (
                <optgroup key={c.id} label={c.name}>
                  <option value={`company:${c.id}`}>{c.name} · todas sus sociedades</option>
                  {c.entities.map((e) => (
                    <option key={e.id} value={`entity:${e.id}`}>
                      Solo {e.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </>
          )}
        </Select>
      </Field>
    </div>
  );
}
