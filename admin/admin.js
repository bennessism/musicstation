import {
  onAuthStateChanged,
  signInWithPopup,
  signOut,
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
import { auth, googleProvider } from "../engine/firebase.js";

const ADMIN_UIDS = new Set([
  "1t7mv9yXmJYYjpBFn2ar1BgUiVX2",
  "8G9oQmdk8fUhUYIZMjZ9OtLPZnt2",
]);

const loginPanel = document.querySelector("#loginPanel");
const identityPanel = document.querySelector("#identityPanel");
const googleLogin = document.querySelector("#googleLogin");
const signOutButton = document.querySelector("#signOut");
const copyUidButton = document.querySelector("#copyUid");
const authError = document.querySelector("#authError");
const userEmail = document.querySelector("#userEmail");
const userUid = document.querySelector("#userUid");

function showError(message) {
  authError.textContent = message;
}

function isAdmin(user) {
  return Boolean(user && ADMIN_UIDS.has(user.uid));
}

async function rejectUnauthorizedUser() {
  loginPanel.hidden = false;
  identityPanel.hidden = true;
  await signOut(auth);
  showError("This Google account is not authorized.");
}

googleLogin.addEventListener("click", async () => {
  googleLogin.disabled = true;
  showError("");

  try {
    const result = await signInWithPopup(auth, googleProvider);
    if (!isAdmin(result.user)) await rejectUnauthorizedUser();
  } catch (error) {
    if (error.code !== "auth/popup-closed-by-user") {
      showError(
        error.code === "auth/unauthorized-domain"
          ? "This website is not authorized in Firebase."
          : "Google sign-in could not be completed.",
      );
      console.error(error);
    }
  } finally {
    googleLogin.disabled = false;
  }
});

signOutButton.addEventListener("click", () => signOut(auth));

copyUidButton.addEventListener("click", async () => {
  const uid = userUid.textContent;
  try {
    await navigator.clipboard.writeText(uid);
    copyUidButton.textContent = "Copied";
    setTimeout(() => {
      copyUidButton.textContent = "Copy UID";
    }, 1600);
  } catch {
    showError("Could not copy automatically. Select the UID and copy it manually.");
  }
});

onAuthStateChanged(auth, async (user) => {
  if (user && !isAdmin(user)) {
    await rejectUnauthorizedUser();
    return;
  }

  loginPanel.hidden = isAdmin(user);
  identityPanel.hidden = !isAdmin(user);

  if (isAdmin(user)) {
    userEmail.textContent = user.email || "Google account";
    userUid.textContent = user.uid;
  } else {
    userEmail.textContent = "—";
    userUid.textContent = "—";
  }
});
