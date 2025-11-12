/**
 * js/modulos/novedades.js
 * ✅ VERSIÓN 2.0: Actualiza timestamps completos en reprogramación
 * 
 * MEJORAS:
 * - Reprogramación actualiza: fecha, inicio, fin
 * - Usa combinarFechaHorario() de fecha-utils.js
 * - Mantiene lógica de cascada existente
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
    updateDoc,
    Timestamp,
    where
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// ✅ Importar utilidades de fecha
import {
    combinarFechaHorario,
    crearFechaPeru,
    getAhoraPeru
} from '../utils/fecha-utils.js';

// ✅ NUEVO: Importar configuración centralizada de feriados
import { FERIADOS_ACTIVOS } from '../config/feriados.js';

// --- Caché del Módulo ---
let aulaCache = new Map();
let docenteCache = new Map();
let sesionesCache = new Map();

// ✅ Feriados (importados desde configuración centralizada)
// Convertimos a formato toDateString para compatibilidad con la función existente
const FERIADOS = FERIADOS_ACTIVOS.map(f => new Date(f + 'T00:00:00-05:00').toDateString());


// --- Mapeo de frecuencias ---
const FRECUENCIA_A_DIAS = {
    'Lun-Mié-Vie (3 veces/semana)': [1, 3, 5],
    'Martes y Jueves (2 veces/semana)': [2, 4],
    'Sábados y Domingos (2 veces/semana)': [6, 0],
    'Lunes y Miércoles (2 veces/semana)': [1, 3],
    'Lun, Mié y Vie': [1, 3, 5],
    'Mar y Jue': [2, 4],
    'Sáb y Dom': [6, 0],
    'Lun y Mié': [1, 3]
};

/**
 * Obtiene la siguiente fecha válida según la frecuencia
 */
function obtenerSiguienteFechaValida(fechaActual, diasSemana) {
    const fecha = new Date(fechaActual);
    fecha.setDate(fecha.getDate() + 1);
    
    while (true) {
        const diaSemana = fecha.getDay();
        const fechaStr = fecha.toDateString();
        
        if (diasSemana.includes(diaSemana) && !FERIADOS.includes(fechaStr)) {
            return fecha;
        }
        
        fecha.setDate(fecha.getDate() + 1);
        
        if (fecha.getTime() - fechaActual.getTime() > 60 * 24 * 60 * 60 * 1000) {
            console.error('Error: No se pudo encontrar una fecha válida en 60 días');
            return fecha;
        }
    }
}

// --- Elementos del DOM ---
let form, container, buttonShow, buttonCancel, buttonSave, errorDisplay, tableContainer;
let aulaSelect, sesionSelect, tipoNovedadRadios;
let reemplazoContainer, reprogramarContainer, docenteReemplazoSelect;
let nuevaFechaInput, motivoInput;

/**
 * Función principal de inicialización
 */
export function initNovedades(user, role) {
    console.log("✅ Módulo de Novedades (v2.0) inicializado.");
    
    // Capturar elementos
    form = document.getElementById('new-novedad-form');
    container = document.getElementById('new-novedad-form-container');
    buttonShow = document.getElementById('show-novedad-form-button');
    buttonCancel = document.getElementById('cancel-novedad-form-button');
    buttonSave = document.getElementById('save-novedad-button');
    errorDisplay = document.getElementById('form-novedad-error');
    tableContainer = document.getElementById('novedades-table-container');

    aulaSelect = document.getElementById('novedad_aula_select');
    sesionSelect = document.getElementById('novedad_sesion_select');
    tipoNovedadRadios = document.querySelectorAll('input[name="tipo_novedad_radio"]');
    
    reemplazoContainer = document.getElementById('novedad_reemplazo_container');
    reprogramarContainer = document.getElementById('novedad_reprogramar_container');
    docenteReemplazoSelect = document.getElementById('novedad_docente_reemplazo');
    
    nuevaFechaInput = document.getElementById('novedad_nueva_fecha');
    motivoInput = document.getElementById('novedad_motivo');

    // Configurar listeners
    buttonShow.addEventListener('click', () => toggleNovedadForm(true));
    buttonCancel.addEventListener('click', () => toggleNovedadForm(false));
    
    tipoNovedadRadios.forEach(radio => {
        radio.addEventListener('change', handleTipoNovedadChange);
    });
    
    aulaSelect.addEventListener('change', handleAulaChange);
    form.addEventListener('submit', handleSaveNovedad);

    // Cargar datos
    loadAulasIntoSelect();
    loadDocentesIntoSelect();
    listenForNovedades();
}

