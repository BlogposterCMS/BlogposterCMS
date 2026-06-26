'use strict';

const { computeInstallationCompletion } = require('../mother/utils/installationState');

describe('computeInstallationCompletion', () => {
  it('treats a lock file without users as incomplete', () => {
    const result = computeInstallationCompletion({
      lockExists: true,
      firstInstallDone: false,
      userCount: 0
    });

    expect(result.complete).toBe(false);
    expect(result.inconsistency).toBe('lock_without_data');
  });
});

