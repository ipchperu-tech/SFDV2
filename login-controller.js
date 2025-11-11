/**
 * login-controller.js
 * ✅ CORREGIDO: Ruta de importación de firebase-config.js
 * Lógica para la página de inicio de sesión (login.html).
 */

// ✅ CORREGIDO: Cambiar '../firebase-config.js' a './firebase-config.js'
import { auth, db } from './firebase-config.js';

// Importamos las FUNCIONES desde el SDK de Firebase
import { signInWithEmailAndPassword, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { doc, getDoc, collection, query, where, getDocs, limit } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";


// --- Elementos del DOM ---
const loginForm = document.getElementById('login-form');
const loginButton = document.getElementById('login-button');
const errorMessage = document.getElementById('error-message');

// --- Redirección si ya está logueado ---
onAuthStateChanged(auth, async (user) => {
    if (user) {
        console.log('Usuario ya logueado, verificando rol...');
        
        // Verificar rol antes de redirigir
        try {
            const userDocRef = doc(db, 'sfd_usuarios', user.uid);
            const userDocSnap = await getDoc(userDocRef);
            
            if (userDocSnap.exists()) {
                const userData = userDocSnap.data();
                const userRole = userData.rol;
                
                // Redirigir según el rol
                if (userRole === 'admin' || userRole === 'calidad') {
                    window.location.href = 'dashboard_admin.html';
                } else if (userRole === 'docente') {
                    // Por ahora, también va al dashboard admin (temporalmente)
                    // Cuando se cree dashboard_docente.html, cambiar a:
                    // window.location.href = 'dashboard_docente.html';
                    window.location.href = 'dashboard_docente.html';
                } else {
                    console.warn('Rol no reconocido:', userRole);
                }
            }
        } catch (error) {
            console.error('Error verificando rol:', error);
            document.body.style.opacity = '1';
        }
    } else {
        document.body.style.opacity = '1';
    }
});

/**
 * Busca el email de un usuario usando su DNI.
 * @param {string} dni - El DNI del usuario.
 * @returns {Promise<string|null>} El email si se encuentra, o null.
 */
async function getEmailFromDNI(dni) {
    try {
        const q = query(collection(db, "sfd_usuarios"), where("dni", "==", dni), limit(1));
        const querySnapshot = await getDocs(q);
        
        if (querySnapshot.empty) {
            console.log(`No se encontró usuario con DNI: ${dni}`);
            return null;
        }
        
        // Devolver el email del primer usuario encontrado
        const userDoc = querySnapshot.docs[0].data();
        return userDoc.email;

    } catch (error) {
        console.error("Error buscando DNI:", error);
        throw new Error('Error al buscar el DNI. Verifica los permisos de Firestore.');
    }
}


// --- Manejador del Login ---
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    loginButton.disabled = true;
    loginButton.textContent = 'Ingresando...';
    errorMessage.classList.add('hidden');
    errorMessage.textContent = '';

    let loginIdentifier = loginForm['login-input'].value.trim();
    const password = loginForm['password'].value;
    let emailToLogin = loginIdentifier; // Asumimos que es un email

    try {
        // --- Lógica de DNI ---
        // Si no es un email, asumimos que es un DNI y buscamos su email
        if (!loginIdentifier.includes('@')) {
            loginButton.textContent = 'Verificando DNI...';
            const emailFromDNI = await getEmailFromDNI(loginIdentifier);
            
            if (!emailFromDNI) {
                throw new Error('No se encontró una cuenta con ese DNI.');
            }
            emailToLogin = emailFromDNI;
            loginButton.textContent = 'Ingresando...';
        }
        // --- Fin Lógica de DNI ---

        // 1. Autenticar con Firebase Auth usando el email (real o encontrado)
        const userCredential = await signInWithEmailAndPassword(auth, emailToLogin, password);
        const user = userCredential.user;

        // 2. Verificar el rol en Firestore
        const userDocRef = doc(db, 'sfd_usuarios', user.uid);
        const userDocSnap = await getDoc(userDocRef);

        if (userDocSnap.exists()) {
            const userData = userDocSnap.data();
            const userRole = userData.rol;

            // 3. Redirigir según el rol
            if (userRole === 'admin' || userRole === 'calidad') {
                window.location.href = 'dashboard_admin.html';
            } else if (userRole === 'docente') {
                // TEMPORAL: Por ahora va al dashboard admin
                // Cuando se cree dashboard_docente.html, cambiar a:
                // window.location.href = 'dashboard_docente.html';
                window.location.href = 'dashboard_docente.html';
            } else {
                // Rol no reconocido
                throw new Error(`Tu rol "${userRole}" no tiene un panel asignado.`);
            }
        } else {
            // Usuario en Auth pero no en BD
            throw new Error('Tu usuario está autenticado pero no tiene un perfil en el sistema.');
        }

    } catch (error) {
        console.error('Error de inicio de sesión:', error);
        let friendlyMessage = 'Email/DNI o contraseña incorrectos.';
        
        // Manejo detallado de errores
        if (error.message.includes('No se encontró una cuenta con ese DNI')) {
            friendlyMessage = 'No existe una cuenta con ese DNI. Verifica que esté registrado correctamente.';
        } else if (error.message.includes('Error al buscar el DNI')) {
            friendlyMessage = 'Error al verificar el DNI. Contacta al administrador del sistema.';
        } else if (error.code === 'auth/user-not-found') {
            friendlyMessage = 'No existe una cuenta con ese email. Contacta al administrador.';
        } else if (error.code === 'auth/wrong-password') {
            friendlyMessage = 'Contraseña incorrecta. Verifica e intenta nuevamente.';
        } else if (error.code === 'auth/invalid-credential') {
            friendlyMessage = 'Credenciales inválidas. Verifica tu email/DNI y contraseña.';
        } else if (error.code === 'auth/too-many-requests') {
            friendlyMessage = 'Demasiados intentos fallidos. Espera unos minutos e intenta de nuevo.';
        } else if (error.code === 'permission-denied' || error.message.includes('permissions')) {
            friendlyMessage = 'Error de permisos. Contacta al administrador del sistema.';
        } else if (error.message.includes('rol')) {
            friendlyMessage = error.message; // Mostrar mensaje de rol no asignado
        } else {
            friendlyMessage = error.message || 'Error desconocido al iniciar sesión.';
        }

        errorMessage.textContent = friendlyMessage;
        errorMessage.classList.remove('hidden');
        loginButton.disabled = false;
        loginButton.textContent = 'Ingresar';
    }
});