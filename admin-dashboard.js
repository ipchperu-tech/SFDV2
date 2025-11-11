/**
 * js/admin-dashboard.js
 * ✅ CORREGIDO: Rutas de importación
 * Orquestador principal del panel de administración.
 * Carga el guardia de autenticación, inicializa los módulos de sección
 * y maneja la navegación principal.
 */

// --- Importaciones de Núcleo ---
// ✅ CORREGIDO: Cambiar '../firebase-config.js' a './firebase-config.js'
import { auth } from './firebase-config.js';
import { signOut } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { protectPage } from './auth-guard.js';
import { db, doc, getDoc } from './firebase-config.js';

// --- Importaciones de Módulos ---
import { initAulas } from './modulos/aulas.js';
import { initDocentes } from './modulos/docentes.js';
import { initColaboradores } from './modulos/colaboradores.js';
import { initNovedades } from './modulos/novedades.js';
import { initGenerarEncuesta } from './modulos/generar-encuesta.js';
// import { initEvaluacionCalidad } from './modulos/evaluacion-calidad.js'; // (Pendiente)

// --- Módulos de Secciones ---
const modules = {
    'aulas': initAulas,
    'docentes': initDocentes,
    'colaboradores': initColaboradores,
    'novedades': initNovedades,
    'generar-encuesta': initGenerarEncuesta,
    'evaluacion-calidad': () => console.log("Módulo de Evaluación de Calidad pendiente.")
};

// --- Elementos del DOM ---
let elements = {};

/**
 * Punto de entrada principal. Se ejecuta cuando el DOM está listo.
 */
document.addEventListener('DOMContentLoaded', async () => {
    
    // --- Captura de Elementos ---
elements = {
    navLinks: document.querySelectorAll('aside nav a'),
    sections: document.querySelectorAll('.app-section'),
    userNameDisplay: document.getElementById('user-name-display'),
    userRoleDisplay: document.getElementById('user-role-display'),
    peruDate: document.getElementById('peru-date'),
    peruTime: document.getElementById('peru-time'),
    logoutButton: document.getElementById('logout-button')
};

    try {
        // 1. Proteger la página (permite admin, calidad y docente temporalmente)
        const { user, userRole } = await protectPage(['admin', 'calidad', 'docente']);
        
        // 2. Si la autenticación es exitosa, inicializar la página
        initializePage(user, userRole);

    } catch (error) {
        // Si protectPage falla (no logueado, sin permisos), redirige
        console.error("Fallo de autenticación:", error);
        if (false && elements.mainTitle) {
            // elements.mainTitle.textContent = 'Acceso Denegado';
        }
        // Redirigir al login
        window.location.href = 'login.html'; 
    }
});

/**
 * Inicializa la funcionalidad de la página post-autenticación.
 */
function initializePage(user, role) {
    try {
        // Iniciar reloj de Perú
        iniciarRelojPeru();
        
        // Cargar y mostrar nombre del usuario
        cargarNombreUsuario(user.uid, role);

        // NUEVO: Si es docente, mostrar aviso temporal
        if (role === 'docente') {
            const mainContent = document.querySelector('main .flex-1');
            const aviso = document.createElement('div');
            aviso.className = 'bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-6';
            aviso.innerHTML = `
                <div class="flex">
                    <div class="flex-shrink-0">
                        <svg class="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                            <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/>
                        </svg>
                    </div>
                    <div class="ml-3">
                        <p class="text-sm text-yellow-700">
                            <strong>Acceso Temporal:</strong> Como docente, solo puedes ver información limitada. Tu panel personalizado estará disponible próximamente.
                        </p>
                    </div>
                </div>
            `;
            mainContent.insertBefore(aviso, mainContent.firstChild);
        }

        // Configurar botón de logout
        if (elements.logoutButton) {
            elements.logoutButton.addEventListener('click', () => {
                signOut(auth).then(() => {
                    console.log('Cierre de sesión exitoso');
                    window.location.href = 'login.html';
                }).catch((error) => {
                    console.error('Error al cerrar sesión:', error);
                });
            });
        }

        // Configurar la navegación
        setupNavigation(user, role);
        
        // Cargar la sección inicial basada en el hash
        const initialHash = window.location.hash || '#aulas';
        handleNavigation(initialHash, user, role);

    } catch (error) {
        console.error("Error en la inicialización del dashboard:", error);
        if (false && elements.mainTitle) {
            // elements.mainTitle.textContent = 'Error al cargar';
        }
    }
}

/**
 * ✅ NUEVO: Carga el nombre del usuario desde Firestore
 */
