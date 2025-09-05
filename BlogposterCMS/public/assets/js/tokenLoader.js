// public/assets/js/tokenLoader.js

export function loadAuthTokens() {
  if (typeof window.ADMIN_TOKEN === 'undefined') {
    window.ADMIN_TOKEN = null;
  }
  if (typeof window.PUBLIC_TOKEN === 'undefined') {
    window.PUBLIC_TOKEN = null;
  }
}

loadAuthTokens();
