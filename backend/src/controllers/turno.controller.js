const db = require('../database/db');
const { registrarAuditoria } = require('../services/auditoria.service');

// Función auxiliar interna para generar notificaciones automáticamente
const crearNotificacionInterna = async (id_usuario, tipo, mensaje) => {
    try {
        await db.query(
            'INSERT INTO notificacion (id_usuario, tipo, mensaje, leida, fecha) VALUES (?, ?, ?, 0, NOW())',
            [id_usuario, tipo, mensaje]
        );
    } catch (error) {
        console.error('Error al generar notificación interna:', error.message);
    }
};

const crearTurno = async (req, res) => {
    const { id_especialidad, id_sede, id_medico, fecha, hora, nota, id_paciente_body } = req.body;

    if (!nota || nota.trim() === "") {
        return res.status(400).json({
            codigo: 400,
            estado: "error",
            datos: { mensaje: "La nota del turno es obligatoria." }
        });
    }

    if (req.usuario.rol === 'operador' && Number(id_sede) !== Number(req.usuario.id_sede)) {
        return res.status(403).json({
            codigo: 403,
            estado: "error",
            datos: { mensaje: "El operador solo puede crear turnos en su sede asignada" }
        });
    }

    try {
        // Determinar paciente según el rol autenticado
        let id_paciente = req.usuario.id;
        if (req.usuario.rol === 'operador') {
            if (!id_paciente_body) {
                return res.status(400).json({
                    codigo: 400,
                    estado: "error",
                    datos: { mensaje: "El operador debe especificar el id_paciente." }
                });
            }
            id_paciente = id_paciente_body;
        }

        // Obtener la cobertura registrada del paciente de forma automática
        const [pacienteRows] = await db.query('SELECT id_cobertura, nombre, apellido FROM usuario WHERE id = ?', [id_paciente]);
        if (pacienteRows.length === 0) {
            return res.status(404).json({
                codigo: 404,
                estado: "error",
                datos: { mensaje: "El paciente indicado no existe." }
            });
        }
        const id_cobertura = pacienteRows[0].id_cobertura;

        // Validar disponibilidad en la agenda del médico
        const [agendaRows] = await db.query(
            `SELECT id FROM agenda 
             WHERE id_medico = ? AND id_sede = ? AND id_especialidad = ? AND fecha = ? 
             AND ? >= hora_entrada AND ? < hora_salida`,
            [id_medico, id_sede, id_especialidad, fecha, hora, hora]
        );

        if (agendaRows.length === 0) {
            return res.status(400).json({
                codigo: 400,
                estado: "error",
                datos: { mensaje: "El horario solicitado no se encuentra disponible en la agenda del médico." }
            });
        }

        // Validar que no haya superposición con otro turno confirmado
        const [superpuestoRows] = await db.query(
            `SELECT t.id FROM turno t
             INNER JOIN agenda a ON t.id_agenda = a.id
             WHERE a.id_medico = ? AND t.fecha = ? AND t.hora = ? AND t.estado = 'confirmado'`,
            [id_medico, fecha, hora]
        );

        if (superpuestoRows.length > 0) {
            return res.status(400).json({
                codigo: 400,
                estado: "error",
                datos: { mensaje: "Ya existe un turno confirmado para ese médico en la fecha y hora solicitadas." }
            });
        }

        const id_agenda = agendaRows[0].id;

        // Insertar turno con estado confirmado
        const insertQuery = `
            INSERT INTO turno (fecha, hora, estado, nota, id_paciente, id_agenda, id_cobertura) 
            VALUES (?, ?, 'confirmado', ?, ?, ?, ?)
        `;
        const [resultadoTurno] = await db.query(insertQuery, [fecha, hora, nota, id_paciente, id_agenda, id_cobertura]);

        await registrarAuditoria({
            id_usuario: req.usuario.id,
            accion: 'ALTA',
            tabla: 'turno',
            id_registro: resultadoTurno.insertId,
            detalle: `Reserva de turno para ${pacienteRows[0].nombre} ${pacienteRows[0].apellido} el ${fecha} a las ${hora} hs`
        });

        // Disparar notificación automática al paciente
        await crearNotificacionInterna(
            id_paciente,
            'turno_confirmado',
            `Tu turno para el ${fecha} a las ${hora} hs ha sido confirmado.`
        );

        res.status(201).json({
            codigo: 201,
            estado: "ok",
            datos: { mensaje: "Turno reservado y confirmado exitosamente." }
        });
    } catch (error) {
        res.status(500).json({ codigo: 500, estado: "error", datos: { mensaje: "Error al crear el turno", detalle: error.message } });
    }
};