/**
 * Muestra u oculta el formulario
 */
function toggleNovedadForm(show) {
    if (show) {
        container.classList.remove('hidden');
        buttonShow.classList.add('hidden');
        form.reset();
        errorDisplay.textContent = '';
        sesionSelect.innerHTML = '<option value="">-- Primero selecciona un aula --</option>';
        reemplazoContainer.classList.add('hidden');
        reprogramarContainer.classList.add('hidden');
    } else {
        container.classList.add('hidden');
        buttonShow.classList.remove('hidden');
    }
}

/**
 * Carga aulas activas
 */
function loadAulasIntoSelect() {
    const q = query(collection(db, 'sfd_aulas'), where('estado', 'in', ['En Curso', 'Próximo']));
    
    onSnapshot(q, (snapshot) => {
        aulaSelect.innerHTML = '<option value="">-- Selecciona un aula --</option>';
        aulaCache.clear();
        snapshot.forEach(doc => {
            const aula = { id: doc.id, ...doc.data() };
            aulaCache.set(aula.id, aula);
            aulaSelect.innerHTML += `<option value="${aula.id}">${aula.codigo_aula}</option>`;
        });
    }, (error) => {
        console.error("❌ Error al cargar aulas:", error);
        aulaSelect.innerHTML = '<option value="">Error al cargar aulas</option>';
    });
}

/**
 * Carga docentes
 */
function loadDocentesIntoSelect() {
    const q = query(collection(db, 'sfd_docentes'));
    onSnapshot(q, (snapshot) => {
        docenteReemplazoSelect.innerHTML = '<option value="">-- Selecciona un docente de reemplazo --</option>';
        docenteCache.clear();
        snapshot.forEach(doc => {
            const docente = { id: doc.id, ...doc.data() };
            docenteCache.set(docente.id, docente);
            docenteReemplazoSelect.innerHTML += `<option value="${docente.id}">${docente.nombre_completo}</option>`;
        });
    });
}

/**
 * Muestra/oculta campos según tipo de novedad
 */
function handleTipoNovedadChange(e) {
    const tipo = e.target.value;
    if (tipo === 'reemplazo') {
        reemplazoContainer.classList.remove('hidden');
        reprogramarContainer.classList.add('hidden');
        docenteReemplazoSelect.required = true;
        nuevaFechaInput.required = false;
    } else if (tipo === 'reprogramacion') {
        reemplazoContainer.classList.add('hidden');
        reprogramarContainer.classList.remove('hidden');
        docenteReemplazoSelect.required = false;
        nuevaFechaInput.required = true;
    }
}

/**
 * Carga sesiones del aula seleccionada
 * ✅ MEJORADO: Solo muestra sesiones futuras (que no han pasado)
 */
