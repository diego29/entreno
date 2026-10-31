// ⚙️ PEGA AQUÍ LA CONFIGURACIÓN DE TU PROYECTO DE FIREBASE
// Firebase → Configuración del proyecto → Tus apps → App web → "SDK setup and configuration" → Config
// Estos valores no son secretos: la seguridad la dan las reglas de Firestore (firestore.rules).
export const firebaseConfig = {
  apiKey: "AIzaSyC9fdNjUsuY8fVaRwGS9GGhxFqYrTFtIWg",
  authDomain: "entreno-f0df7.firebaseapp.com",
  projectId: "entreno-f0df7",
  storageBucket: "entreno-f0df7.firebasestorage.app",
  messagingSenderId: "215023110351",
  appId: "1:215023110351:web:ac7c30631198cf3dae0fba"
};

// Pon true solo si activaste Storage en Firebase (requiere plan Blaze con tarjeta;
// es gratis hasta 5 GB). Con false, los GIFs se agregan por link o subiéndolos a la carpeta gifs/.
export const storageEnabled = false;

// 🔔 NOTIFICACIONES (opcional). Si se quedan vacías, la app funciona igual pero sin avisos con el cel bloqueado.
// vapidKey: Firebase → Configuración del proyecto → Cloud Messaging → Certificados push web → "Par de claves".
export const vapidKey = "BKA0LmMu2QlYzhv3xEjec02X1og1fIKJP6m7ov1hcvJAQ7L0HayLrjKnQBYcw6x2A7K6VzYoXkrK-Pmba7u0Ymw";
// pushUrl: la dirección de tu worker "entreno-push" en Cloudflare, por ejemplo "https://entreno-push.TU-USUARIO.workers.dev".
export const pushUrl = "https://entreno-push.d13g0manuel.workers.dev";