const cancelarTurno = async (req, res) => {
    const { id } = req.params;

    try {
        const [turnoRows] = await db.query(`
            SELECT t.*, a.id_medico, a.id_sede 
            FROM turno t
            INNER JOIN agenda a ON t.id_agenda = a.id
            WHERE t.id = ?
        `, [id]);
        if (turnoRows.length === 0) {
            return res.status(404).json({
                codigo: 404,
                estado: "error",
                datos: { mensaje: "Turno no encontrado." }
            });
        }

        const turno = turnoRows[0];

        // Validar permisos por rol para cancelación
        if (req.usuario.rol === 'paciente' && turno.id_paciente !== req.usuario.id) {
            return res.status(403).json({
                codigo: 403,
                estado: "error",
                datos: { mensaje: "Acceso denegado. Solo podés cancelar tus propios turnos." }
            });
        }

        if (req.usuario.rol === 'medico' && turno.id_medico !== req.usuario.id) {
            return res.status(403).json({
                codigo: 403,
                estado: "error",
                datos: { mensaje: "Acceso denegado. Solo podés cancelar turnos de tu agenda." }
            });
        }

        if (req.usuario.rol === 'operador' && turno.id_sede !== req.usuario.id_sede) {
            return res.status(403).json({
                codigo: 403,
                estado: "error",
                datos: { mensaje: "Acceso denegado. Solo podés cancelar turnos correspondientes a tu sede." }
            });
        }

        await db.query("UPDATE turno SET estado = 'cancelado' WHERE id = ?", [id]);

        await registrarAuditoria({
            id_usuario: req.usuario.id,
            accion: 'MODIFICACION',
            tabla: 'turno',
            id_registro: id,
            detalle: `Cancelación de turno del paciente ID ${turno.id_paciente} del día ${formatearFecha(turno.fecha)} a las ${String(turno.hora).slice(0, 5)} hs`
        });

        // Disparar notificación automática al paciente
        await crearNotificacionInterna(
            turno.id_paciente,
            'turno_cancelado',
            `Tu turno del día ${formatearFecha(turno.fecha)} a las ${String(turno.hora).slice(0, 5)} hs ha sido cancelado.`
        );

        res.status(200).json({
            codigo: 200,
            estado: "ok",
            datos: { mensaje: "Turno cancelado exitosamente." }
        });
    } catch (error) {
        res.status(500).json({ codigo: 500, estado: "error", datos: { mensaje: "Error al cancelar el turno", detalle: error.message } });
    }
};

const formatearFecha = (fecha) => {
    const d = fecha instanceof Date ? fecha : new Date(fecha);
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
};

const atenderTurno = async (req, res) => {
    const { id } = req.params;
    const { diagnostico, tratamiento, observaciones } = req.body || {};

    if (!diagnostico || !diagnostico.trim() || !tratamiento || !tratamiento.trim()) {
        return res.status(400).json({
            codigo: 400,
            estado: "error",
            datos: { mensaje: "El diagnóstico y el tratamiento son obligatorios." }
        });
    }

    const conexion = await db.getConnection();
    try {
        const [turnoRows] = await conexion.query(`
            SELECT t.*, a.id_medico
            FROM turno t
            INNER JOIN agenda a ON t.id_agenda = a.id
            WHERE t.id = ?
        `, [id]);
        if (turnoRows.length === 0) {
            return res.status(404).json({
                codigo: 404,
                estado: "error",
                datos: { mensaje: "Turno no encontrado." }
            });
        }

        const turno = turnoRows[0];

        // Obtener el id_medico que atiende: primero del usuario autenticado, sino del turno
        const id_medico = req.usuario?.id ?? turno.id_medico;

        if (id_medico == null) {
            return res.status(400).json({
                codigo: 400,
                estado: "error",
                datos: { mensaje: "No se pudo identificar al médico que atiende el turno" }
            });
        }

        // Solo el médico asignado puede marcarlo atendido
        if (turno.id_medico !== req.usuario.id) {
            return res.status(403).json({
                codigo: 403,
                estado: "error",
                datos: { mensaje: "Acceso denegado. Solo podés atender turnos asignados a tu usuario." }
            });
        }

        if (turno.estado !== 'confirmado') {
            return res.status(400).json({
                codigo: 400,
                estado: "error",
                datos: { mensaje: "Solo se pueden atender turnos confirmados." }
            });
        }

        await conexion.beginTransaction();
        await conexion.query("UPDATE turno SET estado = 'atendido' WHERE id = ?", [id]);
        const [resultadoHistorial] = await conexion.query(
            'INSERT INTO historial_clinico (id_turno, id_paciente, id_medico, diagnostico, tratamiento, observaciones, fecha) VALUES (?, ?, ?, ?, ?, ?, NOW())',
            [id, turno.id_paciente, id_medico, diagnostico.trim(), tratamiento.trim(), observaciones && observaciones.trim() ? observaciones.trim() : null]
        );

        await registrarAuditoria({
            id_usuario: req.usuario.id,
            accion: 'MODIFICACION',
            tabla: 'turno',
            id_registro: id,
            detalle: `Turno del paciente ID ${turno.id_paciente} marcado como atendido`,
            connection: conexion
        });

        await registrarAuditoria({
            id_usuario: req.usuario.id,
            accion: 'ALTA',
            tabla: 'historial_clinico',
            id_registro: resultadoHistorial.insertId,
            detalle: `Creación de ficha clínica para el paciente ID ${turno.id_paciente}, diagnóstico: ${diagnostico.trim()}`,
            connection: conexion
        });

        await conexion.commit();

        // Disparar notificación automática al paciente
        await crearNotificacionInterna(
            turno.id_paciente,
            'turno_atendido',
            `Tu turno del día ${formatearFecha(turno.fecha)} ha sido registrado como atendido.`
        );

        res.status(200).json({
            codigo: 200,
            estado: "ok",
            datos: { mensaje: "Turno marcado como atendido exitosamente." }
        });
    } catch (error) {
        await conexion.rollback();
        res.status(500).json({ codigo: 500, estado: "error", datos: { mensaje: "Error al atender el turno", detalle: error.message } });
    } finally {
        conexion.release();
    }
};