async function handleAulaChange(e) {
    const aulaId = e.target.value;
    if (!aulaId) {
        sesionSelect.innerHTML = '<option value="">-- Primero selecciona un aula --</option>';
        return;
    }
    
    sesionSelect.innerHTML = '<option value="">Cargando sesiones...</option>';
    sesionesCache.clear();
    
    try {
        // ✅ Obtener el aula para acceder a sus horarios
        const aulaData = aulaCache.get(aulaId);
        if (!aulaData) {
            throw new Error('No se encontró información del aula');
        }
        
        const sesionesRef = collection(db, `sfd_aulas/${aulaId}/sesiones`);
        const q = query(sesionesRef, where('estado', 'in', ['programada', 'reprogramada']));
        const snapshot = await getDocs(q);
        
        sesionSelect.innerHTML = '<option value="">-- Selecciona una sesión --</option>';
        
        if (snapshot.empty) {
            sesionSelect.innerHTML = '<option value="">No hay sesiones disponibles</option>';
            return;
        }
        
        // ✅ NUEVO: Filtrar sesiones que NO han pasado
        const ahoraPeru = getAhoraPeru();
        const sesionesDisponibles = [];
        
        snapshot.forEach(doc => {
            const sesion = { id: doc.id, ...doc.data() };
            sesionesCache.set(doc.id, sesion);
            
            // ✅ Verificar si la sesión ya pasó
            if (sesion.fin) {
                const finSesion = sesion.fin.toDate();
                
                // Solo agregar sesiones futuras (que aún no terminaron)
                if (finSesion > ahoraPeru) {
                    sesionesDisponibles.push(sesion);
                }
            } else {
                // Si no tiene hora de fin (dato antiguo), incluirla por seguridad
                sesionesDisponibles.push(sesion);
            }
        });
        
        // ✅ Verificar si hay sesiones futuras disponibles
        if (sesionesDisponibles.length === 0) {
            sesionSelect.innerHTML = '<option value="">No hay sesiones futuras para gestionar</option>';
            console.log('ℹ️ Todas las sesiones de esta aula ya pasaron');
            return;
        }
        
        // Ordenar por número de sesión
        sesionesDisponibles.sort((a, b) => a.sesion - b.sesion);
        
        // Generar las opciones con información completa
        sesionesDisponibles.forEach(sesion => {
            const fechaStr = sesion.fecha.toDate().toLocaleDateString('es-PE');
            const horarioStr = aulaData.horario_inicio && aulaData.horario_fin 
                ? ` (${aulaData.horario_inicio}-${aulaData.horario_fin})` 
                : '';
            
            sesionSelect.innerHTML += `<option value="${sesion.id}">Sesión ${sesion.sesion} - ${fechaStr}${horarioStr}</option>`;
        });
        
        console.log(`✅ ${sesionesDisponibles.length} sesiones futuras disponibles para gestión`);
        
    } catch (error) {
        console.error("❌ Error al cargar sesiones:", error);
        sesionSelect.innerHTML = '<option value="">Error al cargar sesiones</option>';
    }
}

/**
 * ✅ V2.0: Recalcula fecha_fin del aula después de reprogramación
 */
async function recalcularFechaFinAula(aulaId) {
    try {
        const sesionesRef = collection(db, `sfd_aulas/${aulaId}/sesiones`);
        const snapshot = await getDocs(sesionesRef);
        
        let fechaMasLejana = null;
        
        snapshot.forEach(doc => {
            const sesion = doc.data();
            if (sesion.fecha) {
                if (!fechaMasLejana || sesion.fecha.toMillis() > fechaMasLejana.toMillis()) {
                    fechaMasLejana = sesion.fecha;
                }
            }
        });
        
        if (fechaMasLejana) {
            const aulaRef = doc(db, 'sfd_aulas', aulaId);
            await updateDoc(aulaRef, {
                fecha_fin: fechaMasLejana
            });
            console.log(`✅ Fecha fin actualizada: ${fechaMasLejana.toDate().toLocaleDateString('es-PE')}`);
        }
        
    } catch (error) {
        console.error("❌ Error recalculando fecha_fin:", error);
    }
}

/**
 * ✅ V2.0: Guarda novedad con actualización de timestamps completos
 */
