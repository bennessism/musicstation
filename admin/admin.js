import {
  onAuthStateChanged,
  signInWithPopup,
  signOut,
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
import { auth, googleProvider } from "../engine/firebase.js";

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

googleLogin.addEventListener("click", async () => {
  googleLogin.disabled = true;
  showError("");

  try {
    await signInWithPopup(auth, googleProvider);
  } catch (error) {
    if (error.code !== "auth/popup-closed-by-user") {
      showError("Google sign-in could not be completed. Check Firebase's authorized domains.");
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

onAuthStateChanged(auth, (user) => {
  loginPanel.hidden = Boolean(user);
  identityPanel.hidden = !user;

  if (user) {
    userEmail.textContent = user.email || "Google account";
    userUid.textContent = user.uid;
  } else {
    userEmail.textContent = "—";
    userUid.textContent = "—";
  }
});
