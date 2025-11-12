/**
 * js/config/feriados.js
 * ✅ CONFIGURACIÓN CENTRALIZADA DE FERIADOS
 * 
 * INSTRUCCIONES DE USO:
 * 1. Para agregar un feriado: añade la fecha en formato 'YYYY-MM-DD'
 * 2. Mantén el orden cronológico
 * 3. Agrega comentarios descriptivos
 * 4. Actualiza FERIADOS_ACTIVOS al cambiar de año
 * 
 * ÚLTIMA ACTUALIZACIÓN: Noviembre 2025
 */

// ========================================
// FERIADOS 2025-2026
// ========================================
export const FERIADOS_2025_2026 = [
    // Diciembre 2025
    '2025-12-08', // Inmaculada Concepción
    '2025-12-09', // Batalla de Ayacucho
    '2025-12-24', // Nochebuena
    '2025-12-25', // Navidad
    '2025-12-31', // Fin de Año
    
    // Enero 2026
    '2026-01-01', // Año Nuevo
    
    // Abril 2026 (Semana Santa - fechas móviles)
    '2026-04-02', // Jueves Santo
    '2026-04-03', // Viernes Santo
    '2026-04-05', // Domingo de Resurrección
    
    // Mayo 2026
    '2026-05-01', // Día del Trabajo
    
    // Junio 2026
    '2026-06-29', // San Pedro y San Pablo
    
    // Julio 2026 (Fiestas Patrias)
    '2026-07-28', // Día de la Independencia
    '2026-07-29', // Fiestas Patrias (día 2)
    
    // Agosto 2026
    '2026-08-30', // Santa Rosa de Lima
    
    // Octubre 2026
    '2026-10-08', // Combate de Angamos
    
    // Noviembre 2026
    '2026-11-01', // Todos los Santos
    
    // Diciembre 2026
    '2026-12-08', // Inmaculada Concepción
    '2026-12-25'  // Navidad
];

// ========================================
// FERIADOS 2027 (para futuro uso)
// ========================================
// Descomentar y completar cuando llegue el momento
export const FERIADOS_2027 = [
    // '2027-01-01', // Año Nuevo
    // '2027-03-25', // Jueves Santo (verificar fecha exacta cada año)
    // '2027-03-26', // Viernes Santo
    // '2027-05-01', // Día del Trabajo
    // '2027-06-29', // San Pedro y San Pablo
    // '2027-07-28', // Día de la Independencia
    // '2027-07-29', // Fiestas Patrias
    // '2027-08-30', // Santa Rosa de Lima
    // '2027-10-08', // Combate de Angamos
    // '2027-11-01', // Todos los Santos
    // '2027-12-08', // Inmaculada Concepción
    // '2027-12-25'  // Navidad
];

// ========================================
// LISTA ACTIVA (la que usa el sistema)
// ========================================
// ⚠️ IMPORTANTE: Al cambiar de año, actualizar esta lista
// Ejemplo para 2027: agregar ...FERIADOS_2027
export const FERIADOS_ACTIVOS = [
    ...FERIADOS_2025_2026
    // Cuando llegue 2027, descomentar la siguiente línea:
    // ...FERIADOS_2027
];

// ========================================
// INFORMACIÓN DEL SISTEMA
// ========================================
console.log(`✅ Configuración de feriados cargada: ${FERIADOS_ACTIVOS.length} fechas activas`);