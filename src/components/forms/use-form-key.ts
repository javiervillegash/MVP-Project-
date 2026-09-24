"use client";

import { useState } from "react";

/**
 * Devuelve un número que cambia con cada respuesta del servidor. Usado como
 * `key` del <form>, lo vuelve a montar con los valores enviados: así los
 * desplegables tampoco pierden lo elegido tras un error (React 19 reinicia
 * los formularios después de cada envío).
 */
export function useFormKey(state: object): number {
  const [prev, setPrev] = useState(state);
  const [key, setKey] = useState(0);
  if (prev !== state) {
    setPrev(state);
    setKey(key + 1);
  }
  return key;
}