const COLUMNAS_TURNO = `
    t.id,
    DATE_FORMAT(t.fecha, '%Y-%m-%d') AS fecha,
    TIME_FORMAT(t.hora, '%H:%i') AS hora,
    t.estado, t.nota, t.id_paciente, t.id_agenda, t.id_cobertura,
    a.id_medico, a.id_sede, a.id_especialidad,
    p.nombre AS paciente_nombre, p.apellido AS paciente_apellido, p.dni AS paciente_dni,
    DATE_FORMAT(p.fecha_nacimiento, '%Y-%m-%d') AS paciente_fecha_nacimiento,
    m.nombre AS medico_nombre, m.apellido AS medico_apellido,
    s.nombre AS sede, e.descripcion AS especialidad`;

const JOINS_TURNO = `
    FROM turno t
    INNER JOIN agenda a ON t.id_agenda = a.id
    INNER JOIN usuario p ON t.id_paciente = p.id
    INNER JOIN usuario m ON a.id_medico = m.id
    INNER JOIN sede s ON a.id_sede = s.id
    INNER JOIN especialidad e ON a.id_especialidad = e.id`;

const listarTurnos = async (req, res) => {
    const { fecha, id_sede } = req.query;

    try {
        let query = `SELECT ${COLUMNAS_TURNO} ${JOINS_TURNO} WHERE 1=1`;
        const params = [];

        if (req.usuario.rol === 'paciente') {
            // "Mis turnos" ordenados del más próximo al menos próximo
            query += ' AND t.id_paciente = ?';
            params.push(req.usuario.id);
        } else if (req.usuario.rol === 'medico') {
            // Turnos del médico, filtrable por fecha y sede
            query += ' AND a.id_medico = ?';
            params.push(req.usuario.id);
            if (fecha) {
                query += ' AND t.fecha = ?';
                params.push(fecha);
            }
            if (id_sede) {
                query += ' AND a.id_sede = ?';
                params.push(id_sede);
            }
        } else if (req.usuario.rol === 'operador') {
            // Turnos de la sede del operador para una fecha
            query += ' AND a.id_sede = ?';
            params.push(req.usuario.id_sede);
            if (fecha) {
                query += ' AND t.fecha = ?';
                params.push(fecha);
            }
        }
        query += ' ORDER BY t.fecha ASC, t.hora ASC';

        const [rows] = await db.query(query, params);

        res.status(200).json({
            codigo: 200,
            estado: "ok",
            datos: { turnos: rows }
        });
    } catch (error) {
        res.status(500).json({ codigo: 500, estado: "error", datos: { mensaje: "Error al listar los turnos", detalle: error.message } });
    }
};

// Horarios libres (franjas de 30 minutos) dentro de la agenda de un médico para una fecha
const DURACION_TURNO_MIN = 30;

