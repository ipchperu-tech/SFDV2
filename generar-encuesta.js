/**
 * js/modulos/generar-encuesta.js
 * ✅ VERSIÓN 2.2: Simplificada y robusta
 * 
 * CAMBIOS:
 * - Eliminado botón de copiar rápido (📋)
 * - Prevención de duplicados mejorada (verifica en Firestore)
 * - Recarga optimizada sin interferencias
 * - Debug logs para diagnóstico
 */

// --- Importaciones de Núcleo ---
import { db } from '../firebase-config.js';
import {
    collection,
    doc,
    addDoc,
    getDocs,
    query,
    where,
    Timestamp,
    orderBy,
    limit
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// ✅ Importar utilidades de fecha centralizadas
import { 
    getHoyPeru,
    getAhoraPeru,
    formatFechaCompleta, 
    calcularExpiracionTicket,
    combinarFechaHorario
} from '../utils/fecha-utils.js';

// --- Caché del Módulo ---
let docenteCache = new Map();
let aulaCache = new Map();
let clasesDeHoy = [];

// --- Elementos del DOM ---
let tableContainer, fechaDisplay, refreshButton;
let enlaceModal, closeModalBtn, closeModalBtn2, modalLinkInput, modalCopyButton;
let modalAulaCodigo, modalDocenteNombre, modalSesionNum, modalHorario;
let modalExpirationInfo;

/**
 * Función principal de inicialización del módulo Generar Encuesta.
 */
export function initGenerarEncuesta(user, role) {
    console.log("✅ Módulo de Generar Encuesta (v2.2) inicializado.");

    // Capturar elementos del DOM
    tableContainer = document.getElementById('scheduled-classes-table-container');
    fechaDisplay = document.getElementById('generar-encuesta-fecha');
    refreshButton = document.getElementById('refresh-classes-button');
    
    // Modal
    enlaceModal = document.getElementById('enlace-modal');
    closeModalBtn = document.getElementById('close-enlace-modal');
    closeModalBtn2 = document.getElementById('modal-close-button');
    modalLinkInput = document.getElementById('modal-link-input');
    modalCopyButton = document.getElementById('modal-copy-button');
    modalAulaCodigo = document.getElementById('modal-aula-codigo');
    modalDocenteNombre = document.getElementById('modal-docente-nombre');
    modalSesionNum = document.getElementById('modal-sesion-num');
    modalHorario = document.getElementById('modal-horario');
    modalExpirationInfo = document.getElementById('modal-expiration-info');

    const hoy = getHoyPeru();
    fechaDisplay.textContent = formatFechaCompleta(hoy);

    // Cargar datos iniciales
    loadDocenteCache().then(() => {
        loadScheduledClasses();
    });

    // Event Listeners
    refreshButton.addEventListener('click', loadScheduledClasses);
    closeModalBtn.addEventListener('click', () => enlaceModal.classList.add('hidden'));
    closeModalBtn2.addEventListener('click', () => enlaceModal.classList.add('hidden'));
    modalCopyButton.addEventListener('click', copyModalLinkToClipboard);
    
    // Listener delegado para botón de generar
    tableContainer.addEventListener('click', async (e) => {
        const target = e.target.closest('button');
        if (!target) return;
        
        if (target.classList.contains('generate-link-btn')) {
            const index = parseInt(target.dataset.index);
            await handleGenerateLink(clasesDeHoy[index]);
        }
    });
}

/**
 * Carga todos los docentes en un Map para consulta rápida.
 */
async function loadDocenteCache() {
    docenteCache.clear();
    try {
        const snapshot = await getDocs(collection(db, 'sfd_docentes'));
        snapshot.forEach(doc => {
            docenteCache.set(doc.id, doc.data());
        });
        console.log(`✅ Cache de ${docenteCache.size} docentes cargada.`);
    } catch (error) {
        console.error("❌ Error cargando docentes:", error);
    }
}

/**
 * ✅ V2.2: Verifica si ya existe un enlace activo para una sesión específica
 */
async function verificarEnlaceExistente(aulaId, sesionNum) {
    try {
        const q = query(
            collection(db, 'sfd_enlaces_activos'),
            where('id_aula', '==', aulaId),
            where('sesion', '==', sesionNum),
            where('usado', '==', false),
            limit(1)
        );
        
        const snapshot = await getDocs(q);
        
        if (!snapshot.empty) {
            const doc = snapshot.docs[0];
            const enlace = { id: doc.id, ...doc.data() };
            
            // Verificar que no haya expirado
            const ahora = getAhoraPeru();
            const expira = enlace.expira.toDate();
            
            if (expira > ahora) {
                console.log(`✅ Enlace existente encontrado para aula ${aulaId} sesión ${sesionNum}`);
                return enlace;
            } else {
                console.log(`⚠️ Enlace existente expiró para aula ${aulaId} sesión ${sesionNum}`);
                return null;
            }
        }
        
        console.log(`ℹ️ No hay enlace existente para aula ${aulaId} sesión ${sesionNum}`);
        return null;
        
    } catch (error) {
        console.error("❌ Error verificando enlace existente:", error);
        return null;
    }
}

/**
 * ✅ V2.2: Calcula información temporal de la sesión
 */
function calcularInfoTemporal(clase) {
    const ahoraPeru = getAhoraPeru();
    
    // Combinar fecha + horarios para timestamps completos
    const timestampInicio = combinarFechaHorario(clase.fecha, clase.horarioInicio);
    const timestampFin = combinarFechaHorario(clase.fecha, clase.horarioFin);
    
    const msInicio = timestampInicio.getTime();
    const msFin = timestampFin.getTime();
    const msAhora = ahoraPeru.getTime();
    
    // Calcular diferencias en horas
    const horasHastaInicio = (msInicio - msAhora) / (1000 * 60 * 60);
    const horasHastaFin = (msFin - msAhora) / (1000 * 60 * 60);
    const horasDesdeFin = (msAhora - msFin) / (1000 * 60 * 60);
    
    // Determinar estado
    let estado, mensaje, badge, puedeGenerar;
    
    if (msAhora < msInicio) {
        // Aún no inicia
        estado = 'futura';
        const horas = Math.ceil(horasHastaInicio);
        if (horas < 1) {
            mensaje = `Inicia en ${Math.ceil(horasHastaInicio * 60)} min`;
        } else if (horas === 1) {
            mensaje = `Inicia en 1 hora`;
        } else {
            mensaje = `Inicia en ${horas} horas`;
        }
        badge = 'status-pending';
        puedeGenerar = false;
    } else if (msAhora >= msInicio && msAhora <= msFin) {
        // En progreso
        estado = 'en_progreso';
        const horas = Math.ceil(horasHastaFin);
        if (horas < 1) {
            mensaje = `Termina en ${Math.ceil(horasHastaFin * 60)} min`;
        } else {
            mensaje = `Termina en ${horas} hora${horas > 1 ? 's' : ''}`;
        }
        badge = 'status-active';
        puedeGenerar = false;
} else {
    // Ya terminó
    estado = 'terminada';
    const horas = Math.floor(horasDesdeFin);
    if (horas < 1) {
        mensaje = `Terminó hace ${Math.floor(horasDesdeFin * 60)} min`;
    } else if (horas === 1) {
        mensaje = `Terminó hace 1 hora`;
    } else {
        mensaje = `Terminó hace ${horas} horas`;
    }
    badge = 'status-completed';
    
    // ✅ NUEVO: Solo permitir generar si no han pasado 4 horas
    puedeGenerar = horasDesdeFin <= 4;
}
    
    // Calcular expiración del ticket
    const fechaExpiracion = calcularExpiracionTicket(clase.fecha, clase.horarioFin);
    const horasHastaExpiracion = (fechaExpiracion.getTime() - msAhora) / (1000 * 60 * 60);
    
    let mensajeExpiracion = '';
    if (horasHastaExpiracion > 0) {
        const horas = Math.floor(horasHastaExpiracion);
        if (horas < 1) {
            mensajeExpiracion = `Expira en ${Math.ceil(horasHastaExpiracion * 60)} min`;
        } else if (horas === 1) {
            mensajeExpiracion = `Expira en 1 hora`;
        } else {
            mensajeExpiracion = `Expira en ${horas} horas`;
        }
    } else {
        mensajeExpiracion = 'Ya expiró';
    }
    
    return {
        estado,
        mensaje,
        badge,
        puedeGenerar,
        mensajeExpiracion
    };
}

/**
 * ✅ V2.2: Carga las clases programadas para hoy
 */
async function loadScheduledClasses() {
    tableContainer.innerHTML = '<p class="p-6 text-center text-gray-500">Buscando clases programadas...</p>';
    aulaCache.clear();
    clasesDeHoy = [];
    
    try {
        const hoy = getHoyPeru();
        const inicioDelDia = new Date(hoy);
        const finDelDia = new Date(hoy);
        finDelDia.setHours(23, 59, 59, 999);

        const inicioTimestamp = Timestamp.fromDate(inicioDelDia);
        const finTimestamp = Timestamp.fromDate(finDelDia);

        console.log(`🔍 Buscando clases para: ${formatFechaCompleta(hoy)}`);

        // Obtener aulas activas
        const aulasQuery = query(
            collection(db, 'sfd_aulas'), 
            where('estado', 'in', ['En Curso', 'Próxima'])
        );
        const aulasSnapshot = await getDocs(aulasQuery);

        if (aulasSnapshot.empty) {
            renderEmptyState('No hay aulas activas en el sistema.');
            return;
        }

        // Para cada aula, buscar sus sesiones de hoy
        const promises = [];
        
        aulasSnapshot.forEach(aulaDoc => {
            const aula = { id: aulaDoc.id, ...aulaDoc.data() };
            aulaCache.set(aula.id, aula);

            const sesionesRef = collection(db, `sfd_aulas/${aula.id}/sesiones`);
            const q = query(
                sesionesRef,
                where('fecha', '>=', inicioTimestamp),
                where('fecha', '<=', finTimestamp),
                where('estado', 'in', ['programada', 'con_novedad_reemplazo', 'reprogramada'])
            );
            
            const promise = getDocs(q).then(async snapshot => {
                for (const sesionDoc of snapshot.docs) {
                    const sesion = sesionDoc.data();
                    
                    // Determinar el docente (original o reemplazo)
                    let docenteId = aula.id_docente_asignado;
                    if (sesion.estado === 'con_novedad_reemplazo' && sesion.id_docente) {
                        docenteId = sesion.id_docente;
                    }
                    
                    const docente = docenteCache.get(docenteId);
                    
                    // ✅ NUEVO: Verificar si ya existe enlace (consulta directa a Firestore)
                    const enlaceExistente = await verificarEnlaceExistente(aula.id, sesion.sesion);
                    
                    clasesDeHoy.push({
                        aulaId: aula.id,
                        aulaCodigo: aula.codigo_aula,
                        programa: aula.programa,
                        docenteId: docenteId,
                        docenteNombre: docente ? docente.nombre_completo : 'No asignado',
                        sesionNum: sesion.sesion,
                        sesionEstado: sesion.estado,
                        horarioInicio: aula.horario_inicio,
                        horarioFin: aula.horario_fin,
                        fecha: sesion.fecha.toDate(),
                        enlaceExistente: enlaceExistente
                    });
                }
            });
            
            promises.push(promise);
        });

        await Promise.all(promises);

        // Ordenar por horario de inicio
        clasesDeHoy.sort((a, b) => a.horarioInicio.localeCompare(b.horarioInicio));

        if (clasesDeHoy.length === 0) {
            renderEmptyState('No hay clases programadas para hoy.');
        } else {
            renderTable();
        }

    } catch (error) {
        console.error("❌ Error cargando clases:", error);
        renderEmptyState('Error al cargar las clases programadas.');
    }
}

/**
 * ✅ V2.2: Renderiza la tabla con información temporal y estados
 */
function renderTable() {
    let tableHtml = `
        <table class="min-w-full divide-y divide-gray-200">
            <thead class="bg-gray-50">
                <tr>
                    <th class="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Código</th>
                    <th class="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Docente</th>
                    <th class="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Sesión</th>
                    <th class="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Horario</th>
                    <th class="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Estado</th>
                    <th class="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Temporal</th>
                    <th class="px-6 py-3 text-right text-xs font-medium uppercase text-gray-500">Acciones</th>
                </tr>
            </thead>
            <tbody class="divide-y divide-gray-200 bg-white">
    `;
    
    clasesDeHoy.forEach((clase, index) => {
        // Calcular información temporal
        const infoTemporal = calcularInfoTemporal(clase);
        
        // Badge de estado de sesión
        let estadoBadge = '';
        if (clase.sesionEstado === 'programada') {
            estadoBadge = '<span class="badge status-pending">Normal</span>';
        } else if (clase.sesionEstado === 'reprogramada') {
            estadoBadge = '<span class="badge" style="background-color: #fff3cd; color: #856404;">Reprogramada</span>';
        } else if (clase.sesionEstado === 'con_novedad_reemplazo') {
            estadoBadge = '<span class="badge" style="background-color: #d1ecf1; color: #0c5460;">Reemplazo</span>';
        }
        
        // Badge temporal
        const badgeTemporal = `<span class="badge ${infoTemporal.badge}">${infoTemporal.mensaje}</span>`;
        
        // Botones
        let botonesHtml = '';
        
        if (clase.enlaceExistente) {
            // Ya tiene enlace existente
            botonesHtml = `
                <button 
                    type="button" 
                    data-index="${index}"
                    class="generate-link-btn btn btn-sm"
                    style="background-color: #10b981; color: white;">
                    <i class="fas fa-check mr-1"></i> Ver enlace
                </button>
            `;
        
} else if (!infoTemporal.puedeGenerar) {
    // No puede generar (o ya expiró el plazo de 4 horas)
    const esExpirado = infoTemporal.estado === 'terminada';
    const iconoBtn = esExpirado ? 'fa-ban' : 'fa-clock';
    const textoBtn = esExpirado ? 'Expirado' : 'Pendiente';
    
    botonesHtml = `
        <button 
            type="button" 
            disabled
            class="btn btn-sm"
            style="background-color: #dadce0; color: #80868b; cursor: not-allowed;"
            title="${esExpirado ? 'El plazo de 4 horas ya expiró' : 'Aún no ha terminado la clase'}">
            <i class="fas ${iconoBtn} mr-1"></i> ${textoBtn}
        </button>
    `;

        } else {
            // Puede generar
            botonesHtml = `
                <button 
                    type="button" 
                    data-index="${index}"
                    class="generate-link-btn btn btn-primary btn-sm">
                    <i class="fas fa-link mr-1"></i> Generar
                </button>
            `;
        }
        
        tableHtml += `
            <tr class="hover:bg-gray-50">
                <td class="px-6 py-4 text-sm font-medium text-gray-900">${clase.aulaCodigo}</td>
                <td class="px-6 py-4 text-sm text-gray-700">${clase.docenteNombre}</td>
                <td class="px-6 py-4 text-sm text-gray-500">Sesión ${clase.sesionNum}</td>
                <td class="px-6 py-4 text-sm text-gray-500 font-mono">${clase.horarioInicio} - ${clase.horarioFin}</td>
                <td class="px-6 py-4 text-sm">${estadoBadge}</td>
                <td class="px-6 py-4 text-sm">${badgeTemporal}</td>
                <td class="px-6 py-4 text-right text-sm font-medium">
                    ${botonesHtml}
                </td>
            </tr>
        `;
    });
    
    tableHtml += `</tbody></table>`;
    
    tableContainer.innerHTML = tableHtml;
    console.log(`✅ ${clasesDeHoy.length} clases renderizadas`);
}

/**
 * Renderiza estado vacío
 */
function renderEmptyState(mensaje) {
    tableContainer.innerHTML = `
        <div class="p-12 text-center">
            <i class="fas fa-calendar-times text-6xl text-gray-300 mb-4"></i>
            <p class="text-gray-500">${mensaje}</p>
        </div>
    `;
}

/**
 * ✅ V2.2: Genera enlace o muestra existente (con verificación doble)
 */
async function handleGenerateLink(clase) {
    try {
        // ✅ PASO 1: Verificar de nuevo en Firestore (por si acaso)
        const enlaceExistente = await verificarEnlaceExistente(clase.aulaId, clase.sesionNum);
        
        if (enlaceExistente) {
            // Ya existe, mostrar el existente
            const enlaceCompleto = `https://dash.ipch.net.pe/sfd/encuesta.html?ticket=${enlaceExistente.id}`;
            
            const infoTemporal = calcularInfoTemporal(clase);
            
            modalAulaCodigo.textContent = clase.aulaCodigo;
            modalDocenteNombre.textContent = clase.docenteNombre;
            modalSesionNum.textContent = `Sesión ${clase.sesionNum}`;
            modalHorario.textContent = `${clase.horarioInicio} - ${clase.horarioFin}`;
            modalLinkInput.value = enlaceCompleto;
            
            if (modalExpirationInfo) {
                modalExpirationInfo.innerHTML = `
                    <div class="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
                        <p class="text-sm text-blue-800">
                            <i class="fas fa-info-circle mr-2"></i>
                            <strong>Enlace existente</strong> - ${infoTemporal.mensajeExpiracion}
                        </p>
                    </div>
                `;
            }
            
            enlaceModal.classList.remove('hidden');
            console.log(`ℹ️ Mostrando enlace existente para ${clase.aulaCodigo} sesión ${clase.sesionNum}`);
            return;
        }
        
        // ✅ PASO 2: Validar que la sesión haya terminado
        const infoTemporal = calcularInfoTemporal(clase);
        if (!infoTemporal.puedeGenerar) {
            alert(`⏰ No se puede generar el enlace aún.\n\n${infoTemporal.mensaje}`);
            return;
        }
        
        // ✅ PASO 3: Generar nuevo enlace
        const fechaExpiracion = calcularExpiracionTicket(clase.fecha, clase.horarioFin);
        
        console.log(`🔍 Generando nuevo ticket para ${clase.aulaCodigo} sesión ${clase.sesionNum}`);
        
        const enlaceData = {
            id_aula: clase.aulaId,
            id_docente: clase.docenteId,
            sesion: clase.sesionNum,
            expira: Timestamp.fromDate(fechaExpiracion),
            usado: false
        };
        
        const docRef = await addDoc(collection(db, 'sfd_enlaces_activos'), enlaceData);
        const ticketId = docRef.id;
        const enlaceCompleto = `https://dash.ipch.net.pe/sfd/encuesta.html?ticket=${ticketId}`;
        
        // Mostrar modal
        modalAulaCodigo.textContent = clase.aulaCodigo;
        modalDocenteNombre.textContent = clase.docenteNombre;
        modalSesionNum.textContent = `Sesión ${clase.sesionNum}`;
        modalHorario.textContent = `${clase.horarioInicio} - ${clase.horarioFin}`;
        modalLinkInput.value = enlaceCompleto;
        
        if (modalExpirationInfo) {
            modalExpirationInfo.innerHTML = `
                <div class="mt-4 p-3 bg-green-50 rounded-lg border border-green-200">
                    <p class="text-sm text-green-800">
                        <i class="fas fa-check-circle mr-2"></i>
                        <strong>Enlace generado</strong> - ${infoTemporal.mensajeExpiracion}
                    </p>
                </div>
            `;
        }
        
        enlaceModal.classList.remove('hidden');
        
        console.log(`✅ Enlace generado exitosamente - Ticket: ${ticketId}`);
        
        // ✅ PASO 4: Recargar tabla después de 1 segundo (dar tiempo a Firestore)
        setTimeout(() => {
            console.log('🔄 Recargando tabla...');
            loadScheduledClasses();
        }, 1000);

    } catch (error) {
        console.error("❌ Error:", error);
        alert('Error al generar el enlace: ' + error.message);
    }
}

/**
 * Copia el enlace del modal al portapapeles
 */
function copyModalLinkToClipboard() {
    modalLinkInput.select();
    try {
        document.execCommand('copy');
        modalCopyButton.innerHTML = '<i class="fas fa-check mr-2"></i> ¡Copiado!';
        modalCopyButton.classList.add('btn-success');
        modalCopyButton.classList.remove('btn-primary');
        
        setTimeout(() => {
            modalCopyButton.innerHTML = '<i class="fas fa-copy mr-2"></i> Copiar';
            modalCopyButton.classList.remove('btn-success');
            modalCopyButton.classList.add('btn-primary');
        }, 2000);
    } catch (err) {
        console.error('Error al copiar:', err);
        alert('No se pudo copiar el enlace.');
    }
}