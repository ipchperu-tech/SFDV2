/**
 * auth-guard.js
 * ✅ CORREGIDO: Ruta de importación de firebase-config.js
 * Protege las páginas que requieren autenticación.
 */

// ✅ CORREGIDO: Cambiar '../firebase-config.js' a './firebase-config.js'
import { auth, db } from './firebase-config.js';

// Importamos las FUNCIONES desde el SDK de Firebase
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";


/**
 * Verifica si un usuario está autenticado y tiene el rol requerido.
 * Redirige a login.html si no está autenticado o no tiene permisos.
 * @param {Array<string>} allowedRoles - Lista de roles permitidos (ej. ['admin', 'calidad'])
 * @returns {Promise<{user: object, userRole: string}>} - Promesa que resuelve con el usuario y su rol.
 */
export function protectPage(allowedRoles) {
    return new Promise((resolve, reject) => {
        const unsubscribe = onAuthStateChanged(auth, async (user) => {
            unsubscribe(); // Nos desuscribimos para que no se ejecute múltiples veces
            
            if (user) {
                try {
                    // 1. El usuario está autenticado en Firebase Auth.
                    // 2. Ahora, verificamos su rol en Firestore.
                    const userDocRef = doc(db, 'sfd_usuarios', user.uid);
                    const userDocSnap = await getDoc(userDocRef);

                    if (userDocSnap.exists()) {
                        const userData = userDocSnap.data();
                        const userRole = userData.rol;
                        
                        // 3. Comprobar si el rol del usuario está en la lista de roles permitidos.
                        if (allowedRoles.includes(userRole)) {
                            // ¡Éxito! El usuario está logueado y tiene permisos.
                            document.body.classList.remove('loading'); // Quitar el loader
                            resolve({ user, userRole });
                        } else {
                            // Logueado pero sin permisos
                            console.warn(`Acceso denegado: Rol '${userRole}' no autorizado.`);
                            reject(new Error('Acceso denegado: No tienes permisos.'));
                            window.location.href = 'login.html';
                        }
                    } else {
                        // Logueado en Auth, pero no existe en la BD de 'sfd_usuarios'
                        console.error('Error: Usuario autenticado pero sin registro en Firestore.');
                        reject(new Error('Usuario no encontrado en la base de datos.'));
                        window.location.href = 'login.html';
                    }
                } catch (error) {
                    console.error('Error al verificar el rol del usuario:', error);
                    reject(error);
                    window.location.href = 'login.html';
                }
            } else {
                // No hay usuario autenticado
                console.log('Acceso denegado: Usuario no autenticado.');
                reject(new Error('Usuario no autenticado.'));
                window.location.href = 'login.html';
            }
        });
    });
}