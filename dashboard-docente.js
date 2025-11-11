/**
 * js/dashboard-docente.js
 * Lógica del Dashboard del Docente
 * Muestra estadísticas y comentarios anónimos de las encuestas del docente
 */

// --- Importaciones de Núcleo ---
import { auth, db } from './firebase-config.js';
import { signOut } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { 
    doc, 
    getDoc, 
    collection, 
    query, 
    where, 
    getDocs,
    orderBy,
    limit
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { protectPage } from './auth-guard.js';
import { formatFechaPeru } from './utils/fecha-utils.js';

// --- Elementos del DOM ---
let elements = {};

/**
 * Punto de entrada principal
 */
document.addEventListener('DOMContentLoaded', async () => {
    
    // Capturar elementos del DOM
elements = {
    userNameDisplay: document.getElementById('user-name-display'),
    userEmailDisplay: document.getElementById('user-email-display'),
    logoutButton: document.getElementById('logout-button'),
    
    // Filtros
    filtroAula: document.getElementById('filtro-aula'),
    filtroFechaComentarios: document.getElementById('filtro-fecha-comentarios'),
    filtroAulaComentarios: document.getElementById('filtro-aula-comentarios'),
    resetFiltrosComentarios: document.getElementById('reset-filtros-comentarios'),
    
    // Paginación
    paginacionContainer: document.getElementById('paginacion-container'),
    comentariosInicio: document.getElementById('comentarios-inicio'),
    comentariosFin: document.getElementById('comentarios-fin'),
    comentariosTotal: document.getElementById('comentarios-total'),
    paginaActual: document.getElementById('pagina-actual'),
    pagAnterior: document.getElementById('pag-anterior'),
    pagSiguiente: document.getElementById('pag-siguiente'),
    
    promedioGlobal: document.getElementById('promedio-global'),
    totalEncuestas: document.getElementById('total-encuestas'),
    totalAulas: document.getElementById('total-aulas'),
    aulasTableContainer: document.getElementById('aulas-table-container'),
    comentariosContainer: document.getElementById('comentarios-container')
};

    try {
        // 1. Proteger la página (solo docentes)
        const { user } = await protectPage(['docente']);
        
        // 2. Inicializar el dashboard
        await initializeDashboard(user);

    } catch (error) {
        console.error("Error de autenticación:", error);
        window.location.href = 'login.html';
    }
});

/**
 * Inicializa el dashboard del docente
 */
async function initializeDashboard(user) {
    try {
        // Mostrar email del usuario
        if (elements.userEmailDisplay) {
            elements.userEmailDisplay.textContent = user.email;
        }

        // Configurar botón de logout
        if (elements.logoutButton) {
            elements.logoutButton.addEventListener('click', () => {
                signOut(auth).then(() => {
                    window.location.href = 'login.html';
                }).catch((error) => {
                    console.error('Error al cerrar sesión:', error);
                });
            });
        }

        // PASO 1: Obtener el docente_id del usuario actual
        const userDocRef = doc(db, 'sfd_usuarios', user.uid);
        const userDocSnap = await getDoc(userDocRef);

        if (!userDocSnap.exists()) {
            throw new Error('No se encontró el registro del usuario.');
        }

        const userData = userDocSnap.data();
        const docenteId = userData.docente_id;

        if (!docenteId) {
            throw new Error('Tu usuario no está vinculado a un registro de docente. Contacta al administrador.');
        }

        // PASO 2: Cargar todas las encuestas del docente
        const encuestasRef = collection(db, 'sfd_encuestas_respuestas');
        const q = query(
            encuestasRef, 
            where('id_docente', '==', docenteId),
            orderBy('timestamp', 'desc')
        );
        
        const encuestasSnap = await getDocs(q);

if (encuestasSnap.empty) {
    await mostrarSinDatos(user);
    return;
}

        // PASO 3: Procesar y calcular estadísticas
        const encuestas = [];
        encuestasSnap.forEach(doc => {
            encuestas.push({ id: doc.id, ...doc.data() });
        });

        // Calcular métricas
        const estadisticas = calcularEstadisticas(encuestas);

// Cargar nombres de aulas
const estadisticasConAulas = await cargarNombresAulas(estadisticas.por_aula);
const comentariosConAulas = await agregarNombresAulasAComentarios(estadisticas.comentarios);

// PASO 4: Renderizar datos
renderMetricasPrincipales(estadisticas);
renderTablaAulas(estadisticasConAulas);

// ✅ Inicializar filtros y paginación
inicializarFiltros(estadisticasConAulas, comentariosConAulas);
renderComentariosPaginados(comentariosConAulas, 1);

// Cargar nombre del docente
cargarNombreDocente(user.uid);

// Quitar loader
document.body.classList.remove('loading');

    } catch (error) {
        console.error("Error al inicializar dashboard:", error);
        mostrarError(error.message);
    }
}

/**
 * Calcula todas las estadísticas a partir de las encuestas
 */
function calcularEstadisticas(encuestas) {
    const total = encuestas.length;
    
    // Promedio global
    const sumaEstrellas = encuestas.reduce((acc, enc) => acc + enc.calificacion_estrellas, 0);
    const promedioGlobal = (sumaEstrellas / total).toFixed(1);

    // Agrupar por aula
    const porAula = {};
    
    encuestas.forEach(enc => {
        const aulaId = enc.id_aula;
        
        if (!porAula[aulaId]) {
            porAula[aulaId] = {
                aula_id: aulaId,
                encuestas: [],
                total: 0,
                suma: 0
            };
        }
        
        porAula[aulaId].encuestas.push(enc);
        porAula[aulaId].total += 1;
        porAula[aulaId].suma += enc.calificacion_estrellas;
    });

    // Calcular promedios por aula y obtener última fecha
    const estadisticasPorAula = Object.values(porAula).map(aula => {
        const promedio = (aula.suma / aula.total).toFixed(1);
        
        // Obtener la última fecha (ya está ordenado por timestamp desc)
        const ultimaFecha = aula.encuestas[0].timestamp;
        
        return {
            aula_id: aula.aula_id,
            promedio: parseFloat(promedio),
            total: aula.total,
            ultima_fecha: ultimaFecha
        };
    });

    // Ordenar por promedio descendente
    estadisticasPorAula.sort((a, b) => b.promedio - a.promedio);

// Comentarios (todos los que tienen texto)
const comentarios = encuestas
    .filter(enc => enc.comentario && enc.comentario.trim() !== '')
    .map(enc => ({
        aula_id: enc.id_aula,
        estrellas: enc.calificacion_estrellas,
        comentario: enc.comentario,
        fecha: enc.timestamp
    }));

    return {
        promedio_global: parseFloat(promedioGlobal),
        total_encuestas: total,
        total_aulas: Object.keys(porAula).length,
        por_aula: estadisticasPorAula,
        comentarios: comentarios
    };
}

/**
 * Carga los nombres de las aulas desde Firestore
 */
async function cargarNombresAulas(estadisticasAulas) {
    const aulasConNombres = [];
    
    for (const stat of estadisticasAulas) {
        try {
            const aulaDocRef = doc(db, 'sfd_aulas', stat.aula_id);
            const aulaSnap = await getDoc(aulaDocRef);
            
            const aulaNombre = aulaSnap.exists() 
                ? aulaSnap.data().codigo_aula 
                : 'Aula Desconocida';
            
            aulasConNombres.push({
                ...stat,
                aula_codigo: aulaNombre
            });
        } catch (error) {
            console.error(`Error cargando aula ${stat.aula_id}:`, error);
            aulasConNombres.push({
                ...stat,
                aula_codigo: 'Error al cargar'
            });
        }
    }
    
    return aulasConNombres;
}

/**
 * ✅ NUEVO: Agrega nombres de aulas a los comentarios
 */
async function agregarNombresAulasAComentarios(comentarios) {
    const comentariosConNombres = [];
    
    for (const com of comentarios) {
        try {
            const aulaDocRef = doc(db, 'sfd_aulas', com.aula_id);
            const aulaSnap = await getDoc(aulaDocRef);
            
            const aulaNombre = aulaSnap.exists() 
                ? aulaSnap.data().codigo_aula 
                : 'Aula Desconocida';
            
            comentariosConNombres.push({
                ...com,
                aula_codigo: aulaNombre
            });
        } catch (error) {
            console.error(`Error cargando aula ${com.aula_id}:`, error);
            comentariosConNombres.push({
                ...com,
                aula_codigo: 'Error al cargar'
            });
        }
    }
    
    return comentariosConNombres;
}

/**
 * Renderiza las métricas principales (cards superiores)
 */
function renderMetricasPrincipales(estadisticas) {
    elements.promedioGlobal.innerHTML = `
        <span class="text-4xl font-bold">${estadisticas.promedio_global}</span>
        <span class="text-lg text-gray-500">/5</span>
    `;
    
    elements.totalEncuestas.textContent = estadisticas.total_encuestas;
    elements.totalAulas.textContent = estadisticas.total_aulas;
}

/**
 * Renderiza la tabla de estadísticas por aula
 */
function renderTablaAulas(aulasConNombres) {
    if (aulasConNombres.length === 0) {
        elements.aulasTableContainer.innerHTML = `
            <p class="text-center text-gray-500 py-4">No hay datos disponibles.</p>
        `;
        return;
    }

    let tableHtml = `
        <table class="min-w-full divide-y divide-gray-200">
            <thead class="bg-gray-50">
                <tr>
                    <th scope="col" class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Aula</th>
                    <th scope="col" class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Promedio</th>
                    <th scope="col" class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Total Encuestas</th>
                    <th scope="col" class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Última Evaluación</th>
                </tr>
            </thead>
            <tbody class="divide-y divide-gray-200 bg-white">
    `;
    
    aulasConNombres.forEach(aula => {
        const estrellas = renderEstrellas(aula.promedio);
        const fechaFormateada = formatFechaPeru(aula.ultima_fecha);
        
        tableHtml += `
            <tr>
                <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">${aula.aula_codigo}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    <div class="flex items-center">
                        ${estrellas}
                        <span class="ml-2 font-semibold">${aula.promedio}</span>
                    </div>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${aula.total}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${fechaFormateada}</td>
            </tr>
        `;
    });
    
    tableHtml += `</tbody></table>`;
    elements.aulasTableContainer.innerHTML = tableHtml;
}

/**
 * Genera HTML de estrellas según el promedio
 */
function renderEstrellas(promedio) {
    const estrellasLlenas = Math.floor(promedio);
    const tieneMedia = (promedio % 1) >= 0.5;
    const estrellasVacias = 5 - estrellasLlenas - (tieneMedia ? 1 : 0);
    
    let html = '<div class="flex items-center">';
    
    // Estrellas llenas
    for (let i = 0; i < estrellasLlenas; i++) {
        html += `
            <svg class="w-5 h-5 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/>
            </svg>
        `;
    }
    
    // Media estrella
    if (tieneMedia) {
        html += `
            <svg class="w-5 h-5 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" opacity="0.5"/>
            </svg>
        `;
    }
    
    // Estrellas vacías
    for (let i = 0; i < estrellasVacias; i++) {
        html += `
            <svg class="w-5 h-5 text-gray-300" fill="currentColor" viewBox="0 0 20 20">
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/>
            </svg>
        `;
    }
    
    html += '</div>';
    return html;
}

/**
 * Muestra mensaje cuando no hay datos
 */
async function mostrarSinDatos(user) {
    // ✅ PRIMERO: Cargar el nombre del docente
    await cargarNombreDocente(user.uid);
    
    document.body.classList.remove('loading');
    
    elements.promedioGlobal.textContent = '-';
    elements.totalEncuestas.textContent = '0';
    elements.totalAulas.textContent = '0';
    
    elements.aulasTableContainer.innerHTML = `
        <div class="text-center py-12">
            <p class="text-gray-500 text-lg mb-2">Aún no has recibido evaluaciones</p>
            <p class="text-gray-400 text-sm">Cuando tus alumnos completen encuestas, aparecerán aquí</p>
        </div>
    `;
    
    elements.comentariosContainer.innerHTML = `
        <div class="text-center py-12">
            <p class="text-gray-500">No hay comentarios disponibles</p>
        </div>
    `;
}

/**
 * Muestra mensaje de error
 */
function mostrarError(mensaje) {
    document.body.classList.remove('loading');
    
    const errorHtml = `
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <div class="bg-red-50 border-l-4 border-red-400 p-4 rounded-lg">
                <div class="flex">
                    <div class="flex-shrink-0">
                        <svg class="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                            <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clip-rule="evenodd" />
                        </svg>
                    </div>
                    <div class="ml-3">
                        <h3 class="text-sm font-medium text-red-800">Error al cargar el dashboard</h3>
                        <p class="text-sm text-red-700 mt-2">${mensaje}</p>
                        <p class="text-sm text-red-600 mt-2">Por favor, contacta al administrador del sistema.</p>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    document.querySelector('main').innerHTML = errorHtml;
}

/**
 * ✅ NUEVO: Carga el nombre del docente
 */
async function cargarNombreDocente(uid) {
    try {
        const userDocRef = doc(db, 'sfd_usuarios', uid);
        const userDocSnap = await getDoc(userDocRef);
        
        if (userDocSnap.exists()) {
            const userData = userDocSnap.data();
            const docenteId = userData.docente_id;
            
            if (docenteId) {
                const docenteDocRef = doc(db, 'sfd_docentes', docenteId);
                const docenteDocSnap = await getDoc(docenteDocRef);
                
                if (docenteDocSnap.exists()) {
                    const docenteData = docenteDocSnap.data();
                    elements.userNameDisplay.textContent = docenteData.nombre_completo || 'Docente';
                    return;
                }
            }
        }
        
        elements.userNameDisplay.textContent = 'Docente';
    } catch (error) {
        console.error('Error cargando nombre:', error);
        elements.userNameDisplay.textContent = 'Docente';
    }
}

/**
 * ✅ NUEVO: Variables globales para filtros y paginación
 */
let todasLasEstadisticas = [];
let todosLosComentarios = [];
let comentariosMostrados = [];
let paginaActualNum = 1;
const COMENTARIOS_POR_PAGINA = 20;

/**
 * ✅ NUEVO: Inicializa los filtros
 */
function inicializarFiltros(estadisticas, comentarios) {
    todasLasEstadisticas = estadisticas;
    todosLosComentarios = comentarios;
    
    // Poblar select de aulas
    const aulasUnicas = [...new Set(estadisticas.map(e => e.aula_codigo))].sort();
    
    const optionsHtml = '<option value="">Todas las aulas</option>' + 
        aulasUnicas.map(aula => `<option value="${aula}">${aula}</option>`).join('');
    
    elements.filtroAula.innerHTML = optionsHtml;
    elements.filtroAulaComentarios.innerHTML = optionsHtml;
    
    // Listeners de filtros
    elements.filtroAula.addEventListener('change', aplicarFiltroTabla);
    elements.filtroFechaComentarios.addEventListener('change', aplicarFiltrosComentarios);
    elements.filtroAulaComentarios.addEventListener('change', aplicarFiltrosComentarios);
    elements.resetFiltrosComentarios.addEventListener('click', resetearFiltrosComentarios);
    
    // Listeners de paginación
    elements.pagAnterior.addEventListener('click', () => cambiarPagina(-1));
    elements.pagSiguiente.addEventListener('click', () => cambiarPagina(1));
}

/**
 * ✅ NUEVO: Aplica filtro a la tabla de aulas
 */
function aplicarFiltroTabla() {
    const aulaSeleccionada = elements.filtroAula.value;
    
    const estadisticasFiltradas = aulaSeleccionada 
        ? todasLasEstadisticas.filter(e => e.aula_codigo === aulaSeleccionada)
        : todasLasEstadisticas;
    
    renderTablaAulas(estadisticasFiltradas);
}

/**
 * ✅ NUEVO: Aplica filtros a comentarios
 */
function aplicarFiltrosComentarios() {
    const fechaSeleccionada = elements.filtroFechaComentarios.value;
    const aulaSeleccionada = elements.filtroAulaComentarios.value;
    
    let comentariosFiltrados = [...todosLosComentarios];
    
    if (fechaSeleccionada) {
        const fechaObj = new Date(fechaSeleccionada + 'T00:00:00-05:00');
        comentariosFiltrados = comentariosFiltrados.filter(c => {
            const fechaComentario = c.fecha.toDate();
            return fechaComentario.toDateString() === fechaObj.toDateString();
        });
    }
    
    if (aulaSeleccionada) {
        comentariosFiltrados = comentariosFiltrados.filter(c => c.aula_codigo === aulaSeleccionada);
    }
    
    renderComentariosPaginados(comentariosFiltrados, 1);
}

/**
 * ✅ NUEVO: Resetea los filtros de comentarios
 */
function resetearFiltrosComentarios() {
    elements.filtroFechaComentarios.value = '';
    elements.filtroAulaComentarios.value = '';
    renderComentariosPaginados(todosLosComentarios, 1);
}

/**
 * ✅ NUEVO: Renderiza comentarios con paginación
 */
async function renderComentariosPaginados(comentarios, pagina) {
    comentariosMostrados = comentarios;
    paginaActualNum = pagina;
    
    const totalComentarios = comentarios.length;
    const totalPaginas = Math.ceil(totalComentarios / COMENTARIOS_POR_PAGINA);
    
    if (totalComentarios === 0) {
        elements.comentariosContainer.innerHTML = `
            <p class="text-center text-gray-500 py-4">No hay comentarios disponibles.</p>
        `;
        elements.paginacionContainer.classList.add('hidden');
        return;
    }
    
    // Calcular rango
    const inicio = (pagina - 1) * COMENTARIOS_POR_PAGINA;
    const fin = Math.min(inicio + COMENTARIOS_POR_PAGINA, totalComentarios);
    const comentariosPagina = comentarios.slice(inicio, fin);
    
// Renderizar comentarios (ya tienen aula_codigo)
let comentariosHtml = '';

comentariosPagina.forEach(com => {
    const estrellas = renderEstrellas(com.estrellas);
    const fechaFormateada = formatFechaPeru(com.fecha);
    const aulaNombre = com.aula_codigo || 'Aula Desconocida';
        
        comentariosHtml += `
            <div class="bg-gray-50 rounded-lg p-4 border border-gray-200">
                <div class="flex items-center justify-between mb-2">
                    <div class="flex items-center space-x-4">
                        <span class="text-sm font-medium text-gray-700">🏫 ${aulaNombre}</span>
                        <div class="flex items-center">
                            ${estrellas}
                        </div>
                    </div>
                    <span class="text-xs text-gray-500">📅 ${fechaFormateada}</span>
                </div>
                <p class="text-sm text-gray-800">"${com.comentario}"</p>
            </div>
        `;
    });
    
    elements.comentariosContainer.innerHTML = comentariosHtml;
    
    // Actualizar controles de paginación
    elements.comentariosInicio.textContent = inicio + 1;
    elements.comentariosFin.textContent = fin;
    elements.comentariosTotal.textContent = totalComentarios;
    elements.paginaActual.textContent = `Página ${pagina} de ${totalPaginas}`;
    
    elements.pagAnterior.disabled = pagina === 1;
    elements.pagSiguiente.disabled = pagina === totalPaginas;
    
    elements.paginacionContainer.classList.remove('hidden');
}

/**
 * ✅ NUEVO: Cambia de página
 */
function cambiarPagina(direccion) {
    const nuevaPagina = paginaActualNum + direccion;
    renderComentariosPaginados(comentariosMostrados, nuevaPagina);
}