async function cargarNombreUsuario(uid, role) {
    try {
        const userDocRef = doc(db, 'sfd_usuarios', uid);
        const userDocSnap = await getDoc(userDocRef);
        
        if (userDocSnap.exists()) {
            const userData = userDocSnap.data();
            const nombre = userData.nombre || 'Usuario';
            
            // Mapear rol a texto amigable
            const rolesTexto = {
                'admin': 'Administrador',
                'calidad': 'Calidad',
                'docente': 'Docente'
            };
            
            if (elements.userNameDisplay) {
                elements.userNameDisplay.textContent = nombre;
            }
            
            if (elements.userRoleDisplay) {
                elements.userRoleDisplay.textContent = rolesTexto[role] || role;
            }
        }
    } catch (error) {
        console.error('Error cargando nombre de usuario:', error);
        if (elements.userNameDisplay) {
            elements.userNameDisplay.textContent = 'Error al cargar';
        }
    }
}

/**
 * ✅ NUEVO: Inicia el reloj de Perú en tiempo real
 */
function iniciarRelojPeru() {
    function actualizarReloj() {
        const ahora = new Date();
        const utcTime = ahora.getTime() + (ahora.getTimezoneOffset() * 60000);
        const peruTime = new Date(utcTime + (3600000 * -5));
        
        // Formatear fecha: "Mar, 12 Nov 2025"
        const opciones = { 
            weekday: 'short', 
            day: 'numeric', 
            month: 'short', 
            year: 'numeric',
            timeZone: 'America/Lima'
        };
        const fechaTexto = peruTime.toLocaleDateString('es-PE', opciones);
        
        // Formatear hora: "14:35:22"
        const horas = String(peruTime.getHours()).padStart(2, '0');
        const minutos = String(peruTime.getMinutes()).padStart(2, '0');
        const segundos = String(peruTime.getSeconds()).padStart(2, '0');
        const horaTexto = `${horas}:${minutos}:${segundos}`;
        
        if (elements.peruDate) {
            elements.peruDate.textContent = fechaTexto;
        }
        
        if (elements.peruTime) {
            elements.peruTime.textContent = horaTexto;
        }
    }
    
    // Actualizar inmediatamente
    actualizarReloj();
    
    // Actualizar cada segundo
    setInterval(actualizarReloj, 1000);
}

/**
 * Configura los listeners de los enlaces de navegación.
 */
function setupNavigation(user, role) {
    // NUEVO: Deshabilitar opciones para docentes
    if (role === 'docente') {
        elements.navLinks.forEach(link => {
            const section = link.hash.substring(1);
            // Permitir solo generar-encuesta y evaluacion-calidad
            if (!['generar-encuesta', 'evaluacion-calidad'].includes(section)) {
                link.style.opacity = '0.5';
                link.style.pointerEvents = 'none';
                link.title = 'No disponible para docentes';
            }
        });
    }

    elements.navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            const hash = e.currentTarget.hash;
            handleNavigation(hash, user, role);
        });
    });
    
    // Manejar también el evento de cambio de hash (botones atrás/adelante)
    window.addEventListener('hashchange', () => {
        handleNavigation(window.location.hash, user, role);
    });
}

/**
 * Maneja la lógica de mostrar/ocultar secciones y cargar módulos.
 */
function handleNavigation(hash, user, role) {
    try {
        // Limpiar el hash y obtener el nombre de la sección
        const sectionName = hash.substring(1); // ej. "aulas"
        
        // NUEVO: Bloquear secciones para docentes
        if (role === 'docente' && !['generar-encuesta', 'evaluacion-calidad'].includes(sectionName)) {
            alert('Esta sección no está disponible para docentes.');
            // Redirigir a una sección permitida
            window.location.hash = '#generar-encuesta';
            return;
        }
        
        // Actualizar el título principal
        const navLink = document.querySelector(`nav a[href="${hash}"]`);
        if (navLink) {
            const title = navLink.querySelector('span').textContent;
            // elements.mainTitle.textContent = title;
        } else {
            // elements.mainTitle.textContent = 'Dashboard';
        }
        
        // Actualizar estado activo del enlace
        elements.navLinks.forEach(link => {
            link.classList.toggle('nav-link-active', link.hash === hash);
        });

        // Ocultar todas las secciones
        elements.sections.forEach(section => {
            section.classList.add('hidden');
        });

        // Mostrar la sección activa
        const activeSection = document.getElementById(`${sectionName}-section`);
        if (activeSection) {
            activeSection.classList.remove('hidden');
            
            // Inicializar el módulo correspondiente si no ha sido inicializado
            const moduleName = sectionName.replace(/-/g, '_'); // ej: "generar-encuesta" -> "generar_encuesta"
            if (modules[sectionName] && !activeSection.dataset.initialized) {
                modules[sectionName](user, role);
                activeSection.dataset.initialized = 'true';
            }
        } else {
            console.warn(`No se encontró la sección para el hash: ${hash}`);
            // Opcional: mostrar la sección de Aulas por defecto
            const aulasSection = document.getElementById('aulas-section');
            if (aulasSection) {
                aulasSection.classList.remove('hidden');
            }
        }
    } catch (error) {
        console.error("Error en navegación:", error);
    }
}