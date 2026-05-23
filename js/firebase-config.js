import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyB_J3FKCR141F1ASJnsq7ye5BwBHRfHQd0",
  authDomain: "uic-simulator-game.firebaseapp.com",
  projectId: "uic-simulator-game",
  storageBucket: "uic-simulator-game.firebasestorage.app",
  messagingSenderId: "476898268780",
  appId: "1:476898268780:web:61ba84ef7a547b75942a49"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

export { db };