'use strict';

function validateInstallInput(payload = {}, options = {}) {
  const {
    username,
    email,
    password
  } = payload;
  const {
    forbidden = [],
    allowWeak = false,
    isLocal = false
  } = options;

  if (!username || !email || !password) {
    return {
      error: { status: 400, message: 'Missing fields' }
    };
  }

  if (forbidden.includes(username.toLowerCase()) && (!allowWeak || !isLocal)) {
    return {
      error: { status: 400, message: 'Username not allowed' }
    };
  }

  return {
    error: null
  };
}

module.exports = {
  validateInstallInput
};

