/**
 * user-admin.js
 * ✅ CORREGIDO: Importaciones del SDK de Firebase
 * Este módulo maneja la creación de usuarios en Firebase Authentication
 * utilizando una instancia de app de Firebase secundaria.
 */

// ✅ CORREGIDO: Importaciones correctas desde los módulos apropiados
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { 
  getAuth, 
  createUserWithEmailAndPassword,
  signOut
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";

// --- Configuración de Firebase ---
// ¡IMPORTANTE! Esta debe ser la MISMA configuración que en firebase-config.js
const firebaseConfig = {
  apiKey: "AIzaSyAUG8G7BnAnImJujjuE93MWk-h3pSrq-DE",
  authDomain: "sfd-ipch.firebaseapp.com",
  projectId: "sfd-ipch",
  storageBucket: "sfd-ipch.firebasestorage.app",
  messagingSenderId: "40752492685",
  appId: "1:40752492685:web:4c3cd9e0e6b9089180f2c4"
};
// ------------------------------------------

// Inicializa una app de Firebase SECUNDARIA con un nombre único
let userCreationApp;
let userCreationAuth;

try {
  // Intentar inicializar la app secundaria
  userCreationApp = initializeApp(firebaseConfig, "userCreationApp");
  userCreationAuth = getAuth(userCreationApp);
  console.log('App secundaria inicializada correctamente');
} catch (error) {
  // Si ya existe (por recarga), intentar obtenerla
  console.warn("La app de creación de usuarios ya estaba inicializada:", error.code);
  
  // Si el error es que la app ya existe, usar la app principal como fallback
  if (error.code === 'app/duplicate-app') {
    try {
      userCreationApp = initializeApp(firebaseConfig);
      userCreationAuth = getAuth(userCreationApp);
      console.log('Usando app principal como fallback');
    } catch (fallbackError) {
      console.error("Error crítico al inicializar Firebase:", fallbackError);
      // Crear una instancia temporal sin nombre
      userCreationApp = initializeApp(firebaseConfig, `userCreationApp_${Date.now()}`);
      userCreationAuth = getAuth(userCreationApp);
    }
  }
}

/**
 * Crea una nueva cuenta de usuario en Firebase Authentication.
 * @param {string} email - El email para el nuevo usuario.
 * @param {string} password - La contraseña para el nuevo usuario.
 * @returns {Promise<object>} El objeto de credencial de usuario (userCredential).
 */
export async function createUserAccount(email, password) {
  try {
    console.log('Creando cuenta de usuario:', email);
    
    // 1. Creamos el usuario
    const userCredential = await createUserWithEmailAndPassword(userCreationAuth, email, password);
    
    console.log('Cuenta creada con UID:', userCredential.user.uid);
    
    // 2. Inmediatamente deslogueamos al nuevo usuario de ESTA instancia
    // para que no interfiera con la sesión del admin actual
    if (userCreationAuth.currentUser && userCreationAuth.currentUser.uid === userCredential.user.uid) {
      await signOut(userCreationAuth);
      console.log('Nuevo usuario deslogueado de la instancia secundaria');
    }
    
    // 3. Devolvemos el usuario creado (que contiene el uid)
    return userCredential.user;

  } catch (error) {
    console.error("Error al crear la cuenta de usuario:", error);
    // Propagamos el error para que el controlador principal lo maneje
    throw error;
  }
}