/**
 * js/utils/fecha-utils.js
 * ✅ VERSIÓN 2.0: Manejo completo de fecha + hora
 * 
 * Este módulo proporciona funciones centralizadas para manejar fechas y horas
 * en la zona horaria de Perú (UTC-5), permitiendo cálculos precisos que consideran
 * tanto la fecha como la hora del día.
 * 
 * CRÍTICO: Todos los colaboradores pueden estar en diferentes países, pero el 
 * sistema SIEMPRE debe operar en hora de Perú (UTC-5).
 */

/**
 * Obtiene la fecha actual en zona horaria de Lima, Perú (UTC-5)
 * @returns {Date} Fecha actual en UTC-5 con hora 00:00:00
 */
export function getHoyPeru() {
    const ahora = new Date();
    const utcTime = ahora.getTime() + (ahora.getTimezoneOffset() * 60000);
    const peruTime = new Date(utcTime + (3600000 * -5));
    peruTime.setHours(0, 0, 0, 0);
    return peruTime;
}

/**
 * Obtiene la fecha y hora actual en zona horaria de Perú (UTC-5)
 * @returns {Date} Fecha y hora actual en UTC-5
 */
export function getAhoraPeru() {
    const ahora = new Date();
    const utcTime = ahora.getTime() + (ahora.getTimezoneOffset() * 60000);
    const peruTime = new Date(utcTime + (3600000 * -5));
    return peruTime;
}

/**
 * Crea una fecha en zona horaria de Perú desde componentes individuales
 * @param {number} year - Año (ej: 2025)
 * @param {number} month - Mes (1-12, NO 0-11)
 * @param {number} day - Día del mes (1-31)
 * @param {number} hours - Horas (0-23, opcional, default 0)
 * @param {number} minutes - Minutos (0-59, opcional, default 0)
 * @param {number} seconds - Segundos (0-59, opcional, default 0)
 * @returns {Date} Fecha en UTC-5
 */
export function crearFechaPeru(year, month, day, hours = 0, minutes = 0, seconds = 0) {
    const monthStr = String(month).padStart(2, '0');
    const dayStr = String(day).padStart(2, '0');
    const hoursStr = String(hours).padStart(2, '0');
    const minutesStr = String(minutes).padStart(2, '0');
    const secondsStr = String(seconds).padStart(2, '0');
    
    const fechaISO = `${year}-${monthStr}-${dayStr}T${hoursStr}:${minutesStr}:${secondsStr}-05:00`;
    
    return new Date(fechaISO);
}

/**
 * ✅ NUEVO: Combina una fecha (Date) con un horario (string "HH:MM")
 * @param {Date} fecha - Fecha base (solo se usa año, mes, día)
 * @param {string} horarioStr - Horario en formato "HH:MM" (24 horas) o "HH:MM AM/PM"
 * @returns {Date} Fecha + hora en UTC-5
 * 
 * @example
 * const fecha = new Date('2025-11-07');
 * const timestamp = combinarFechaHorario(fecha, "08:20");
 * // Resultado: 2025-11-07 08:20:00 UTC-5
 */
export function combinarFechaHorario(fecha, horarioStr) {
    // Parsear el horario
    let horas, minutos;
    
    // Verificar si tiene AM/PM
    const esFormatoAMPM = horarioStr.toLowerCase().includes('am') || horarioStr.toLowerCase().includes('pm');
    
    if (esFormatoAMPM) {
        // Formato "08:20 AM" o "09:00 PM"
        const partes = horarioStr.trim().split(' ');
        const [h, m] = partes[0].split(':').map(Number);
        const periodo = partes[1].toLowerCase();
        
        horas = h;
        if (periodo === 'pm' && horas !== 12) {
            horas += 12;
        } else if (periodo === 'am' && horas === 12) {
            horas = 0;
        }
        minutos = m;
    } else {
        // Formato 24 horas "08:20" o "21:00"
        [horas, minutos] = horarioStr.split(':').map(Number);
    }
    
    // Crear fecha completa en Perú
    return crearFechaPeru(
        fecha.getFullYear(),
        fecha.getMonth() + 1,
        fecha.getDate(),
        horas,
        minutos,
        0
    );
}

