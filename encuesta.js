/**
 * js/encuesta.js
 * ✅ VERSIÓN LIMPIA Y COMPLETA
 * - Sin botón toggle (formulario siempre visible)
 * - LocalStorage implementado (anti-duplicados)
 * - Compatible con mejoras visuales
 */

// --- Importaciones de Núcleo ---
import { 
    db, 
    doc, 
    getDoc, 
    Timestamp, 
    addDoc, 
    collection,
    serverTimestamp
} from './firebase-config.js';

// --- Estado Global del Módulo ---
let ticketData = null;
let ticketId = null;
let calificacionSeleccionada = 0;

// --- Funciones de LocalStorage (Anti-duplicados) ---
function yaVoto(ticketId) {
    return localStorage.getItem(`sfd_voto_${ticketId}`) === 'true';
}

function marcarComoVotado(ticketId) {
    localStorage.setItem(`sfd_voto_${ticketId}`, 'true');
}

// --- Elementos del DOM ---
const UIElements = {};

/**
 * Función principal que se ejecuta al cargar la página.
 */
document.addEventListener('DOMContentLoaded', async () => {
    // Capturar todos los elementos de la UI
    UIElements.loadingState = document.getElementById('loading-state');
    UIElements.invalidState = document.getElementById('invalid-state');
    UIElements.formState = document.getElementById('form-state');
    UIElements.successState = document.getElementById('success-state');
    UIElements.invalidMessage = document.getElementById('invalid-message');
    
    // Info de la clase
    UIElements.infoDocente = document.getElementById('info-docente');
    UIElements.infoAula = document.getElementById('info-aula');
    UIElements.infoSesion = document.getElementById('info-sesion');

    // Formulario
    UIElements.encuestaForm = document.getElementById('encuesta-form');
    UIElements.calificacionInput = document.getElementById('calificacion-input');
    UIElements.ratingText = document.getElementById('rating-text');
    UIElements.stars = document.querySelectorAll('.star');
    UIElements.submitButton = document.getElementById('submit-button');
    UIElements.formError = document.getElementById('form-error');
    UIElements.formErrorText = document.getElementById('form-error-text');

    // Campos de alumno (siempre visibles, sin toggle)
    UIElements.alumnoNombre = document.getElementById('alumno-nombre');
    UIElements.alumnoApellido = document.getElementById('alumno-apellido');
    UIElements.alumnoDNI = document.getElementById('alumno-dni');
    UIElements.comentario = document.getElementById('comentario');

    // Éxito
    UIElements.googleReviewSection = document.getElementById('google-review-section');

    try {
        // Obtener el ID del ticket desde la URL
        const urlParams = new URLSearchParams(window.location.search);
        ticketId = urlParams.get('ticket');

        if (!ticketId) {
            throw new Error('No se proporcionó ningún ticket en la URL.');
        }

        // Validar el ticket
        await validarTicket(ticketId);

    } catch (error) {
        console.error("Error al inicializar la encuesta:", error);
        mostrarError(error.message);
    }
});

/**
 * Valida el ticket contra Firestore.
 * @param {string} id - El ID del documento en 'sfd_enlaces_activos'.
 */
async function validarTicket(id) {
    try {
        const ticketRef = doc(db, 'sfd_enlaces_activos', id);
        const ticketSnap = await getDoc(ticketRef);

        if (!ticketSnap.exists()) {
            throw new Error('Este enlace de encuesta no existe.');
        }

        const data = ticketSnap.data();
        const ahora = Timestamp.now();

        if (ahora > data.expira) {
            throw new Error('Este enlace de encuesta ha expirado.');
        }

        // ¡Ticket válido!
        ticketData = data;
        await mostrarFormulario();

    } catch (error) {
        console.error("Error de validación de ticket:", error);
        mostrarError(error.message);
    }
}

/**
 * Muestra el formulario y carga la información de la clase.
 */
async function mostrarFormulario() {
    // Cargar información de la clase
    try {
        // Promesas para obtener datos de aula y docente
        const aulaPromise = getDoc(doc(db, 'sfd_aulas', ticketData.id_aula));
        const docentePromise = getDoc(doc(db, 'sfd_docentes', ticketData.id_docente));

        const [aulaSnap, docenteSnap] = await Promise.all([aulaPromise, docentePromise]);

        if (aulaSnap.exists()) {
            UIElements.infoAula.textContent = aulaSnap.data().codigo_aula || 'No disponible';
        }
        if (docenteSnap.exists()) {
            UIElements.infoDocente.textContent = docenteSnap.data().nombre_completo || 'No disponible';
        }
        UIElements.infoSesion.textContent = ticketData.sesion || 'N/A';

    } catch (error) {
        console.error("Error cargando info de clase:", error);
        UIElements.infoAula.textContent = 'Error al cargar';
        UIElements.infoDocente.textContent = 'Error al cargar';
    }
    
    // ✅ Verificar si ya votó usando LocalStorage
    if (yaVoto(ticketId)) {
        UIElements.loadingState.classList.add('hidden');
        mostrarError('Ya has enviado tu respuesta para esta encuesta. Solo se permite un voto por persona.');
        return;
    }
    
    // Configurar listeners del formulario
    setupFormListeners();

    // Mostrar el formulario
    UIElements.loadingState.classList.add('hidden');
    UIElements.formState.classList.remove('hidden');
}