async function handleSaveNovedad(e) {
    e.preventDefault();
    buttonSave.disabled = true;
    buttonSave.textContent = 'Guardando...';
    errorDisplay.textContent = '';
    
    try {
        const aulaId = aulaSelect.value;
        const sesionId = sesionSelect.value;
        const tipoNovedadRadio = form.querySelector('input[name="tipo_novedad_radio"]:checked');
        
        if (!tipoNovedadRadio) {
            throw new Error('Debes seleccionar un tipo de novedad.');
        }
        const tipoNovedad = tipoNovedadRadio.value;
        const motivo = motivoInput.value;
        
        if (!aulaId || !sesionId || !motivo) {
            throw new Error('Todos los campos son obligatorios.');
        }
        
        const aulaData = aulaCache.get(aulaId);
        const sesionData = sesionesCache.get(sesionId);
        
        const batch = writeBatch(db);
        
        const novedadRef = doc(collection(db, 'sfd_novedades_clases'));
        const novedadData = {
            id_aula: aulaId,
            codigo_aula: aulaData.codigo_aula,
            sesion_numero: sesionData.sesion,
            fecha_original: sesionData.fecha,
            motivo: motivo,
            estado: 'aprobado',
            registrado_por: "admin@sfd.com"
        };

        const sesionRef = doc(db, `sfd_aulas/${aulaId}/sesiones`, sesionId);
        
        if (tipoNovedad === 'reemplazo') {
            const docenteReemplazoId = docenteReemplazoSelect.value;
            if (!docenteReemplazoId) throw new Error('Debe seleccionar un docente de reemplazo.');
            
            novedadData.tipo = 'reemplazo';
            novedadData.id_docente_reemplazante = docenteReemplazoId;
            
            batch.update(sesionRef, {
                estado: 'con_novedad_reemplazo',
                id_docente: docenteReemplazoId
            });
            
        } else if (tipoNovedad === 'reprogramacion') {
            const nuevaFecha = new Date(nuevaFechaInput.value + 'T00:00:00-05:00');
            if (isNaN(nuevaFecha.getTime())) throw new Error('La nueva fecha no es válida.');

            novedadData.tipo = 'reprogramacion';
            novedadData.nueva_fecha = Timestamp.fromDate(nuevaFecha);
            
            // Obtener frecuencia del aula
            const frecuencia = aulaData.frecuencia;
            const diasSemana = FRECUENCIA_A_DIAS[frecuencia];
            
            if (!diasSemana) {
                throw new Error(`Frecuencia no reconocida: ${frecuencia}`);
            }
            
            // Obtener horarios del aula
            const horarioInicio = aulaData.horario_inicio;
            const horarioFin = aulaData.horario_fin;
            
            if (!horarioInicio || !horarioFin) {
                throw new Error('El aula no tiene horarios definidos.');
            }
            
            // Obtener TODAS las sesiones ordenadas
            const todasSesionesRef = collection(db, `sfd_aulas/${aulaId}/sesiones`);
            const todasSesionesSnapshot = await getDocs(todasSesionesRef);
            const todasSesiones = [];
            
            todasSesionesSnapshot.forEach(doc => {
                todasSesiones.push({ id: doc.id, ...doc.data() });
            });
            
            todasSesiones.sort((a, b) => a.sesion - b.sesion);
            
            // Encontrar índice de la sesión reprogramada
            const sesionIndex = todasSesiones.findIndex(s => s.id === sesionId);
            
            if (sesionIndex === -1) {
                throw new Error('No se pudo encontrar la sesión.');
            }
            
            console.log(`🔄 Reprogramando sesión ${sesionData.sesion} y ${todasSesiones.length - sesionIndex - 1} posteriores`);
            
            // ✅ Actualizar sesión reprogramada (fecha + timestamps)
            const fechaSesion = crearFechaPeru(
                nuevaFecha.getFullYear(),
                nuevaFecha.getMonth() + 1,
                nuevaFecha.getDate()
            );
            
            const timestampInicio = combinarFechaHorario(fechaSesion, horarioInicio);
            const timestampFin = combinarFechaHorario(fechaSesion, horarioFin);
            
            batch.update(sesionRef, {
                estado: 'reprogramada',
                fecha: Timestamp.fromDate(fechaSesion),
                inicio: Timestamp.fromDate(timestampInicio),
                fin: Timestamp.fromDate(timestampFin)
            });
            
            // ✅ Recalcular TODAS las sesiones posteriores con timestamps completos
            let fechaActual = nuevaFecha;
            
            for (let i = sesionIndex + 1; i < todasSesiones.length; i++) {
                const sesionPosterior = todasSesiones[i];
                
                // Calcular siguiente fecha válida
                fechaActual = obtenerSiguienteFechaValida(fechaActual, diasSemana);
                
                // Crear timestamps completos
                const fechaPosterior = crearFechaPeru(
                    fechaActual.getFullYear(),
                    fechaActual.getMonth() + 1,
                    fechaActual.getDate()
                );
                
                const inicioPosterior = combinarFechaHorario(fechaPosterior, horarioInicio);
                const finPosterior = combinarFechaHorario(fechaPosterior, horarioFin);
                
                // Actualizar en batch
                const sesionPosteriorRef = doc(db, `sfd_aulas/${aulaId}/sesiones`, sesionPosterior.id);
                batch.update(sesionPosteriorRef, {
                    fecha: Timestamp.fromDate(fechaPosterior),
                    inicio: Timestamp.fromDate(inicioPosterior),
                    fin: Timestamp.fromDate(finPosterior)
                });
                
                console.log(`  → S${sesionPosterior.sesion}: ${fechaActual.toLocaleDateString('es-PE')} ${horarioInicio}-${horarioFin}`);
            }
            
            console.log(`✅ ${todasSesiones.length - sesionIndex} sesiones actualizadas con timestamps completos`);
        }
        
        batch.set(novedadRef, novedadData);
        
        await batch.commit();
        
        // Recalcular fecha_fin si fue reprogramación
        if (tipoNovedad === 'reprogramacion') {
            await recalcularFechaFinAula(aulaId);
        }
        
        console.log('✅ Novedad registrada y calendario actualizado.');
        toggleNovedadForm(false);
        
    } catch (error) {
        console.error("❌ Error al guardar novedad:", error);
        errorDisplay.textContent = `Error: ${error.message}`;
    } finally {
        buttonSave.disabled = false;
        buttonSave.textContent = 'Guardar Novedad';
    }
}

