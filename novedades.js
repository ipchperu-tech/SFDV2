/**
 * js/modulos/novedades.js
 * ✅ VERSIÓN 3.0: Con paginación y filtros
 * 
 * MEJORAS:
 * - Paginación de 20 registros por página
 * - Filtros por fecha y aula
 * - Ordenamiento por fecha descendente
 * - Mejor experiencia de usuario
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
    where,
    orderBy
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// ✅ Importar utilidades de fecha
import {
    combinarFechaHorario,
    crearFechaPeru,
    getAhoraPeru,
    formatFechaPeru
} from '../utils/fecha-utils.js';

// ✅ Importar configuración centralizada de feriados
import { FERIADOS_ACTIVOS } from '../config/feriados.js';

// --- Caché del Módulo ---
let aulaCache = new Map();
let docenteCache = new Map();
let sesionesCache = new Map();

// ✅ Variables de paginación
let todasLasNovedades = [];
let novedadesFiltradas = [];
let paginaActualNum = 1;
const NOVEDADES_POR_PAGINA = 20;

// ✅ Feriados (importados desde configuración centralizada)
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

// ✅ NUEVO: Elementos de paginación y filtros
let paginacionContainer, filtroFecha, filtroAula, resetFiltrosBtn;
let novedadesInicio, novedadesFin, novedadesTotal, paginaActual;
let pagAnterior, pagSiguiente;

/**
 * Función principal de inicialización
 */
