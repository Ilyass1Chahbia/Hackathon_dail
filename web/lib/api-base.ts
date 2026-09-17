/**
 * Base URL of the deterministic FastAPI service.
 *
 * The deployed web project must set OCTOPUS_API_URL. The localhost default applies in
 * development only, so a misconfigured production deploy fails loudly instead of
 * silently calling a machine that is not there.
 */
export function apiBase(): string {
  const configured = process.env.OCTOPUS_API_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");
  if (process.env.NODE_ENV === "development") return "http://127.0.0.1:8000";
  return "";
}

/** Message shown when the base URL is missing in a non-development environment. */
export const API_BASE_MISSING =
  "OCTOPUS_API_URL is not configured. Set it to the deployed deterministic API URL " +
  "(for example https://<api-project>.vercel.app). Localhost is only a development default.";
