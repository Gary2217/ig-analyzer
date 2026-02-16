export function isSaasIgAccountsEnabled(): boolean {
  return String(process.env.SAAS_IG_ACCOUNTS_ENABLED || "false").toLowerCase() === "true"
}
