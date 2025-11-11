// Importa las funciones que necesitas de los SDKs
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { 
  getAuth, 
  onAuthStateChanged, 
  signInWithEmailAndPassword, 
  signOut,
  signInAnonymously,
  signInWithCustomToken
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { 
  getFirestore, 
  doc, 
  getDoc, 
  setDoc, 
  addDoc, 
  collection, 
  onSnapshot,
  query,
  where,
  serverTimestamp,
  Timestamp,
  setLogLevel
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// --- PEGA AQUÍ TU CONFIGURACIÓN DE FIREBASE ---
// Reemplaza esto con el objeto de configuración de tu proyecto Firebase
const firebaseConfig = {
  apiKey: "AIzaSyAUG8G7BnAnImJujjuE93MWk-h3pSrq-DE",
  authDomain: "sfd-ipch.firebaseapp.com",
  projectId: "sfd-ipch",
  storageBucket: "sfd-ipch.firebasestorage.app",
  messagingSenderId: "40752492685",
  appId: "1:40752492685:web:4c3cd9e0e6b9089180f2c4"
};
// ------------------------------------------

// Inicializa Firebase
const app = initializeApp(firebaseConfig);

// Habilita logs de debug de Firestore (muy útil para desarrollo)
setLogLevel('debug');

// Exporta los servicios de Firebase para usarlos en otros módulos
export const auth = getAuth(app);
export const db = getFirestore(app);

// Exporta las funciones específicas que usaremos
export {
  // Auth
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  signInAnonymously,
  signInWithCustomToken,
  
  // Firestore
  doc,
  getDoc,
  setDoc,
  addDoc,
  collection,
  onSnapshot,
  query,
  where,
  serverTimestamp,
  Timestamp
};

// Lógica de Autenticación Inicial (requerida por las instrucciones)
// Esta función se debe llamar UNA VEZ al cargar la app
export async function initializeAuth() {
  return new Promise((resolve, reject) => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      unsubscribe(); // Nos desuscribimos después de la primera comprobación

      if (user) {
        // Usuario ya autenticado (quizás de una sesión anterior)
        console.log('Auth: Usuario ya autenticado.', user.uid);
        resolve(user);
        return;
      }

      // Si no hay usuario y tenemos un token inicial (entorno Canvas)
      if (typeof __initial_auth_token !== 'undefined') {
        try {
          console.log('Auth: Autenticando con token inicial...');
          const userCredential = await signInWithCustomToken(auth, __initial_auth_token);
          console.log('Auth: Éxito con token inicial.', userCredential.user.uid);
          resolve(userCredential.user);
        } catch (error) {
          console.error('Auth: Error con token inicial, intentando anónimo.', error);
          // Fallback a anónimo si el token falla
          try {
            const anonUser = await signInAnonymously(auth);
            console.log('Auth: Éxito con anónimo (fallback).', anonUser.user.uid);
            resolve(anonUser.user);
          } catch (anonError) {
            console.error('Auth: Error fatal al autenticar.', anonError);
            reject(anonError);
          }
        }
      } else {
        // Si no hay token, intentamos autenticación anónima (para vistas públicas)
        try {
          console.log('Auth: No hay token inicial, intentando anónimo...');
          const anonUser = await signInAnonymously(auth);
          console.log('Auth: Éxito con anónimo.', anonUser.user.uid);
          resolve(anonUser.user);
        } catch (error) {
          console.error('Auth: Error en autenticación anónima.', error);
          reject(error);
        }
      }
    });
  });
}
