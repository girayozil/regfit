// Sign-in screen and first-time account setup.

import { esc, icon, on, app } from '../util.js';

const ui = { error: '', busy: false, email: '' };

export function renderSignIn() {
  return `
  <div class="auth-wrap">
    <form class="auth-card" id="signin-form" novalidate>
      <div class="auth-brand"><span class="brand-mark">${icon.dumbbell(18, 2.4)}</span><span>RegFit</span></div>
      <h1 class="page-title">Sign in</h1>
      <label class="field-label">Email<input class="field" type="email" name="email" autocomplete="username" inputmode="email" autocapitalize="off" spellcheck="false" value="${esc(ui.email)}" required></label>
      <label class="field-label">Password<input class="field" type="password" name="password" autocomplete="current-password" required></label>
      ${ui.error ? `<p class="auth-error" role="alert">${esc(ui.error)}</p>` : ''}
      <button type="submit" class="btn btn-dark wide" data-act="signIn"${ui.busy ? ' disabled' : ''}>${ui.busy ? 'Signing in…' : 'Sign in'}</button>
      <button type="button" class="btn btn-ghost wide" data-act="forgotPassword">Forgot password?</button>
    </form>
  </div>`;
}

function formValues() {
  const f = document.getElementById('signin-form');
  return { email: f.elements.email.value.trim(), password: f.elements.password.value };
}

on('click', 'signIn', async () => {
  const { email, password } = formValues();
  ui.email = email;
  if (!email || !password) {
    ui.error = 'Enter your email and password.';
    app.rerender();
    return;
  }
  ui.busy = true;
  ui.error = '';
  app.rerender();
  try {
    await app.cloud.signIn(email, password);
    ui.busy = false; // onAuth takes it from here
  } catch (e) {
    ui.busy = false;
    ui.error = app.cloud.authMessage(e);
    app.rerender();
  }
});

document.addEventListener('submit', (e) => {
  if (e.target.id === 'signin-form') {
    e.preventDefault();
    document.querySelector('[data-act="signIn"]').click();
  }
});

on('click', 'forgotPassword', async () => {
  const { email } = formValues();
  ui.email = email;
  if (!email) {
    ui.error = 'Enter your email above first, then tap “Forgot password?”.';
    app.rerender();
    return;
  }
  try {
    await app.cloud.resetPassword(email);
  } catch (e) {
    /* same message either way, so the form doesn't reveal which emails have accounts */
  }
  ui.error = '';
  app.rerender();
  app.toast('If that email has an account, a reset link is on its way.');
});

// ---------- first-time setup ----------

// Resolves with 'empty' | 'demo'.
export function askSetup() {
  return new Promise((resolve) => {
    app.modal(
      `<div class="modal-head"><h2>Set up your account</h2></div>
       <p class="muted small">Your account is new. How do you want to start? You can change this later in Settings.</p>
       <div class="setup-options">
         <button type="button" class="setup-opt primary" data-act="setupChoice" data-v="empty">
           <strong>Start empty</strong><span>Just the exercise library — add your own clients</span>
         </button>
         <button type="button" class="setup-opt" data-act="setupChoice" data-v="demo">
           <strong>Start with demo data</strong><span>Sample clients and months of sessions to try things out</span>
         </button>
       </div>`,
      'Set up your account',
      true
    );
    ui.resolveSetup = (v) => {
      app.closeModal();
      resolve(v);
    };
  });
}

on('click', 'setupChoice', (el) => {
  if (ui.resolveSetup) ui.resolveSetup(el.dataset.v);
  ui.resolveSetup = null;
});

export const resetSignInForm = () => {
  ui.error = '';
  ui.busy = false;
};