export function initNovedades(user, role) {
    console.log("✅ Módulo de Novedades (v3.0 - con paginación) inicializado.");
    
    // Capturar elementos del formulario
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

    // ✅ NUEVO: Capturar elementos de paginación
    paginacionContainer = document.getElementById('novedades-paginacion-container');
    filtroFecha = document.getElementById('filtro-fecha-novedades');
    filtroAula = document.getElementById('filtro-aula-novedades');
    resetFiltrosBtn = document.getElementById('reset-filtros-novedades');
    novedadesInicio = document.getElementById('novedades-inicio');
    novedadesFin = document.getElementById('novedades-fin');
    novedadesTotal = document.getElementById('novedades-total');
    paginaActual = document.getElementById('pagina-actual-novedades');
    pagAnterior = document.getElementById('pag-anterior-novedades');
    pagSiguiente = document.getElementById('pag-siguiente-novedades');

    // Configurar listeners del formulario
    buttonShow.addEventListener('click', () => toggleNovedadForm(true));
    buttonCancel.addEventListener('click', () => toggleNovedadForm(false));
    
    tipoNovedadRadios.forEach(radio => {
        radio.addEventListener('change', handleTipoNovedadChange);
    });
    
    aulaSelect.addEventListener('change', handleAulaChange);
    form.addEventListener('submit', handleSaveNovedad);

    // ✅ NUEVO: Configurar listeners de filtros y paginación
    if (filtroFecha) filtroFecha.addEventListener('change', aplicarFiltros);
    if (filtroAula) filtroAula.addEventListener('change', aplicarFiltros);
    if (resetFiltrosBtn) resetFiltrosBtn.addEventListener('click', resetearFiltros);
    if (pagAnterior) pagAnterior.addEventListener('click', () => cambiarPagina(-1));
    if (pagSiguiente) pagSiguiente.addEventListener('click', () => cambiarPagina(1));

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
 * Carga aulas activas y próximas para gestión de novedades
 */
function loadAulasIntoSelect() {
    // ✅ CORREGIDO: 'Próximo' → 'Próxima'
    const q = query(collection(db, 'sfd_aulas'), where('estado', 'in', ['En Curso', 'Próxima']));
    
    onSnapshot(q, (snapshot) => {
        aulaSelect.innerHTML = '<option value="">-- Selecciona un aula --</option>';
        aulaCache.clear();
        
        if (snapshot.empty) {
            aulaSelect.innerHTML = '<option value="">No hay aulas activas o próximas</option>';
            console.log('ℹ️ No se encontraron aulas En Curso o Próximas');
            return;
        }
        
        snapshot.forEach(doc => {
            const aula = { id: doc.id, ...doc.data() };
            aulaCache.set(aula.id, aula);
            aulaSelect.innerHTML += `<option value="${aula.id}">${aula.codigo_aula}</option>`;
        });
        
        console.log(`✅ ${aulaCache.size} aulas cargadas en selector de novedades`);
        
        // ✅ NUEVO: Actualizar select de filtros
        actualizarFiltroAulas();
    }, (error) => {
        console.error("❌ Error al cargar aulas:", error);
        aulaSelect.innerHTML = '<option value="">Error al cargar aulas</option>';
    });
}

/**
 * ✅ NUEVO: Actualiza el select de filtro de aulas
 */
function actualizarFiltroAulas() {
    if (!filtroAula) return;
    
    const aulasUnicas = Array.from(aulaCache.values())
        .map(aula => aula.codigo_aula)
        .sort();
    
    filtroAula.innerHTML = '<option value="">Todas las aulas</option>' +
        aulasUnicas.map(codigo => `<option value="${codigo}">${codigo}</option>`).join('');
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
        
        // ✅ Filtrar sesiones que NO han pasado
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
 * ✅ Recalcula fecha_fin del aula después de reprogramación
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
 * ✅ Guarda novedad con actualización de timestamps completos
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
            registrado_por: "admin@sfd.com",
            timestamp: Timestamp.now() // ✅ NUEVO: Para ordenar por fecha de registro
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
 * ✅ CORREGIDO: Escucha y almacena todas las novedades (ordenamiento en cliente)
 */
function listenForNovedades() {
    // ✅ Query sin orderBy para incluir novedades antiguas sin timestamp
    const q = query(collection(db, 'sfd_novedades_clases'));
    
    onSnapshot(q, (snapshot) => {
        todasLasNovedades = [];
        
        snapshot.forEach(doc => {
            todasLasNovedades.push({ id: doc.id, ...doc.data() });
        });
        
        // ✅ Ordenar en JavaScript (más recientes primero)
        todasLasNovedades.sort((a, b) => {
            // Si ambas tienen timestamp, ordenar por timestamp
            if (a.timestamp && b.timestamp) {
                return b.timestamp.toMillis() - a.timestamp.toMillis();
            }
            // Si solo 'a' tiene timestamp, va primero
            if (a.timestamp && !b.timestamp) {
                return -1;
            }
            // Si solo 'b' tiene timestamp, va primero
            if (!a.timestamp && b.timestamp) {
                return 1;
            }
            // Si ninguna tiene timestamp, ordenar por fecha_original (descendente)
            if (a.fecha_original && b.fecha_original) {
                return b.fecha_original.toMillis() - a.fecha_original.toMillis();
            }
            // Fallback: mantener orden original
            return 0;
        });
        
        console.log(`✅ ${todasLasNovedades.length} novedades cargadas y ordenadas`);
        
        // Aplicar filtros y renderizar
        aplicarFiltros();
    }, (error) => {
        console.error("❌ Error al escuchar novedades:", error);
        tableContainer.innerHTML = `<p class="text-center text-red-500 p-6">Error al cargar novedades.</p>`;
    });
}

/**
 * ✅ NUEVO: Aplica filtros a las novedades
 */
function aplicarFiltros() {
    const fechaSeleccionada = filtroFecha ? filtroFecha.value : '';
    const aulaSeleccionada = filtroAula ? filtroAula.value : '';
    
    novedadesFiltradas = [...todasLasNovedades];
    
    // Filtro por fecha
    if (fechaSeleccionada) {
        const fechaObj = new Date(fechaSeleccionada + 'T00:00:00-05:00');
        novedadesFiltradas = novedadesFiltradas.filter(n => {
            const fechaNovedad = n.fecha_original.toDate();
            return fechaNovedad.toDateString() === fechaObj.toDateString();
        });
    }
    
    // Filtro por aula
    if (aulaSeleccionada) {
        novedadesFiltradas = novedadesFiltradas.filter(n => n.codigo_aula === aulaSeleccionada);
    }
    
    // Renderizar primera página
    renderNovedadesPaginadas(1);
}

/**
 * ✅ NUEVO: Resetea los filtros
 */
function resetearFiltros() {
    if (filtroFecha) filtroFecha.value = '';
    if (filtroAula) filtroAula.value = '';
    aplicarFiltros();
}

/**
 * ✅ NUEVO: Renderiza novedades con paginación
 */
function renderNovedadesPaginadas(pagina) {
    paginaActualNum = pagina;
    
    const totalNovedades = novedadesFiltradas.length;
    const totalPaginas = Math.ceil(totalNovedades / NOVEDADES_POR_PAGINA);
    
    // Calcular rango
    const inicio = (pagina - 1) * NOVEDADES_POR_PAGINA;
    const fin = Math.min(inicio + NOVEDADES_POR_PAGINA, totalNovedades);
    const novedadesPagina = novedadesFiltradas.slice(inicio, fin);
    
    // Renderizar tabla
    let tableHtml = `
        <table class="min-w-full divide-y divide-gray-200">
            <thead class="bg-gray-50">
                <tr>
                    <th class="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Fecha Registro</th>
                    <th class="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Aula</th>
                    <th class="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Sesión</th>
                    <th class="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Tipo</th>
                    <th class="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Detalle</th>
                    <th class="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Motivo</th>
                </tr>
            </thead>
            <tbody class="divide-y divide-gray-200 bg-white">
    `;
    
    if (novedadesPagina.length === 0) {
        tableHtml += `<tr><td colspan="6" class="px-6 py-4 text-center text-gray-500">No hay novedades que mostrar.</td></tr>`;
    } else {
        novedadesPagina.forEach(n => {
            // ✅ Manejar novedades antiguas sin timestamp
const fechaRegistro = n.timestamp 
    ? formatFechaPeru(n.timestamp, true) 
    : (n.fecha_original ? formatFechaPeru(n.fecha_original) : 'N/A');
    
            const fechaOrgStr = formatFechaPeru(n.fecha_original);
            
            let detalle = '';
            let tipoBadge = '';
            
            if (n.tipo === 'reemplazo') {
                tipoBadge = '<span class="badge" style="background-color: #d1ecf1; color: #0c5460;">Reemplazo</span>';
                detalle = `Sesión del ${fechaOrgStr}`;
            } else if (n.tipo === 'reprogramacion') {
                tipoBadge = '<span class="badge" style="background-color: #fff3cd; color: #856404;">Reprogramación</span>';
                const fechaNueStr = formatFechaPeru(n.nueva_fecha);
                detalle = `De ${fechaOrgStr} a ${fechaNueStr}`;
            }
            
            tableHtml += `
                <tr class="hover:bg-gray-50">
                    <td class="px-6 py-4 text-sm text-gray-500 whitespace-nowrap">${fechaRegistro}</td>
                    <td class="px-6 py-4 text-sm font-medium text-gray-900">${n.codigo_aula}</td>
                    <td class="px-6 py-4 text-sm text-gray-500">Sesión ${n.sesion_numero}</td>
                    <td class="px-6 py-4 text-sm">${tipoBadge}</td>
                    <td class="px-6 py-4 text-sm text-gray-500">${detalle}</td>
                    <td class="px-6 py-4 text-sm text-gray-500 max-w-xs truncate" title="${n.motivo}">${n.motivo}</td>
                </tr>
            `;
        });
    }

    tableHtml += `</tbody></table>`;
    tableContainer.innerHTML = tableHtml;
    
    // Actualizar controles de paginación
    if (paginacionContainer && totalNovedades > 0) {
        novedadesInicio.textContent = inicio + 1;
        novedadesFin.textContent = fin;
        novedadesTotal.textContent = totalNovedades;
        paginaActual.textContent = `Página ${pagina} de ${totalPaginas}`;
        
        pagAnterior.disabled = pagina === 1;
        pagSiguiente.disabled = pagina === totalPaginas;
        
        paginacionContainer.classList.remove('hidden');
    } else if (paginacionContainer) {
        paginacionContainer.classList.add('hidden');
    }
}

/**
 * ✅ NUEVO: Cambia de página
 */
function cambiarPagina(direccion) {
    const nuevaPagina = paginaActualNum + direccion;
    renderNovedadesPaginadas(nuevaPagina);
}