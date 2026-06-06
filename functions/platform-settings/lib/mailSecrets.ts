function mailSecretsKey() {
  return String(process.env.WPHUB_MAIL_SECRETS_KEY || process.env.ENCRYPTION_KEY || '').trim();
}

export { mailSecretsKey };