const aMinutos = (hhmm) => {
    const [h, m] = hhmm.split(':').map(Number);
    return h * 60 + m;
};

const aHHmm = (minutos) =>
    `${String(Math.floor(minutos / 60)).padStart(2, '0')}:${String(minutos % 60).padStart(2, '0')}`;

const listarDisponibilidad = async (req, res) => {
    const { id_medico, id_sede, id_especialidad, fecha } = req.query;

    if (!id_medico || !id_sede || !id_especialidad || !fecha) {
        return res.status(400).json({
            codigo: 400,
            estado: "error",
            datos: { mensaje: "Médico, sede, especialidad y fecha son obligatorios." }
        });
    }

    try {
        const [agendas] = await db.query(
            `SELECT TIME_FORMAT(hora_entrada, '%H:%i') AS hora_entrada, TIME_FORMAT(hora_salida, '%H:%i') AS hora_salida
             FROM agenda
             WHERE id_medico = ? AND id_sede = ? AND id_especialidad = ? AND fecha = ?`,
            [id_medico, id_sede, id_especialidad, fecha]
        );

        const [ocupados] = await db.query(
            `SELECT TIME_FORMAT(t.hora, '%H:%i') AS hora
             FROM turno t INNER JOIN agenda a ON t.id_agenda = a.id
             WHERE a.id_medico = ? AND t.fecha = ? AND t.estado = 'confirmado'`,
            [id_medico, fecha]
        );
        const horasOcupadas = new Set(ocupados.map(o => o.hora));

        const horarios = [];
        for (const agenda of agendas) {
            for (let m = aMinutos(agenda.hora_entrada); m + DURACION_TURNO_MIN <= aMinutos(agenda.hora_salida); m += DURACION_TURNO_MIN) {
                const hora = aHHmm(m);
                if (!horasOcupadas.has(hora)) horarios.push(hora);
            }
        }

        res.status(200).json({ codigo: 200, estado: "ok", datos: { horarios: [...new Set(horarios)].sort() } });
    } catch (error) {
        res.status(500).json({ codigo: 500, estado: "error", datos: { mensaje: "Error al consultar disponibilidad", detalle: error.message } });
    }
};

// Fechas futuras en las que el médico tiene agenda con al menos un horario libre
const listarFechasDisponibles = async (req, res) => {
    const { id_medico, id_sede, id_especialidad } = req.query;

    if (!id_medico || !id_sede || !id_especialidad) {
        return res.status(400).json({
            codigo: 400,
            estado: "error",
            datos: { mensaje: "Médico, sede y especialidad son obligatorios." }
        });
    }

    try {
        const [agendas] = await db.query(
            `SELECT DATE_FORMAT(fecha, '%Y-%m-%d') AS fecha,
                    TIME_FORMAT(hora_entrada, '%H:%i') AS hora_entrada, TIME_FORMAT(hora_salida, '%H:%i') AS hora_salida
             FROM agenda
             WHERE id_medico = ? AND id_sede = ? AND id_especialidad = ? AND fecha >= CURDATE()
             ORDER BY fecha ASC`,
            [id_medico, id_sede, id_especialidad]
        );
        const [ocupados] = await db.query(
            `SELECT DATE_FORMAT(t.fecha, '%Y-%m-%d') AS fecha, TIME_FORMAT(t.hora, '%H:%i') AS hora
             FROM turno t INNER JOIN agenda a ON t.id_agenda = a.id
             WHERE a.id_medico = ? AND t.fecha >= CURDATE() AND t.estado = 'confirmado'`,
            [id_medico]
        );
        const ocupadosSet = new Set(ocupados.map(o => `${o.fecha}|${o.hora}`));

        const fechas = new Set();
        for (const agenda of agendas) {
            for (let m = aMinutos(agenda.hora_entrada); m + DURACION_TURNO_MIN <= aMinutos(agenda.hora_salida); m += DURACION_TURNO_MIN) {
                if (!ocupadosSet.has(`${agenda.fecha}|${aHHmm(m)}`)) {
                    fechas.add(agenda.fecha);
                    break;
                }
            }
        }

        res.status(200).json({ codigo: 200, estado: "ok", datos: { fechas: [...fechas] } });
    } catch (error) {
        res.status(500).json({ codigo: 500, estado: "error", datos: { mensaje: "Error al consultar fechas disponibles", detalle: error.message } });
    }
};

module.exports = { crearTurno, cancelarTurno, atenderTurno, listarTurnos, listarDisponibilidad, listarFechasDisponibles };