/**
 * Escucha y muestra tabla de novedades
 */
function listenForNovedades() {
    const q = query(collection(db, 'sfd_novedades_clases'));
    onSnapshot(q, (snapshot) => {
        let tableHtml = `
            <table class="min-w-full divide-y divide-gray-200">
                <thead class="bg-gray-50">
                    <tr>
                        <th class="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Aula</th>
                        <th class="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Sesión</th>
                        <th class="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Tipo</th>
                        <th class="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Detalle</th>
                        <th class="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Motivo</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-gray-200 bg-white">
        `;
        
        if (snapshot.empty) {
            tableHtml += `<tr><td colspan="5" class="px-6 py-4 text-center text-gray-500">No hay novedades registradas.</td></tr>`;
        } else {
            snapshot.forEach(doc => {
                const n = doc.data();
                const fechaOrgStr = n.fecha_original.toDate().toLocaleDateString('es-ES');
                let detalle = '';
                if (n.tipo === 'reemplazo') {
                    detalle = `Reemplazo para el ${fechaOrgStr}`;
                } else if (n.tipo === 'reprogramacion') {
                    const fechaNueStr = n.nueva_fecha.toDate().toLocaleDateString('es-ES');
                    detalle = `Movida del ${fechaOrgStr} al ${fechaNueStr}`;
                }
                
                tableHtml += `
                    <tr>
                        <td class="px-6 py-4 text-sm font-medium text-gray-900">${n.codigo_aula}</td>
                        <td class="px-6 py-4 text-sm text-gray-500">${n.sesion_numero}</td>
                        <td class="px-6 py-4 text-sm text-gray-500 capitalize">${n.tipo}</td>
                        <td class="px-6 py-4 text-sm text-gray-500">${detalle}</td>
                        <td class="px-6 py-4 text-sm text-gray-500">${n.motivo}</td>
                    </tr>
                `;
            });
        }

        tableHtml += `</tbody></table>`;
        tableContainer.innerHTML = tableHtml;
    });
}