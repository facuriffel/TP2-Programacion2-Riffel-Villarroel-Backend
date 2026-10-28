const db = require('../database/db');

const FORMATO_FECHA = /^\d{4}-\d{2}-\d{2}$/;

const validarRango = ({ desde, hasta }) => {
    if ((desde && !FORMATO_FECHA.test(desde)) || (hasta && !FORMATO_FECHA.test(hasta))) {
        return 'Las fechas deben tener formato YYYY-MM-DD';
    }
    if (desde && hasta && desde > hasta) {
        return 'La fecha "desde" no puede ser posterior a "hasta"';
    }
    return null;
};

const rangoInvalido = (res, mensaje) =>
    res.status(400).json({ codigo: 400, estado: 'error', datos: { mensaje } });

// Agrega al WHERE el filtro por rango de fechas sobre turno.fecha
const filtrarFechas = ({ desde, hasta }, params) => {
    let sql = '';
    if (desde) {
        sql += ' AND t.fecha >= ?';
        params.push(desde);
    }
    if (hasta) {
        sql += ' AND t.fecha <= ?';
        params.push(hasta);
    }
    return sql;
};

const errorReporte = (res, error, mensaje) => {
    console.error('Error en reporte:', error);
    res.status(500).json({
        codigo: 500,
        estado: 'error',
        datos: { mensaje, detalle: error.message }
    });
};

/**
 * Ejecuta una consulta de reporte con filtro de fechas y responde 200
 * con { [clave]: [] } cuando no hay filas.
 */
const reporteLista = (clave, sqlBase, sqlFin, mapear, mensajeError) => async (req, res) => {
    const { desde, hasta } = req.query;
    const errorRango = validarRango({ desde, hasta });
    if (errorRango) return rangoInvalido(res, errorRango);

    try {
        const params = [];
        const sql = sqlBase + filtrarFechas({ desde, hasta }, params) + sqlFin;
        const [rows] = await db.query(sql, params);
        const lista = Array.isArray(rows) ? rows.map(mapear) : [];

        res.status(200).json({ codigo: 200, estado: 'ok', datos: { [clave]: lista } });
    } catch (error) {
        errorReporte(res, error, mensajeError);
    }
};

/**
 * GET /reportes/especialidades
 * Conteo de turnos por especialidad (la especialidad vive en agenda)
 */
const obtenerTurnosPorEspecialidad = reporteLista(
    'especialidades',
    `SELECT
        e.id AS id_especialidad,
        e.descripcion AS descripcion,
        COUNT(t.id) AS cantidad_turnos
    FROM turno t
    INNER JOIN agenda a ON t.id_agenda = a.id
    INNER JOIN especialidad e ON a.id_especialidad = e.id
    WHERE 1=1`,
    ' GROUP BY e.id, e.descripcion ORDER BY cantidad_turnos DESC, e.descripcion ASC',
    row => ({
        id_especialidad: row.id_especialidad,
        descripcion: row.descripcion,
        cantidad_turnos: Number(row.cantidad_turnos) || 0
    }),
    'Error al obtener reporte de turnos por especialidad'
);

/**
 * GET /reportes/sedes
 * Conteo de turnos por sede (la sede vive en agenda)
 */
const obtenerTurnosPorSede = reporteLista(
    'sedes',
    `SELECT
        s.id AS id_sede,
        s.nombre AS nombre,
        COUNT(t.id) AS cantidad_turnos
    FROM turno t
    INNER JOIN agenda a ON t.id_agenda = a.id
    INNER JOIN sede s ON a.id_sede = s.id
    WHERE 1=1`,
    ' GROUP BY s.id, s.nombre ORDER BY cantidad_turnos DESC, s.nombre ASC',
    row => ({
        id_sede: row.id_sede,
        nombre: row.nombre,
        cantidad_turnos: Number(row.cantidad_turnos) || 0
    }),
    'Error al obtener reporte de turnos por sede'
);

/**
 * GET /reportes/ranking-medicos
 * Médicos ordenados por cantidad de turnos atendidos (el médico vive en agenda)
 */
const obtenerRankingMedicos = reporteLista(
    'ranking',
    `SELECT
        u.id AS id_medico,
        u.nombre AS nombre,
        u.apellido AS apellido,
        COUNT(t.id) AS cantidad_turnos
    FROM turno t
    INNER JOIN agenda a ON t.id_agenda = a.id
    INNER JOIN usuario u ON a.id_medico = u.id
    WHERE t.estado = 'atendido'`,
    ' GROUP BY u.id, u.nombre, u.apellido ORDER BY cantidad_turnos DESC, u.apellido ASC, u.nombre ASC',
    row => ({
        id_medico: row.id_medico,
        nombre: row.nombre,
        apellido: row.apellido,
        cantidad_turnos: Number(row.cantidad_turnos) || 0
    }),
    'Error al obtener ranking de médicos'
);

/**
 * GET /reportes/tasa-cancelacion
 * Turnos cancelados / total * 100; 0 si no hay turnos en el rango
 */
const obtenerTasaCancelacion = async (req, res) => {
    const { desde, hasta } = req.query;
    const errorRango = validarRango({ desde, hasta });
    if (errorRango) return rangoInvalido(res, errorRango);

    try {
        const params = [];
        const sql = `SELECT
                COUNT(t.id) AS total_turnos,
                COALESCE(SUM(CASE WHEN t.estado = 'cancelado' THEN 1 ELSE 0 END), 0) AS turnos_cancelados
            FROM turno t
            WHERE 1=1` + filtrarFechas({ desde, hasta }, params);

        const [rows] = await db.query(sql, params);

        const total_turnos = Number(rows?.[0]?.total_turnos) || 0;
        const turnos_cancelados = Number(rows?.[0]?.turnos_cancelados) || 0;
        const tasa_cancelacion = total_turnos > 0
            ? Number(((turnos_cancelados / total_turnos) * 100).toFixed(2))
            : 0;

        res.status(200).json({
            codigo: 200,
            estado: 'ok',
            datos: { total_turnos, turnos_cancelados, tasa_cancelacion }
        });
    } catch (error) {
        errorReporte(res, error, 'Error al obtener tasa de cancelación');
    }
};

module.exports = {
    obtenerTurnosPorEspecialidad,
    obtenerTurnosPorSede,
    obtenerRankingMedicos,
    obtenerTasaCancelacion
};
