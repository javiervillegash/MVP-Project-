/** Traduce los errores de Better Auth a mensajes claros en español. */
export function authErrorMessage(error: { status?: number; code?: string; message?: string }): string {
  if (error.code === "ACCOUNT_LOCKED")
    return "Esta cuenta está bloqueada 15 minutos por varios intentos fallidos. Si no has sido tú, avisa a tu gestor.";
  if (error.status === 429) return "Demasiados intentos. Espera 15 minutos antes de volver a probar.";
  switch (error.code) {
    case "INVALID_EMAIL_OR_PASSWORD":
      return "Email o contraseña incorrectos.";
    case "INVALID_PASSWORD":
      return "La contraseña no es correcta.";
    case "INVALID_CODE":
    case "INVALID_TWO_FACTOR_CODE":
      return "El código no es válido o ha caducado.";
    case "INVALID_BACKUP_CODE":
      return "El código de recuperación no es válido.";
    default:
      return "No se ha podido completar la operación. Inténtalo de nuevo.";
  }
}