/**
 * Configura los event listeners para el formulario (estrellas, submit).
 */
function setupFormListeners() {
    // Listeners para las estrellas
    const ratingMessages = {
        0: 'Selecciona una calificación',
        1: 'Muy Malo',
        2: 'Malo',
        3: 'Regular',
        4: 'Bueno',
        5: '¡Excelente!'
    };

    UIElements.stars.forEach(star => {
        star.addEventListener('mouseover', () => {
            const rating = parseInt(star.dataset.rating);
            UIElements.stars.forEach((s, i) => {
                s.classList.toggle('hovered', i < rating);
            });
        });

        star.addEventListener('mouseout', () => {
            UIElements.stars.forEach(s => s.classList.remove('hovered'));
        });

        star.addEventListener('click', () => {
            calificacionSeleccionada = parseInt(star.dataset.rating);
            UIElements.calificacionInput.value = calificacionSeleccionada;
            UIElements.ratingText.textContent = ratingMessages[calificacionSeleccionada];
            UIElements.stars.forEach((s, i) => {
                s.classList.toggle('selected', i < calificacionSeleccionada);
            });
            // Ocultar error si ya seleccionó
            UIElements.formError.classList.add('hidden');
        });
    });

    // Listener para el envío del formulario
    UIElements.encuestaForm.addEventListener('submit', handleFormSubmit);
}

/**
 * Maneja el envío del formulario.
 * @param {Event} e
 */
async function handleFormSubmit(e) {
    e.preventDefault();
    UIElements.submitButton.disabled = true;
    UIElements.submitButton.textContent = 'Enviando...';
    UIElements.formError.classList.add('hidden');

    try {
        // 1. Validar que la calificación se haya seleccionado
        if (calificacionSeleccionada === 0) {
            throw new Error('Por favor, selecciona una calificación (de 1 a 5 estrellas).');
        }

        // 2. Recopilar datos
        const respuesta = {
            // IDs de referencia (ticketId es esperado por las reglas)
            ticketId: ticketId, 
            id_aula: ticketData.id_aula,
            id_docente: ticketData.id_docente,
            sesion: ticketData.sesion,
            
            // Respuesta (calificacion_estrellas es esperado por las reglas)
            calificacion_estrellas: calificacionSeleccionada, 
            comentario: UIElements.comentario.value || null,
            
            // Datos opcionales del alumno
            alumno_nombre: UIElements.alumnoNombre.value || null,
            alumno_apellido: UIElements.alumnoApellido.value || null,
            alumno_dni: UIElements.alumnoDNI.value || null,
            
            // Metadatos (timestamp es esperado por las reglas)
            timestamp: serverTimestamp(),
            es_anonimo: !UIElements.alumnoNombre.value && !UIElements.alumnoDNI.value,
        };

        // 3. Guardar en Firestore
        await addDoc(collection(db, 'sfd_encuestas_respuestas'), respuesta);

        // ✅ Marcar como votado en LocalStorage
        marcarComoVotado(ticketId);

// 4. Mostrar estado de éxito
console.log("Encuesta enviada con éxito.");
UIElements.formState.classList.add('hidden');
UIElements.successState.classList.remove('hidden');

// 5. Mostrar enlace de Google si la calificación fue 5
if (calificacionSeleccionada === 5) {
    UIElements.googleReviewSection.classList.remove('hidden');
}

// ✅ NUEVO: Redirección automática después de 3 segundos
setTimeout(() => {
    console.log('🔄 Redirigiendo a página principal...');
    window.location.href = 'https://institutoperuanochino.pe/';
}, 3000); // 3 segundos para que lean el mensaje de agradecimiento

    } catch (error) {
        console.error("Error al enviar la encuesta:", error);
        UIElements.formErrorText.textContent = error.message;
        UIElements.formError.classList.remove('hidden');
        UIElements.submitButton.disabled = false;
        UIElements.submitButton.textContent = 'Enviar Encuesta';
    }
}

/**
 * Muestra un mensaje de error general (para tickets inválidos).
 * @param {string} message
 */
function mostrarError(message) {
    UIElements.loadingState.classList.add('hidden');
    UIElements.invalidMessage.textContent = message;
    UIElements.invalidState.classList.remove('hidden');
}