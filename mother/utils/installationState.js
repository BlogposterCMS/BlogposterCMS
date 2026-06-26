'use strict';

/**
 * Determine whether an installation should be considered complete based on
 * persisted markers.
 *
 * @param {Object} params
 * @param {boolean} params.lockExists          Whether the install.lock file exists
 * @param {boolean|string} params.firstInstallDone  The stored FIRST_INSTALL_DONE value
 * @param {number|string} params.userCount      Number of users returned by the auth module
 * @returns {{
 *   complete: boolean,
 *   lockExists: boolean,
 *   firstInstallDone: boolean,
 *   userCount: number,
 *   hasPersistentData: boolean,
 *   inconsistency: 'lock_without_data' | 'data_without_lock' | null
 * }}
 */
function computeInstallationCompletion(params) {
  const lockExists = Boolean(params?.lockExists);
  const normalizedFirstInstallDone = params?.firstInstallDone === true || params?.firstInstallDone === 'true';
  const numericUserCount = Number.isFinite(Number(params?.userCount)) ? Number(params.userCount) : 0;
  const hasPersistentData = normalizedFirstInstallDone || numericUserCount > 0;

  let inconsistency = null;
  let complete = lockExists && hasPersistentData;

  if (lockExists && !hasPersistentData) {
    inconsistency = 'lock_without_data';
    complete = false;
  } else if (!lockExists && hasPersistentData) {
    inconsistency = 'data_without_lock';
    complete = true;
  }

  return {
    complete,
    lockExists,
    firstInstallDone: normalizedFirstInstallDone,
    userCount: numericUserCount,
    hasPersistentData,
    inconsistency
  };
}

module.exports = {
  computeInstallationCompletion
};