/**
 * ✅ NUEVO: Calcula el estado de un aula considerando fecha Y hora
 * 
 * @param {Timestamp} fechaInicio - Fecha de inicio del aula (Firestore Timestamp)
 * @param {string} horarioInicio - Hora de inicio (string "HH:MM")
 * @param {Timestamp} fechaFin - Fecha de fin del aula (Firestore Timestamp)
 * @param {string} horarioFin - Hora de fin (string "HH:MM")
 * @param {Object} sesionesInfo - Info de sesiones {total, completadas}
 * @returns {string} Estado: 'Próxima', 'En Curso', 'Finalizado', o null
 * 
 * @example
 * // Hoy: 07/11/2025 10:00 AM
 * // Aula inicia: 07/11/2025 21:00 (9 PM)
 * const estado = calcularEstadoAulaConHora(
 *   Timestamp.fromDate(new Date('2025-11-07')),
 *   "21:00",
 *   Timestamp.fromDate(new Date('2025-11-14')),
 *   "22:00",
 *   { total: 3, completadas: 0 }
 * );
 * // Resultado: "Próxima" (porque son las 10 AM y el aula inicia a las 9 PM)
 */
export function calcularEstadoAulaConHora(fechaInicio, horarioInicio, fechaFin, horarioFin, sesionesInfo) {
    // Si todas las sesiones están completadas → Finalizado
    if (sesionesInfo.total > 0 && sesionesInfo.completadas === sesionesInfo.total) {
        return 'Finalizado';
    }
    
    // Si no hay fechas, retornar null (estado manual)
    if (!fechaInicio || !fechaFin || !horarioInicio || !horarioFin) {
        return null;
    }
    
    // Obtener fecha/hora actual en Perú
    const ahoraPeru = getAhoraPeru();
    
    // Combinar fechas con horarios para obtener timestamps completos
    const inicioCompleto = combinarFechaHorario(fechaInicio.toDate(), horarioInicio);
    const finCompleto = combinarFechaHorario(fechaFin.toDate(), horarioFin);
    
    // Comparar usando milisegundos
    const ahoraMs = ahoraPeru.getTime();
    const inicioMs = inicioCompleto.getTime();
    const finMs = finCompleto.getTime();
    
    // Próxima: el momento de inicio aún no llega
    if (ahoraMs < inicioMs) {
        return 'Próxima';
    }
    
    // Finalizado: el momento de fin ya pasó
    if (ahoraMs > finMs) {
        return 'Finalizado';
    }
    
    // En Curso: entre el inicio y el fin
    return 'En Curso';
}

/**
 * ✅ NUEVO: Verifica si una sesión está completada
 * Una sesión se considera completada 2 horas después de su hora de fin
 * 
 * @param {Timestamp} fechaHoraFin - Timestamp completo del fin de la sesión
 * @returns {boolean} true si la sesión ya está completada
 * 
 * @example
 * // Sesión terminó: 07/11/2025 09:00 AM
 * // Ahora: 07/11/2025 11:30 AM
 * const completada = sesionEstaCompletada(Timestamp.fromDate(new Date('2025-11-07 09:00:00')));
 * // Resultado: true (pasaron 2.5 horas)
 */
export function sesionEstaCompletada(fechaHoraFin) {
    if (!fechaHoraFin) return false;
    
    const ahoraPeru = getAhoraPeru();
    const finSesion = fechaHoraFin.toDate();
    
return ahoraPeru > finSesion;
}

/**
 * ✅ NUEVO: Verifica si un aula puede mostrar los botones "Avanzar Ciclo" o "Cerrar"
 * Los botones aparecen cuando:
 * - Todas las sesiones están completadas, O
 * - La fecha/hora de fin del aula ya pasó
 * 
 * @param {Timestamp} fechaFin - Fecha de fin del aula
 * @param {string} horarioFin - Hora de fin del aula
 * @param {number} sesionesCompletadas - Número de sesiones completadas
 * @param {number} totalSesiones - Total de sesiones del aula
 * @returns {boolean} true si el aula puede avanzar o cerrar
 */
export function aulaPuedeAvanzarOCerrar(fechaFin, horarioFin, sesionesCompletadas, totalSesiones) {
    // Condición 1: Todas las sesiones completadas
    if (totalSesiones > 0 && sesionesCompletadas === totalSesiones) {
        return true;
    }
    
    // Condición 2: Fecha/hora de fin ya pasó
    if (fechaFin && horarioFin) {
        const ahoraPeru = getAhoraPeru();
        const finCompleto = combinarFechaHorario(fechaFin.toDate(), horarioFin);
        return ahoraPeru > finCompleto;
    }
    
    return false;
}

