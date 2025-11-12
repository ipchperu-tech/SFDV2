/**
 * js/modulos/aulas.js
 * ✅ VERSIÓN 3.0: Botones Cerrar y Avanzar Ciclo mejorados
 * 
 * CAMBIOS PRINCIPALES (ENTREGA 3):
 * - Renderizado correcto de botones según estado:
 *   * Próxima: Editar + Eliminar
 *   * En Curso: Solo Editar
 *   * Finalizado: Avanzar Ciclo + Cerrar
 * - Modal de doble confirmación para Cerrar Aula
 * - Modal completo con formulario para Avanzar Ciclo
 * - Función cerrar: mueve a sfd_aulas_historico
 * - Función avanzar: archiva ciclo anterior + crea nuevo ciclo
 */

// --- Importaciones de Núcleo ---
import { db } from '../firebase-config.js';
import {
    collection,
    doc,
    addDoc,
    onSnapshot,
    query,
    getDocs,
    writeBatch,
    Timestamp,
    updateDoc,
    deleteDoc,
    where,
    setDoc
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// ✅ Importar utilidades actualizadas
import { 
    getHoyPeru,
    getAhoraPeru,
    formatFechaPeru, 
    calcularEstadoAulaConHora,
    crearFechaPeru,
    combinarFechaHorario,
    esFeriado as verificarFeriado,
    sesionEstaCompletada,
    aulaPuedeAvanzarOCerrar
} from '../utils/fecha-utils.js';

// ✅ NUEVO: Importar configuración centralizada de feriados
import { FERIADOS_ACTIVOS } from '../config/feriados.js';

// --- Caché del Módulo ---
let docenteCache = new Map();
let aulasCache = new Map();
let sesionesCache = new Map();

// ✅ Array de feriados (importado desde configuración centralizada)
const FERIADOS = FERIADOS_ACTIVOS;

// --- Configuración de Programas ---
const PROGRAMAS = {
    'Chino General': {
        nombre: 'Chino General',
        ciclos: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
        frecuencias: {
            '3x': {
                label: 'Lun, Mié y Vie',
                dias: [1, 3, 5],
                sesiones: 36,
                duracion: '1h 45min'
            },
            'mar-jue': {
                label: 'Mar y Jue',
                dias: [2, 4],
                sesiones: 24,
                duracion: '2h 40min'
            },
            'sab-dom': {
                label: 'Sáb y Dom',
                dias: [6, 0],
                sesiones: 24,
                duracion: '2h 40min'
            }
        }
    },
    'Chino Niños': {
        nombre: 'Chino Niños',
        ciclos: [1, 2, 3, 4, 5, 6],
        frecuencias: {
            '3x': {
                label: 'Lun, Mié y Vie',
                dias: [1, 3, 5],
                sesiones: 32,
                duracion: '1h 30min'
            },
            'mar-jue': {
                label: 'Mar y Jue',
                dias: [2, 4],
                sesiones: 24,
                duracion: '1h 30min'
            },
            'sab-dom': {
                label: 'Sáb y Dom',
                dias: [6, 0],
                sesiones: 24,
                duracion: '1h 30min'
            }
        }
    },
    'Importaciones': {
        nombre: 'Importaciones',
        ciclos: [1],
        frecuencias: {
            'lun-mie': {
                label: 'Lun y Mié',
                dias: [1, 3],
                sesiones: 8,
                duracion: '2h'
            },
            'mar-jue': {
                label: 'Mar y Jue',
                dias: [2, 4],
                sesiones: 8,
                duracion: '2h'
            },
            'sab-dom': {
                label: 'Sáb y Dom',
                dias: [6, 0],
                sesiones: 8,
                duracion: '2h'
            }
        }
    }
};

// --- Elementos del DOM ---
let form, container, buttonShow, buttonCancel, buttonSave, errorDisplay;
let programaSelect, cicloSelect, frecuenciaContainer, totalSesionesInput;
let docenteSelect, fechaInicioInput, fechaFinInput, horarioInicioInput, horarioFinInput;
let tableContainer;

// Modal de edición
let editModal, editForm, editAulaId, editAulaCodigo, editAulaDocente;
let editAulaHorarioInicio, editAulaHorarioFin, saveEditButton, editErrorDisplay;

// ✅ NUEVO: Modales de Cerrar y Avanzar
let cerrarModal, cerrarConfirmInput, cerrarButton, cerrarCancelButton, cerrarErrorDisplay, cerrarAulaIdHidden;
let avanzarModal, avanzarForm, avanzarAulaIdHidden, avanzarCicloNuevo;
let avanzarDocenteSelect, avanzarFechaInicio, avanzarFechaFin, avanzarHorarioInicio, avanzarHorarioFin;
let avanzarButton, avanzarCancelButton, avanzarErrorDisplay;

// Variables de estado
let programaSeleccionado = null;
let frecuenciaSeleccionada = null;

/**
 * Función principal de inicialización del módulo de Aulas.
 */
export function initAulas(user, role) {
    console.log("Módulo de Aulas inicializado (v3.0 - Cerrar/Avanzar mejorados).");
    
    // Capturar elementos del formulario
    form = document.getElementById('new-aula-form');
    container = document.getElementById('new-aula-form-container');
    buttonShow = document.getElementById('show-aula-form-button');
    buttonCancel = document.getElementById('cancel-aula-form-button');
    buttonSave = document.getElementById('save-aula-button');
    errorDisplay = document.getElementById('form-aula-error');
    
    // Selects y campos
    programaSelect = document.getElementById('programa_select');
    cicloSelect = document.getElementById('ciclo_actual_select');
    frecuenciaContainer = document.getElementById('frecuencia_container');
    totalSesionesInput = document.getElementById('total_sesiones');
    docenteSelect = document.getElementById('id_docente_asignado');
    fechaInicioInput = document.getElementById('fecha_inicio');
    fechaFinInput = document.getElementById('fecha_fin');
    horarioInicioInput = document.getElementById('horario_inicio');
    horarioFinInput = document.getElementById('horario_fin');
    tableContainer = document.getElementById('aulas-table-container');

    // Modal de edición
    editModal = document.getElementById('edit-aula-modal');
    if (editModal) {
        editForm = document.getElementById('edit-aula-form');
        editAulaId = document.getElementById('edit-aula-id');
        editAulaCodigo = document.getElementById('edit_aula_codigo');
        editAulaDocente = document.getElementById('edit_aula_docente');
        editAulaHorarioInicio = document.getElementById('edit_aula_horario_inicio');
        editAulaHorarioFin = document.getElementById('edit_aula_horario_fin');
        saveEditButton = document.getElementById('save-edit-aula-button');
        editErrorDisplay = document.getElementById('edit-aula-error');
        
        const cancelEditButton = editModal.querySelector('.btn-secondary');
        if (cancelEditButton) {
            cancelEditButton.addEventListener('click', () => editModal.classList.add('hidden'));
        }
        
        if (editForm) {
            editForm.addEventListener('submit', handleUpdateAula);
        }
    }
    
    // ✅ NUEVO: Capturar elementos del modal Cerrar Aula
    cerrarModal = document.getElementById('cerrar-aula-modal');
    if (cerrarModal) {
        cerrarConfirmInput = document.getElementById('cerrar-aula-confirm-input');
        cerrarButton = document.getElementById('cerrar-aula-confirm-button');
        cerrarCancelButton = document.getElementById('cerrar-aula-cancel-button');
        cerrarErrorDisplay = document.getElementById('cerrar-aula-error');
        cerrarAulaIdHidden = document.getElementById('cerrar-aula-id-hidden');
        
        // Listeners
        cerrarCancelButton.addEventListener('click', closeCerrarModal);
        cerrarButton.addEventListener('click', confirmarCerrarAula);
        cerrarConfirmInput.addEventListener('input', () => {
            const isValid = cerrarConfirmInput.value.toUpperCase() === 'CERRAR';
            cerrarButton.disabled = !isValid;
        });
    }
    
    // ✅ NUEVO: Capturar elementos del modal Avanzar Ciclo
    avanzarModal = document.getElementById('avanzar-ciclo-modal');
    if (avanzarModal) {
        avanzarForm = document.getElementById('avanzar-ciclo-form');
        avanzarAulaIdHidden = document.getElementById('avanzar-aula-id-hidden');
        avanzarCicloNuevo = document.getElementById('avanzar-ciclo-nuevo');
        avanzarDocenteSelect = document.getElementById('avanzar-docente-select');
        avanzarFechaInicio = document.getElementById('avanzar-fecha-inicio');
        avanzarFechaFin = document.getElementById('avanzar-fecha-fin');
        avanzarHorarioInicio = document.getElementById('avanzar-horario-inicio');
        avanzarHorarioFin = document.getElementById('avanzar-horario-fin');
        avanzarButton = document.getElementById('avanzar-ciclo-confirm-button');
        avanzarCancelButton = document.getElementById('avanzar-ciclo-cancel-button');
        avanzarErrorDisplay = document.getElementById('avanzar-ciclo-error');
        
        // Listeners
        avanzarCancelButton.addEventListener('click', closeAvanzarModal);
        avanzarForm.addEventListener('submit', confirmarAvanzarCiclo);
    }
    
    // Configurar listeners
    buttonShow.addEventListener('click', () => toggleAulaForm(true));
    buttonCancel.addEventListener('click', () => toggleAulaForm(false));
    form.addEventListener('submit', handleSaveAula);
    programaSelect.addEventListener('change', handleProgramaChange);
    cicloSelect.addEventListener('change', handleCicloChange);
    
    // Delegación de eventos para la tabla
    tableContainer.addEventListener('click', (e) => {
        const target = e.target;
        
        if (target.classList.contains('edit-aula-btn')) {
            const aulaId = target.dataset.id;
            openEditModal(aulaId);
        } else if (target.classList.contains('delete-aula-btn')) {
            const aulaId = target.dataset.id;
            handleDeleteAula(aulaId);
        } else if (target.classList.contains('avanzar-ciclo-btn')) {
            const aulaId = target.dataset.id;
            openAvanzarModal(aulaId);
        } else if (target.classList.contains('cerrar-aula-btn')) {
            const aulaId = target.dataset.id;
            openCerrarModal(aulaId);
        }
    });
    
    // Cargar datos iniciales
    loadDocentesIntoSelect();
    loadProgramasIntoSelect();
    listenForAulas();
}

/**
 * Muestra u oculta el formulario de nueva aula.
 */
function toggleAulaForm(show) {
    if (show) {
        container.classList.remove('hidden');
        buttonShow.classList.add('hidden');
        form.reset();
        errorDisplay.textContent = '';
        frecuenciaContainer.innerHTML = '';
        totalSesionesInput.value = '';
        cicloSelect.innerHTML = '<option value="">-- Primero selecciona un programa --</option>';
    } else {
        container.classList.add('hidden');
        buttonShow.classList.remove('hidden');
    }
}

/**
 * Carga los docentes en el select
 */
async function loadDocentesIntoSelect() {
    try {
        const docentesRef = collection(db, 'sfd_docentes');
        const docentesSnapshot = await getDocs(docentesRef);
        
        docenteCache.clear();
        docenteSelect.innerHTML = '<option value="">-- Selecciona un docente --</option>';
        
        docentesSnapshot.forEach(doc => {
            const docente = doc.data();
            docenteCache.set(doc.id, docente);
            docenteSelect.innerHTML += `<option value="${doc.id}">${docente.nombre_completo}</option>`;
        });
        
        console.log(`✅ ${docenteCache.size} docentes cargados`);
    } catch (error) {
        console.error("Error cargando docentes:", error);
    }
}

/**
 * Carga los programas en el select
 */
function loadProgramasIntoSelect() {
    programaSelect.innerHTML = '<option value="">-- Selecciona un programa --</option>';
    Object.keys(PROGRAMAS).forEach(key => {
        programaSelect.innerHTML += `<option value="${key}">${PROGRAMAS[key].nombre}</option>`;
    });
}

/**
 * Maneja el cambio de programa
 */
function handleProgramaChange() {
    const programaKey = programaSelect.value;
    
    if (!programaKey) {
        cicloSelect.innerHTML = '<option value="">-- Primero selecciona un programa --</option>';
        frecuenciaContainer.innerHTML = '';
        totalSesionesInput.value = '';
        programaSeleccionado = null;
        return;
    }
    
    programaSeleccionado = PROGRAMAS[programaKey];
    
    // Cargar ciclos
    cicloSelect.innerHTML = '<option value="">-- Selecciona un ciclo --</option>';
    programaSeleccionado.ciclos.forEach(ciclo => {
        cicloSelect.innerHTML += `<option value="${ciclo}">Ciclo ${ciclo}</option>`;
    });
    
    // Resetear frecuencia y sesiones
    frecuenciaContainer.innerHTML = '';
    totalSesionesInput.value = '';
    frecuenciaSeleccionada = null;
}

/**
 * Maneja el cambio de ciclo (y genera opciones de frecuencia)
 */
function handleCicloChange() {
    if (!programaSeleccionado || !cicloSelect.value) {
        frecuenciaContainer.innerHTML = '';
        totalSesionesInput.value = '';
        return;
    }
    
    // Generar opciones de frecuencia
    frecuenciaContainer.innerHTML = '<label class="form-label">Frecuencia de Clases</label><div class="grid grid-cols-3 gap-4">';
    
    Object.keys(programaSeleccionado.frecuencias).forEach(key => {
        const freq = programaSeleccionado.frecuencias[key];
        frecuenciaContainer.innerHTML += `
            <label class="freq-radio-label">
                <input type="radio" name="frecuencia" value="${freq.label}" class="freq-radio-input" data-sesiones="${freq.sesiones}">
                <span>${freq.label}</span>
                <span class="text-xs text-gray-500">${freq.sesiones} sesiones</span>
            </label>
        `;
    });
    
    frecuenciaContainer.innerHTML += '</div>';
    
    // Listener para cuando se seleccione una frecuencia
    const radioButtons = frecuenciaContainer.querySelectorAll('input[type="radio"]');
    radioButtons.forEach(radio => {
        radio.addEventListener('change', (e) => {
            frecuenciaSeleccionada = e.target.value;
            totalSesionesInput.value = e.target.dataset.sesiones;
        });
    });
}

/**
 * Maneja el guardado de una nueva aula
 */
async function handleSaveAula(e) {
    e.preventDefault();
    buttonSave.disabled = true;
    buttonSave.textContent = 'Guardando...';
    errorDisplay.textContent = '';

    try {
        const codigoAula = document.getElementById('codigo_aula').value;
        const programaKey = programaSelect.value;
        const cicloActual = parseInt(cicloSelect.value);
        const idDocente = docenteSelect.value;
        const fechaInicio = fechaInicioInput.value;
        const horarioInicio = horarioInicioInput.value;
        const horarioFin = horarioFinInput.value;
        const totalSesiones = parseInt(totalSesionesInput.value);

        if (!codigoAula || !programaKey || !cicloActual || !frecuenciaSeleccionada || 
            !idDocente || !fechaInicio || !horarioInicio || !horarioFin) {
            throw new Error('Todos los campos son obligatorios.');
        }

        const [year, month, day] = fechaInicio.split('-').map(Number);
        const fechaInicioPeru = crearFechaPeru(year, month, day);

// ✅ Calcular estado inicial del aula
const estadoInicial = calcularEstadoAulaConHora(
    Timestamp.fromDate(fechaInicioPeru),
    horarioInicio,
    null, // fecha_fin se calculará después
    horarioFin,
    { total: totalSesiones, completadas: 0 }
);

const aulaData = {
    codigo_aula: codigoAula,
    programa: programaKey,
    ciclo_actual: cicloActual,
    frecuencia: frecuenciaSeleccionada,
    id_docente_asignado: idDocente,
    fecha_inicio: Timestamp.fromDate(fechaInicioPeru),
    fecha_fin: null,
    horario_inicio: horarioInicio,
    horario_fin: horarioFin,
    total_sesiones: totalSesiones,
    estado: estadoInicial || 'Próxima' // Guardar estado calculado
};

        const aulasRef = collection(db, 'sfd_aulas');
        const aulaDocRef = await addDoc(aulasRef, aulaData);

        await generateCalendarWithTimestamps(aulaDocRef.id, aulaData);

        console.log(`✅ Aula "${codigoAula}" creada con ${totalSesiones} sesiones`);
        toggleAulaForm(false);

    } catch (error) {
        console.error('Error al guardar aula:', error);
        errorDisplay.textContent = `Error: ${error.message}`;
    } finally {
        buttonSave.disabled = false;
        buttonSave.textContent = 'Guardar Aula';
    }
}

        /**
 * ✅ NUEVO: Actualiza el estado del aula en Firestore si cambió
 */
async function actualizarEstadoSiCambio(aulaId, estadoActual, estadoCalculado) {
    if (estadoCalculado && estadoCalculado !== estadoActual) {
        try {
            const aulaRef = doc(db, 'sfd_aulas', aulaId);
            await updateDoc(aulaRef, { estado: estadoCalculado });
            console.log(`✅ Estado actualizado: ${aulaId} → ${estadoCalculado}`);
        } catch (error) {
            console.error(`❌ Error actualizando estado de ${aulaId}:`, error);
        }
    }
}

/**
 * Escucha cambios en la colección de aulas
 */
function listenForAulas() {
    const aulasRef = collection(db, 'sfd_aulas');
    const q = query(aulasRef);

    onSnapshot(q, async (snapshot) => {
        aulasCache.clear();
        sesionesCache.clear();

        const aulasPromises = snapshot.docs.map(async (aulaDoc) => {
            const aula = { id: aulaDoc.id, ...aulaDoc.data() };
            aulasCache.set(aulaDoc.id, aula);

            const sesionesRef = collection(db, `sfd_aulas/${aulaDoc.id}/sesiones`);
            const sesionesSnapshot = await getDocs(sesionesRef);

            sesionesSnapshot.forEach(sesionDoc => {
                sesionesCache.set(`${aulaDoc.id}_${sesionDoc.id}`, sesionDoc.data());
            });
        });

        await Promise.all(aulasPromises);
        renderAulasTable();

    }, (error) => {
        console.error("Error al escuchar aulas:", error);
        tableContainer.innerHTML = `<p class="text-center text-red-500 p-6">Error al cargar aulas.</p>`;
    });
}

/**
 * ✅ V3.1: Renderiza la tabla con diseño responsive
 */
function renderAulasTable() {
    let tableHtml = `
        <table class="min-w-full divide-y divide-gray-200">
            <thead class="bg-gray-50">
                <tr>
                    <th class="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500 whitespace-nowrap">Código</th>
                    <th class="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500 whitespace-nowrap">Programa</th>
                    <th class="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500 whitespace-nowrap">Ciclo</th>
                    <th class="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500 whitespace-nowrap">Docente</th>
                    <th class="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500 whitespace-nowrap">Frecuencia</th>
                    <th class="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500 whitespace-nowrap">Horario</th>
                    <th class="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500 whitespace-nowrap">Inicio</th>
                    <th class="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500 whitespace-nowrap">Fin</th>
                    <th class="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500 whitespace-nowrap">Sesiones</th>
                    <th class="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500 whitespace-nowrap">Estado</th>
                    <th class="px-4 py-3 text-right text-xs font-medium uppercase text-gray-500 whitespace-nowrap">Acciones</th>
                </tr>
            </thead>
            <tbody class="divide-y divide-gray-200 bg-white">
    `;
    
    if (aulasCache.size === 0) {
        tableHtml += `<tr><td colspan="11" class="px-6 py-4 text-center text-gray-500">No hay aulas registradas.</td></tr>`;
    } else {
        // Array para actualizar estados en paralelo (debe estar fuera del forEach)
        const promesasActualizacion = [];

        aulasCache.forEach(aula => {
    const docente = docenteCache.get(aula.id_docente_asignado);
    const docenteNombre = docente ? docente.nombre_completo : 'Sin asignar';
    
    const todasSesiones = Array.from(sesionesCache.entries())
        .filter(([key]) => key.startsWith(`${aula.id}_`))
        .map(([_, sesion]) => sesion);
            
            let sesionesCompletadas = 0;
            todasSesiones.forEach(sesion => {
                if (sesion.fin && sesionEstaCompletada(sesion.fin)) {
                    sesionesCompletadas++;
                }
            });
            
            const sesionesInfo = {
                total: aula.total_sesiones || 0,
                completadas: sesionesCompletadas
            };
            
// Calcular estado usando fecha + hora
const estadoCalculado = calcularEstadoAulaConHora(
    aula.fecha_inicio,
    aula.horario_inicio,
    aula.fecha_fin,
    aula.horario_fin,
    sesionesInfo
);

// ✅ Actualizar en BD si el estado cambió
if (estadoCalculado && estadoCalculado !== aula.estado) {
    promesasActualizacion.push(
        actualizarEstadoSiCambio(aula.id, aula.estado, estadoCalculado)
    );
}

const estadoFinal = estadoCalculado || aula.estado || 'Sin estado';
            
            let estadoBadge = '';
            if (estadoFinal === 'Próxima') {
                estadoBadge = '<span class="badge status-pending">Próxima</span>';
            } else if (estadoFinal === 'En Curso') {
                estadoBadge = '<span class="badge status-active">En Curso</span>';
            } else if (estadoFinal === 'Finalizado') {
                estadoBadge = '<span class="badge status-completed">Finalizado</span>';
            } else {
                estadoBadge = `<span class="badge">${estadoFinal}</span>`;
            }
            
            let accionesBotones = '';
            
            if (estadoFinal === 'Próxima') {
                accionesBotones = `
                    <button type="button" data-id="${aula.id}" class="edit-aula-btn text-blue-600 hover:text-blue-900 mr-3 whitespace-nowrap">Editar</button>
                    <button type="button" data-id="${aula.id}" class="delete-aula-btn text-red-600 hover:text-red-900 whitespace-nowrap">Eliminar</button>
                `;
            } else if (estadoFinal === 'En Curso') {
                accionesBotones = `
                    <button type="button" data-id="${aula.id}" class="edit-aula-btn text-blue-600 hover:text-blue-900 whitespace-nowrap">Editar</button>
                `;
            } else if (estadoFinal === 'Finalizado') {
                const programa = PROGRAMAS[aula.programa];
                const puedeAvanzar = programa && aula.ciclo_actual < programa.ciclos.length;
                
                accionesBotones = `
                    ${puedeAvanzar ? `<button type="button" data-id="${aula.id}" class="avanzar-ciclo-btn text-green-600 hover:text-green-900 mr-3 whitespace-nowrap">Avanzar Ciclo</button>` : ''}
                    <button type="button" data-id="${aula.id}" class="cerrar-aula-btn text-orange-600 hover:text-orange-900 whitespace-nowrap">Cerrar</button>
                `;
            }
            
            const horarioStr = `${aula.horario_inicio} - ${aula.horario_fin}`;
            
            tableHtml += `
                <tr data-id="${aula.id}">
                    <td class="px-4 py-4 text-sm font-medium text-gray-900 whitespace-nowrap">${aula.codigo_aula}</td>
                    <td class="px-4 py-4 text-sm text-gray-500 whitespace-nowrap">${aula.programa}</td>
                    <td class="px-4 py-4 text-sm text-gray-500 whitespace-nowrap">Ciclo ${aula.ciclo_actual}</td>
                    <td class="px-4 py-4 text-sm text-gray-500 whitespace-nowrap">${docenteNombre}</td>
                    <td class="px-4 py-4 text-sm text-gray-500 whitespace-nowrap">${aula.frecuencia}</td>
                    <td class="px-4 py-4 text-sm text-gray-500 whitespace-nowrap font-mono">${horarioStr}</td>
                    <td class="px-4 py-4 text-sm text-gray-500 whitespace-nowrap">${formatFechaPeru(aula.fecha_inicio)}</td>
                    <td class="px-4 py-4 text-sm text-gray-500 whitespace-nowrap">${aula.fecha_fin ? formatFechaPeru(aula.fecha_fin) : '-'}</td>
                    <td class="px-4 py-4 text-sm text-gray-500 whitespace-nowrap">${sesionesCompletadas} / ${aula.total_sesiones}</td>
                    <td class="px-4 py-4 text-sm whitespace-nowrap">${estadoBadge}</td>
                    <td class="px-4 py-4 text-right text-sm font-medium whitespace-nowrap">${accionesBotones}</td>
 </tr>
            `;
        }); // ← Fin del forEach
        
        // ✅ Ejecutar actualizaciones de estado en paralelo
        if (promesasActualizacion.length > 0) {
            Promise.all(promesasActualizacion).then(() => {
                console.log(`✅ ${promesasActualizacion.length} estados actualizados`);
            });
        }
    } // ← Fin del else
    
    tableHtml += `</tbody></table>`;
    tableContainer.innerHTML = tableHtml;
    
    console.log(`✅ ${aulasCache.size} aulas renderizadas (responsive)`);
}

/**
 * ✅ V2.0: Genera sesiones con timestamps completos (inicio y fin)
 */
async function generateCalendarWithTimestamps(aulaId, aulaData) {
    const frecuencia = aulaData.frecuencia;
    const totalSesiones = aulaData.total_sesiones;
    const fechaInicio = aulaData.fecha_inicio.toDate();
    const horarioInicio = aulaData.horario_inicio;
    const horarioFin = aulaData.horario_fin;
    
    // Mapeo de frecuencias
    const FRECUENCIA_A_DIAS = {
        'Lun, Mié y Vie': [1, 3, 5],
        'Mar y Jue': [2, 4],
        'Sáb y Dom': [6, 0],
        'Lun y Mié': [1, 3]
    };
    
    const diasSemana = FRECUENCIA_A_DIAS[frecuencia];
    if (!diasSemana) {
        throw new Error(`Frecuencia no reconocida: ${frecuencia}`);
    }
    
    const sesionesRef = collection(db, `sfd_aulas/${aulaId}/sesiones`);
    const batch = writeBatch(db);
    
    let currentDate = new Date(fechaInicio);
    let sesionesCreadas = 0;
    let ultimaFechaSesion = null;
    
    console.log(`📅 Generando ${totalSesiones} sesiones con timestamps completos...`);
    
    for (let i = 1; i <= totalSesiones; i++) {
        // Buscar el siguiente día válido
        while (true) {
            const diaSemana = currentDate.getDay();
            
            if (diasSemana.includes(diaSemana) && !verificarFeriado(currentDate, FERIADOS)) {
                break;
            }
            
            if (currentDate.getTime() - fechaInicio.getTime() > 365 * 24 * 60 * 60 * 1000) {
                console.error(`⚠️ Se superó el año sin completar calendario`);
                break;
            }
            
            currentDate.setDate(currentDate.getDate() + 1);
        }
        
        // Crear fecha base (solo día, sin hora)
        const fechaSesion = crearFechaPeru(
            currentDate.getFullYear(),
            currentDate.getMonth() + 1,
            currentDate.getDate()
        );
        
        // Crear timestamps completos combinando fecha + horarios
        const timestampInicio = combinarFechaHorario(fechaSesion, horarioInicio);
        const timestampFin = combinarFechaHorario(fechaSesion, horarioFin);
        
        const sesionDoc = doc(sesionesRef);
        batch.set(sesionDoc, {
            sesion: i,
            fecha: Timestamp.fromDate(fechaSesion),
            inicio: Timestamp.fromDate(timestampInicio),
            fin: Timestamp.fromDate(timestampFin),
            estado: 'programada'
        });
        
        ultimaFechaSesion = fechaSesion;
        sesionesCreadas++;
        currentDate.setDate(currentDate.getDate() + 1);
    }
    
    await batch.commit();
    console.log(`✅ ${sesionesCreadas} sesiones creadas`);
    
    // Actualizar fecha_fin del aula
    if (ultimaFechaSesion) {
        const aulaRef = doc(db, 'sfd_aulas', aulaId);
        await updateDoc(aulaRef, {
            fecha_fin: Timestamp.fromDate(ultimaFechaSesion)
        });
        console.log(`✅ Fecha fin actualizada: ${ultimaFechaSesion.toLocaleDateString('es-PE')}`);
    }
}

/**
 * Abre el modal de edición
 */
async function openEditModal(aulaId) {
    if (!editModal || !editErrorDisplay) return;
    
    editErrorDisplay.textContent = '';
    
    try {
        const aula = aulasCache.get(aulaId);
        if (!aula) throw new Error("No se encontró el aula.");

        if (editAulaDocente) {
            editAulaDocente.innerHTML = '<option value="">-- Selecciona un docente --</option>';
            docenteCache.forEach((docente, id) => {
                editAulaDocente.innerHTML += `<option value="${id}">${docente.nombre_completo}</option>`;
            });
        }

        if (editAulaId) editAulaId.value = aulaId;
        if (editAulaCodigo) editAulaCodigo.value = aula.codigo_aula || '';
        if (editAulaDocente) editAulaDocente.value = aula.id_docente_asignado || '';
        if (editAulaHorarioInicio) editAulaHorarioInicio.value = aula.horario_inicio || '';
        if (editAulaHorarioFin) editAulaHorarioFin.value = aula.horario_fin || '';
        
        editModal.classList.remove('hidden');

    } catch (error) {
        console.error("❌ Error:", error);
        alert("Error: " + error.message);
    }
}

/**
 * Actualiza un aula
 */
async function handleUpdateAula(e) {
    e.preventDefault();
    if (!saveEditButton || !editErrorDisplay || !editAulaId) return;
    
    saveEditButton.disabled = true;
    saveEditButton.textContent = 'Guardando...';
    editErrorDisplay.textContent = '';

    try {
        const aulaId = editAulaId.value;
        const codigo = editAulaCodigo?.value;
        const nuevoDocenteId = editAulaDocente?.value;
        const nuevoHorarioInicio = editAulaHorarioInicio?.value;
        const nuevoHorarioFin = editAulaHorarioFin?.value;

        if (!codigo || !nuevoDocenteId || !nuevoHorarioInicio || !nuevoHorarioFin) {
            throw new Error("Todos los campos son obligatorios.");
        }
        
        const aulaActual = aulasCache.get(aulaId);
        if (!aulaActual) {
            throw new Error("No se pudo obtener los datos actuales del aula.");
        }
        
        const cambioHorarios = (
            aulaActual.horario_inicio !== nuevoHorarioInicio || 
            aulaActual.horario_fin !== nuevoHorarioFin
        );
        const cambioDocente = aulaActual.id_docente_asignado !== nuevoDocenteId;
        
        const aulaRef = doc(db, 'sfd_aulas', aulaId);
        await updateDoc(aulaRef, {
            codigo_aula: codigo,
            id_docente_asignado: nuevoDocenteId,
            horario_inicio: nuevoHorarioInicio,
            horario_fin: nuevoHorarioFin
        });

        console.log(`✅ Aula actualizada`);
        
        if (cambioHorarios || cambioDocente) {
            await actualizarSesionesFuturas(
                aulaId,
                cambioHorarios,
                cambioDocente,
                nuevoHorarioInicio,
                nuevoHorarioFin,
                nuevoDocenteId
            );
        }
        
        if (editModal) editModal.classList.add('hidden');

    } catch (error) {
        console.error("❌ Error al actualizar aula:", error);
        if (editErrorDisplay) {
            editErrorDisplay.textContent = `Error: ${error.message}`;
        }
    } finally {
        if (saveEditButton) {
            saveEditButton.disabled = false;
            saveEditButton.textContent = 'Guardar Cambios';
        }
    }
}

/**
 * Actualiza sesiones futuras
 */
async function actualizarSesionesFuturas(
    aulaId,
    cambioHorarios,
    cambioDocente,
    nuevoHorarioInicio,
    nuevoHorarioFin,
    nuevoDocenteId
) {
    try {
        console.log(`🔄 Actualizando sesiones futuras del aula ${aulaId}...`);
        
        const ahoraPeru = getAhoraPeru();
        const sesionesRef = collection(db, `sfd_aulas/${aulaId}/sesiones`);
        const sesionesSnapshot = await getDocs(sesionesRef);
        
        const batch = writeBatch(db);
        let sesionesActualizadas = 0;
        let sesionesPasadas = 0;
        
        for (const sesionDoc of sesionesSnapshot.docs) {
            const sesion = sesionDoc.data();
            
            if (sesion.fin) {
                const finSesion = sesion.fin.toDate();
                
                if (finSesion <= ahoraPeru) {
                    sesionesPasadas++;
                    continue;
                }
            }
            
            const updateData = {};
            
            if (cambioHorarios && sesion.fecha) {
                const fechaSesion = sesion.fecha.toDate();
                const nuevoInicio = combinarFechaHorario(fechaSesion, nuevoHorarioInicio);
                const nuevoFin = combinarFechaHorario(fechaSesion, nuevoHorarioFin);
                
                updateData.inicio = Timestamp.fromDate(nuevoInicio);
                updateData.fin = Timestamp.fromDate(nuevoFin);
            }
            
            if (cambioDocente && sesion.estado !== 'con_novedad_reemplazo') {
                if (!sesion.id_docente) {
                    updateData.id_docente_nuevo = nuevoDocenteId;
                }
            }
            
            if (Object.keys(updateData).length > 0) {
                const sesionRef = doc(db, `sfd_aulas/${aulaId}/sesiones`, sesionDoc.id);
                batch.update(sesionRef, updateData);
                sesionesActualizadas++;
            }
        }
        
        if (sesionesActualizadas > 0) {
            await batch.commit();
            console.log(`✅ ${sesionesActualizadas} sesiones futuras actualizadas`);
            console.log(`ℹ️ ${sesionesPasadas} sesiones pasadas mantienen su histórico`);
        } else {
            console.log(`ℹ️ No hay sesiones futuras para actualizar`);
        }
        
    } catch (error) {
        console.error("❌ Error actualizando sesiones futuras:", error);
        throw error;
    }
}

/**
 * Elimina un aula
 */
async function handleDeleteAula(aulaId) {
    const aula = aulasCache.get(aulaId);
    if (!aula) return;

    const confirmDelete = confirm(
        `¿Eliminar el aula "${aula.codigo_aula}"?\n\n` +
        `Esto eliminará el aula y todas sus ${aula.total_sesiones} sesiones.\n` +
        `Esta acción NO se puede deshacer.\n\n` +
        `¿Continuar?`
    );
    if (!confirmDelete) return;

    try {
        const sesionesRef = collection(db, `sfd_aulas/${aulaId}/sesiones`);
        const sesionesSnapshot = await getDocs(sesionesRef);
        
        const batch = writeBatch(db);
        sesionesSnapshot.forEach(sesionDoc => {
            batch.delete(sesionDoc.ref);
        });
        
        batch.delete(doc(db, 'sfd_aulas', aulaId));
        
        await batch.commit();
        console.log(`✅ Aula y sesiones eliminadas`);

    } catch (error) {
        console.error("❌ Error:", error);
        alert('Error: ' + error.message);
    }
}

// ============================================
// ✅ NUEVAS FUNCIONES: CERRAR AULA (ENTREGA 3)
// ============================================

/**
 * Abre el modal de cerrar aula
 */
function openCerrarModal(aulaId) {
    const aula = aulasCache.get(aulaId);
    if (!aula) return;
    
    cerrarAulaIdHidden.value = aulaId;
    cerrarConfirmInput.value = '';
    cerrarButton.disabled = true;
    cerrarErrorDisplay.textContent = '';
    
    // Actualizar info del modal
    document.getElementById('cerrar-aula-nombre').textContent = aula.codigo_aula;
    document.getElementById('cerrar-aula-sesiones').textContent = aula.total_sesiones;
    
    cerrarModal.classList.remove('hidden');
}

/**
 * Cierra el modal de cerrar aula
 */
function closeCerrarModal() {
    cerrarModal.classList.add('hidden');
    cerrarConfirmInput.value = '';
    cerrarButton.disabled = true;
    cerrarErrorDisplay.textContent = '';
}

/**
 * Confirma el cierre del aula y la mueve a histórico
 */
async function confirmarCerrarAula() {
    const aulaId = cerrarAulaIdHidden.value;
    const aula = aulasCache.get(aulaId);
    if (!aula) return;
    
    cerrarButton.disabled = true;
    cerrarButton.textContent = 'Cerrando...';
    cerrarErrorDisplay.textContent = '';
    
    try {
        // 1. Obtener todas las sesiones del aula
        const sesionesRef = collection(db, `sfd_aulas/${aulaId}/sesiones`);
        const sesionesSnapshot = await getDocs(sesionesRef);
        
        const sesionesData = [];
        sesionesSnapshot.forEach(sesionDoc => {
            sesionesData.push({
                id: sesionDoc.id,
                ...sesionDoc.data()
            });
        });
        
        // 2. Crear documento en histórico con toda la info del aula + sesiones
        const historicoData = {
            ...aula,
            sesiones: sesionesData,
            fecha_archivado: Timestamp.now(),
            motivo: 'Aula cerrada manualmente'
        };
        
        const historicoRef = collection(db, 'sfd_aulas_historico');
        await addDoc(historicoRef, historicoData);
        
        // 3. Eliminar sesiones del aula actual
        const batch = writeBatch(db);
        sesionesSnapshot.forEach(sesionDoc => {
            batch.delete(sesionDoc.ref);
        });
        
        // 4. Eliminar el aula de la colección activa
        batch.delete(doc(db, 'sfd_aulas', aulaId));
        
        await batch.commit();
        
        console.log(`✅ Aula "${aula.codigo_aula}" cerrada y movida a histórico`);
        closeCerrarModal();
        
    } catch (error) {
        console.error("❌ Error al cerrar aula:", error);
        cerrarErrorDisplay.textContent = `Error: ${error.message}`;
        cerrarButton.disabled = false;
        cerrarButton.textContent = 'Cerrar Aula';
    }
}

// ============================================
// ✅ NUEVAS FUNCIONES: AVANZAR CICLO (ENTREGA 3)
// ============================================

/**
 * Abre el modal de avanzar ciclo
 */
async function openAvanzarModal(aulaId) {
    const aula = aulasCache.get(aulaId);
    if (!aula) return;
    
    const programa = PROGRAMAS[aula.programa];
    if (!programa) {
        alert('Error: No se encontró la configuración del programa.');
        return;
    }
    
    const siguienteCiclo = aula.ciclo_actual + 1;
    
    if (siguienteCiclo > programa.ciclos.length) {
        alert('Este aula ya está en el último ciclo del programa.');
        return;
    }
    
    // Prellenar el formulario
    avanzarAulaIdHidden.value = aulaId;
    avanzarCicloNuevo.value = `Ciclo ${siguienteCiclo}`;
    avanzarErrorDisplay.textContent = '';
    
    // Cargar docentes en el select
    avanzarDocenteSelect.innerHTML = '<option value="">-- Selecciona un docente --</option>';
    docenteCache.forEach((docente, id) => {
        const selected = id === aula.id_docente_asignado ? 'selected' : '';
        avanzarDocenteSelect.innerHTML += `<option value="${id}" ${selected}>${docente.nombre_completo}</option>`;
    });
    
    // Calcular sugerencia de fecha de inicio (2 días después de la última sesión)
    const sesionesRef = collection(db, `sfd_aulas/${aulaId}/sesiones`);
    const sesionesSnapshot = await getDocs(sesionesRef);
    
    let ultimaFecha = aula.fecha_inicio.toDate();
    sesionesSnapshot.forEach(sesionDoc => {
        const sesion = sesionDoc.data();
        const fechaSesion = sesion.fecha.toDate();
        if (fechaSesion > ultimaFecha) {
            ultimaFecha = fechaSesion;
        }
    });
    
    ultimaFecha.setDate(ultimaFecha.getDate() + 2);
    const fechaSugerida = ultimaFecha.toISOString().split('T')[0];
    
    avanzarFechaInicio.value = fechaSugerida;
    avanzarFechaFin.value = '';
    avanzarHorarioInicio.value = aula.horario_inicio;
    avanzarHorarioFin.value = aula.horario_fin;
    
    avanzarModal.classList.remove('hidden');
}

/**
 * Cierra el modal de avanzar ciclo
 */
function closeAvanzarModal() {
    avanzarModal.classList.add('hidden');
    avanzarForm.reset();
    avanzarErrorDisplay.textContent = '';
}

/**
 * Confirma el avance de ciclo
 */
async function confirmarAvanzarCiclo(e) {
    e.preventDefault();
    
    const aulaId = avanzarAulaIdHidden.value;
    const aula = aulasCache.get(aulaId);
    if (!aula) return;
    
    avanzarButton.disabled = true;
    avanzarButton.textContent = 'Avanzando...';
    avanzarErrorDisplay.textContent = '';
    
    try {
        const nuevoDocenteId = avanzarDocenteSelect.value;
        const nuevaFechaInicio = avanzarFechaInicio.value;
        const nuevaFechaFin = avanzarFechaFin.value;
        const nuevoHorarioInicio = avanzarHorarioInicio.value;
        const nuevoHorarioFin = avanzarHorarioFin.value;
        
        if (!nuevoDocenteId || !nuevaFechaInicio || !nuevoHorarioInicio || !nuevoHorarioFin) {
            throw new Error('Todos los campos son obligatorios.');
        }
        
        const siguienteCiclo = aula.ciclo_actual + 1;
        
        // 1. Obtener todas las sesiones del ciclo actual
        const sesionesRef = collection(db, `sfd_aulas/${aulaId}/sesiones`);
        const sesionesSnapshot = await getDocs(sesionesRef);
        
        const sesionesData = [];
        sesionesSnapshot.forEach(sesionDoc => {
            sesionesData.push({
                id: sesionDoc.id,
                ...sesionDoc.data()
            });
        });
        
        // 2. Archivar el ciclo actual en histórico
        const historicoData = {
            ...aula,
            sesiones: sesionesData,
            fecha_archivado: Timestamp.now(),
            motivo: `Avance de Ciclo ${aula.ciclo_actual} → ${siguienteCiclo}`
        };
        
        const historicoRef = collection(db, 'sfd_aulas_historico');
        await addDoc(historicoRef, historicoData);
        
        console.log(`✅ Ciclo ${aula.ciclo_actual} archivado en histórico`);
        
        // 3. Eliminar sesiones del ciclo anterior
        const deleteBatch = writeBatch(db);
        sesionesSnapshot.forEach(sesionDoc => {
            deleteBatch.delete(sesionDoc.ref);
        });
        await deleteBatch.commit();
        
        console.log(`✅ Sesiones del ciclo anterior eliminadas`);
        
        // 4. Actualizar el aula con los nuevos datos
        const [year, month, day] = nuevaFechaInicio.split('-').map(Number);
        const fechaInicioPeru = crearFechaPeru(year, month, day);
        
        const aulaRef = doc(db, 'sfd_aulas', aulaId);
        
// ✅ Calcular estado inicial del nuevo ciclo
const estadoNuevoCiclo = calcularEstadoAulaConHora(
    Timestamp.fromDate(fechaInicioPeru),
    nuevoHorarioInicio,
    null, // fecha_fin se calculará después
    nuevoHorarioFin,
    { total: aula.total_sesiones, completadas: 0 }
);

const updateData = {
    ciclo_actual: siguienteCiclo,
    id_docente_asignado: nuevoDocenteId,
    fecha_inicio: Timestamp.fromDate(fechaInicioPeru),
    fecha_fin: null,
    horario_inicio: nuevoHorarioInicio,
    horario_fin: nuevoHorarioFin,
    estado: estadoNuevoCiclo || 'Próxima' // Guardar estado calculado
};
        
        await updateDoc(aulaRef, updateData);
        
        console.log(`✅ Aula actualizada al Ciclo ${siguienteCiclo}`);
        
        // 5. Generar las nuevas sesiones
        await generateCalendarWithTimestamps(aulaId, {
            ...aula,
            ciclo_actual: siguienteCiclo,
            id_docente_asignado: nuevoDocenteId,
            fecha_inicio: Timestamp.fromDate(fechaInicioPeru),
            horario_inicio: nuevoHorarioInicio,
            horario_fin: nuevoHorarioFin
        });
        
        console.log(`✅ Aula "${aula.codigo_aula}" avanzada exitosamente al Ciclo ${siguienteCiclo}`);
        closeAvanzarModal();
        
    } catch (error) {
        console.error("❌ Error al avanzar ciclo:", error);
        avanzarErrorDisplay.textContent = `Error: ${error.message}`;
        avanzarButton.disabled = false;
        avanzarButton.textContent = `Avanzar al Ciclo`;
    }
}