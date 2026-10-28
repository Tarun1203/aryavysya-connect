import "server-only";

/**
 * Who runs the site and who answers grievances, for the legal pages. These come from the
 * environment (Render → Environment) so they can be filled in by the organisation without a code
 * change; until they are set, the pages say so rather than showing invented details.
 */
export const LEGAL_VERSION = "2026-10-28";

export function legalContacts() {
  const v = (k: string) => process.env[k]?.trim() || null;
  return {
    orgName: v("LEGAL_ORG_NAME"),
    orgAddress: v("LEGAL_ORG_ADDRESS"),
    officerName: v("GRIEVANCE_OFFICER_NAME"),
    officerEmail: v("GRIEVANCE_EMAIL"),
    officerPhone: v("GRIEVANCE_PHONE"),
  };
}

/** Days within which a grievance is answered (the stricter of the figures quoted for the DPDP Rules) */
export const GRIEVANCE_DAYS = 30;
