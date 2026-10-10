// Firebase: sign-in and the Firestore copy of the trainer's data.
//
// Layout: users/{uid}                      — account marker (created at setup)
//         users/{uid}/clients/{id}
//         users/{uid}/sessions/{id}
//         users/{uid}/exercises/{id}
// Security rules allow each signed-in user to read/write only users/{their uid}/**.
//
// The Firebase web config is public by design; the rules protect the data.

const V = '13.0.0';
const BASE = `https://www.gstatic.com/firebasejs/${V}`;

export const COLLECTIONS = ['clients', 'sessions', 'exercises'];

const firebaseConfig = {
  apiKey: 'AIzaSyDBMpMxpWkLMLR2pTmB4_5pnpxkjwi_UIw',
  authDomain: 'regfit-b4e68.firebaseapp.com',
  projectId: 'regfit-b4e68',
  storageBucket: 'regfit-b4e68.firebasestorage.app',
  messagingSenderId: '990356083456',
  appId: '1:990356083456:web:4a34cd627a72dccf3dd9e5',
};

let fb = null; // { auth, fs, A (auth module), F (firestore module) }

export async function init() {
  if (fb) return fb;
  const [{ initializeApp }, A, F] = await Promise.all([import(`${BASE}/firebase-app.js`), import(`${BASE}/firebase-auth.js`), import(`${BASE}/firebase-firestore.js`)]);
  const app = initializeApp(firebaseConfig);
  const auth = A.getAuth(app);
  let fs;
  try {
    // Offline cache: reads work without a connection and writes queue until it returns.
    fs = F.initializeFirestore(app, { localCache: F.persistentLocalCache({ tabManager: F.persistentMultipleTabManager() }), ignoreUndefinedProperties: true });
  } catch (e) {
    fs = F.initializeFirestore(app, { ignoreUndefinedProperties: true });
  }
  fb = { auth, fs, A, F };
  return fb;
}

export const onAuth = (cb) => fb.A.onAuthStateChanged(fb.auth, cb);
export const signIn = (email, password) => fb.A.signInWithEmailAndPassword(fb.auth, email, password);
export const resetPassword = (email) => fb.A.sendPasswordResetEmail(fb.auth, email);

export async function signOutAndClear() {
  await fb.A.signOut(fb.auth);
  // Drop this device's cached copy of the data.
  try {
    await fb.F.terminate(fb.fs);
    await fb.F.clearIndexedDbPersistence(fb.fs);
  } catch (e) {
    /* ignore — a reload starts clean anyway */
  }
}

// Message for an auth error code, in plain words.
export function authMessage(err) {
  const code = (err && err.code) || '';
  if (/invalid-credential|wrong-password|user-not-found|invalid-email|missing-password/.test(code)) return 'Email or password is incorrect.';
  if (/too-many-requests/.test(code)) return 'Too many attempts. Wait a few minutes, or reset your password.';
  if (/network-request-failed/.test(code)) return 'No connection. Check the internet and try again.';
  if (/user-disabled/.test(code)) return 'This account has been disabled.';
  return 'Couldn’t sign in. Please try again.';
}

// ---------- data ----------

const colRef = (uid, name) => fb.F.collection(fb.fs, 'users', uid, name);
const docRef = (uid, name, id) => fb.F.doc(fb.fs, 'users', uid, name, id);

// Has this account been set up yet? Asks the server; null when offline.
export async function accountExists(uid) {
  try {
    const snap = await fb.F.getDocFromServer(fb.F.doc(fb.fs, 'users', uid));
    return snap.exists();
  } catch (e) {
    return null;
  }
}

export async function markAccount(uid) {
  await fb.F.setDoc(fb.F.doc(fb.fs, 'users', uid), { createdAt: new Date().toISOString(), version: 2 }, { merge: true });
}

// Live updates for all three collections. cb(name, changes, isFirst) where
// changes = [{ type: 'set' | 'removed', id, data }].
export function subscribe(uid, cb) {
  const unsubs = COLLECTIONS.map((name) => {
    let first = true;
    return fb.F.onSnapshot(colRef(uid, name), (snap) => {
      const changes = first
        ? snap.docs.map((d) => ({ type: 'set', id: d.id, data: d.data() }))
        : snap.docChanges().map((c) => ({ type: c.type === 'removed' ? 'removed' : 'set', id: c.doc.id, data: c.doc.data() }));
      cb(name, changes, first);
      first = false;
    });
  });
  return () => unsubs.forEach((u) => u());
}

// Apply writes in batches (Firestore allows 500 operations per batch).
// ops = [{ name, id, data | null }]; null deletes. Resolves once the server has them.
export function write(uid, ops) {
  const commits = [];
  for (let i = 0; i < ops.length; i += 450) {
    const batch = fb.F.writeBatch(fb.fs);
    ops.slice(i, i + 450).forEach(({ name, id, data }) => {
      if (data === null) batch.delete(docRef(uid, name, id));
      else batch.set(docRef(uid, name, id), data);
    });
    commits.push(batch.commit());
  }
  return Promise.all(commits);
}
