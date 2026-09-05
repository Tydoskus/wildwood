/** All persistent account keys share the connection-specific namespace. */
export function accountStorageKeys(host: string, databaseName: string) {
  const tokenKey = `${host}/${databaseName}/auth_token`;
  const guestTokenKey = `${tokenKey}/guest_v1`;
  const accountTokenKey = `${tokenKey}/spacetimeauth_id_token_v1`;
  const accountLinkKey = `${tokenKey}/spacetimeauth_link_v1`;
  const accountMigrationPendingKey = `${tokenKey}/spacetimeauth_migration_pending_v1`;
  const authStateKey = `${tokenKey}/spacetimeauth_state_v1`;
  const authVerifierKey = `${tokenKey}/spacetimeauth_verifier_v1`;
  const authNonceKey = `${tokenKey}/spacetimeauth_nonce_v1`;
  const authRetryKey = `${tokenKey}/spacetimeauth_401_retry_v1`;
  const knownAccountKey = `${tokenKey}/spacetimeauth_known_account_v1`;
  const knownAccountCharacterKey = `${tokenKey}/spacetimeauth_character_name_v1`;
  const knownAccountGenderKey = `${tokenKey}/spacetimeauth_character_gender_v1`;
  const knownGuestCharacterKey = `${tokenKey}/guest_character_name_v1`;
  const authReturnUiKey = `${tokenKey}/spacetimeauth_return_ui_v1`;
  const updateResumeKey = `${tokenKey}/forced_update_resume_v1`;
  const updateResumeConsumedKey = `${updateResumeKey}/consumed_version`;
  const authTabKey = `${accountMigrationPendingKey}/tab_id`;
  const pendingProgressKey = `${tokenKey}/pending_progress_v1`;
  const legalConsentKey = `${tokenKey}/legal_consent_v1`;
  return {
    tokenKey, guestTokenKey, accountTokenKey, accountLinkKey, accountMigrationPendingKey,
    authStateKey, authVerifierKey, authNonceKey, authRetryKey, knownAccountKey,
    knownAccountCharacterKey, knownAccountGenderKey, knownGuestCharacterKey, authReturnUiKey,
    updateResumeKey, updateResumeConsumedKey, authTabKey, pendingProgressKey, legalConsentKey,
  };
}