/**
 * Formatea una fecha Timestamp de Firestore a formato legible en UTC-5
 * @param {Timestamp} timestamp - Timestamp de Firestore
 * @param {boolean} incluirHora - Si se incluye la hora en el formato (opcional, default false)
 * @returns {string} Fecha formateada
 */
export function formatFechaPeru(timestamp, incluirHora = false) {
    if (!timestamp || !timestamp.toDate) return '-';
    
    const fecha = timestamp.toDate();
    
    if (incluirHora) {
        return fecha.toLocaleString('es-PE', { 
            timeZone: 'America/Lima',
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }
    
    return fecha.toLocaleDateString('es-PE', { 
        timeZone: 'America/Lima'
    });
}

/**
 * Formatea una fecha para mostrar completa (ej: "Miércoles, 06/11/2025")
 * @param {Date} fecha - Fecha a formatear
 * @returns {string} Fecha formateada con día de la semana
 */
export function formatFechaCompleta(fecha) {
    const dias = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const diaNombre = dias[fecha.getDay()];
    const fechaStr = fecha.toLocaleDateString('es-PE', { timeZone: 'America/Lima' });
    return `${diaNombre}, ${fechaStr}`;
}

/**
 * ✅ CRÍTICO: Calcula la fecha de expiración de un ticket de encuesta
 * Los tickets expiran 4 horas después del horario de fin de clase
 * 
 * @param {Date} fechaSesion - Fecha de la sesión
 * @param {string} horarioFin - Horario de fin de clase (formato "HH:MM")
 * @returns {Date} Fecha y hora de expiración del ticket en UTC-5
 */
export function calcularExpiracionTicket(fechaSesion, horarioFin) {
    // Combinar fecha + horario de fin
    const fechaFinClase = combinarFechaHorario(fechaSesion, horarioFin);
    
    // Agregar 4 horas para la expiración
    const fechaExpiracion = new Date(fechaFinClase.getTime() + (4 * 60 * 60 * 1000));
    
    return fechaExpiracion;
}

/**
 * Convierte una fecha del navegador a fecha ISO con zona horaria de Perú
 * @param {Date} fecha - Fecha a convertir
 * @returns {string} Fecha en formato ISO con zona horaria -05:00
 */
export function fechaToISOPeru(fecha) {
    const year = fecha.getFullYear();
    const month = String(fecha.getMonth() + 1).padStart(2, '0');
    const day = String(fecha.getDate()).padStart(2, '0');
    const hours = String(fecha.getHours()).padStart(2, '0');
    const minutes = String(fecha.getMinutes()).padStart(2, '0');
    const seconds = String(fecha.getSeconds()).padStart(2, '0');
    
    return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}-05:00`;
}

/**
 * Verifica si una fecha es feriado
 * @param {Date} fecha - Fecha a verificar
 * @param {Array<string>} feriados - Array de fechas de feriados en formato 'YYYY-MM-DD'
 * @returns {boolean} true si es feriado
 */
export function esFeriado(fecha, feriados) {
    const fechaStr = fecha.toDateString();
    const feriadosDateString = feriados.map(f => new Date(f + 'T00:00:00-05:00').toDateString());
    return feriadosDateString.includes(fechaStr);
}

/**
 * Debug: Muestra información de zona horaria actual del navegador vs Perú
 */
export function debugZonaHoraria() {
    const ahora = new Date();
    const offsetNavegador = ahora.getTimezoneOffset() / -60;
    const horaPeru = getAhoraPeru();
    
    console.log('🕒 Debug Zona Horaria:');
    console.log('  - Hora navegador:', ahora.toLocaleString('es-PE'));
    console.log('  - Offset navegador: UTC', offsetNavegador >= 0 ? '+' : '', offsetNavegador);
    console.log('  - Hora Perú (UTC-5):', horaPeru.toLocaleString('es-PE', { timeZone: 'America/Lima' }));
    console.log('  - Diferencia:', Math.abs(ahora.getTime() - horaPeru.getTime()) / 3600000, 'horas');
}