const db = require('../database/db');
const { registrarAuditoria } = require('../services/auditoria.service');

const respuestaError = (res, codigo, mensaje, detalle) =>
    res.status(codigo).json({ codigo, estado: "error", datos: detalle ? { mensaje, detalle } : { mensaje } });

// Los horarios llegan como HH:mm o HH:mm:ss; la comparación lexicográfica es válida con el mismo formato
const normalizarHora = (hora) => (typeof hora === 'string' && hora.length === 5 ? `${hora}:00` : hora);

const validarRango = (hora_entrada, hora_salida) => {
    if (!hora_entrada || !hora_salida) return 'La hora de entrada y de salida son obligatorias.';
    if (normalizarHora(hora_salida) <= normalizarHora(hora_entrada)) return 'La hora de salida debe ser posterior a la hora de entrada.';
    return null;
};

const contarTurnosConfirmados = async (idAgenda) => {
    const [[{ total }]] = await db.query(
        "SELECT COUNT(*) AS total FROM turno WHERE id_agenda = ? AND estado = 'confirmado'",
        [idAgenda]
    );
    return Number(total);
};

const crearAgenda = async (req, res) => {
    const { hora_entrada, hora_salida, fecha, id_medico, id_especialidad, id_sede } = req.body;

    try {
        if (req.usuario.rol === 'medico' && req.usuario.id !== id_medico) {
            return respuestaError(res, 403, "Acceso denegado. Solo podés crear turnos para tu propia agenda.");
        }
        if (req.usuario.rol === 'operador' && req.usuario.id_sede !== id_sede) {
            return respuestaError(res, 403, "Acceso denegado. Solo podés cargar agendas de tu sede.");
        }

        const errorRango = validarRango(hora_entrada, hora_salida);
        if (errorRango) return respuestaError(res, 400, errorRango);

        const query = `INSERT INTO agenda (hora_entrada, hora_salida, fecha, id_medico, id_especialidad, id_sede) VALUES (?, ?, ?, ?, ?, ?)`;
        const [resultado] = await db.query(query, [hora_entrada, hora_salida, fecha, id_medico, id_especialidad, id_sede]);

        await registrarAuditoria({
            id_usuario: req.usuario.id,
            accion: 'ALTA',
            tabla: 'agenda',
            id_registro: resultado.insertId,
            detalle: `Alta de franja horaria para médico ID ${id_medico} el ${fecha} de ${hora_entrada} a ${hora_salida}`
        });

        res.status(201).json({ codigo: 201, estado: "ok", datos: { mensaje: "Turno de agenda creado exitosamente" } });
    } catch (error) {
        respuestaError(res, 500, "Error al crear agenda", error.message);
    }
};

const listarAgenda = async (req, res) => {
    try {
        const { id_medico, id_sede, fecha, desde } = req.query;
        let query = `
            SELECT a.id,
                   DATE_FORMAT(a.fecha, '%Y-%m-%d') AS fecha,
                   TIME_FORMAT(a.hora_entrada, '%H:%i') AS hora_entrada,
                   TIME_FORMAT(a.hora_salida, '%H:%i') AS hora_salida,
                   a.id_medico, a.id_especialidad, a.id_sede,
                   u.nombre AS medico_nombre, u.apellido AS medico_apellido,
                   e.descripcion AS especialidad,
                   s.nombre AS sede,
                   (SELECT COUNT(*) FROM turno t WHERE t.id_agenda = a.id AND t.estado = 'confirmado') AS turnos_confirmados
            FROM agenda a
            INNER JOIN usuario u ON a.id_medico = u.id
            INNER JOIN especialidad e ON a.id_especialidad = e.id
            INNER JOIN sede s ON a.id_sede = s.id
            WHERE 1=1`;
        const queryParams = [];

        if (req.usuario.rol === 'medico') {
            query += ' AND a.id_medico = ?';
            queryParams.push(req.usuario.id);
        } else if (id_medico) {
            query += ' AND a.id_medico = ?';
            queryParams.push(id_medico);
        }

        if (id_sede) {
            query += ' AND a.id_sede = ?';
            queryParams.push(id_sede);
        }
        if (fecha) {
            query += ' AND a.fecha = ?';
            queryParams.push(fecha);
        }
        if (desde) {
            query += ' AND a.fecha >= ?';
            queryParams.push(desde);
        }
        query += ' ORDER BY a.fecha ASC, a.hora_entrada ASC';

        const [rows] = await db.query(query, queryParams);

        res.status(200).json({
            codigo: 200,
            estado: "ok",
            datos: { agenda: rows.map(r => ({ ...r, turnos_confirmados: Number(r.turnos_confirmados) })) }
        });
    } catch (error) {
        respuestaError(res, 500, "Error al listar agenda", error.message);
    }
};

const modificarAgenda = async (req, res) => {
    const { id } = req.params;
    const { hora_entrada, hora_salida, fecha, id_especialidad, id_sede } = req.body;

    try {
        const [agendaExistente] = await db.query('SELECT * FROM agenda WHERE id = ?', [id]);

        if (agendaExistente.length === 0) {
            return respuestaError(res, 404, "Turno de agenda no encontrado");
        }

        if (req.usuario.rol === 'medico' && agendaExistente[0].id_medico !== req.usuario.id) {
            return respuestaError(res, 403, "Acceso denegado. No tenés permiso para modificar la agenda de otro médico.");
        }
        if (req.usuario.rol === 'operador' && (agendaExistente[0].id_sede !== req.usuario.id_sede || id_sede !== req.usuario.id_sede)) {
            return respuestaError(res, 403, "Acceso denegado. Solo podés modificar agendas de tu sede.");
        }

        const errorRango = validarRango(hora_entrada, hora_salida);
        if (errorRango) return respuestaError(res, 400, errorRango);

        if (await contarTurnosConfirmados(id) > 0) {
            return respuestaError(res, 400, "No se puede modificar la agenda porque tiene turnos confirmados en ese rango.");
        }

        const query = `UPDATE agenda SET hora_entrada = ?, hora_salida = ?, fecha = ?, id_especialidad = ?, id_sede = ? WHERE id = ?`;
        await db.query(query, [hora_entrada, hora_salida, fecha, id_especialidad, id_sede, id]);

        await registrarAuditoria({
            id_usuario: req.usuario.id,
            accion: 'MODIFICACION',
            tabla: 'agenda',
            id_registro: id,
            detalle: `Actualización de franja horaria del médico ID ${agendaExistente[0].id_medico} el ${fecha} de ${hora_entrada} a ${hora_salida}`
        });

        res.status(200).json({ codigo: 200, estado: "ok", datos: { mensaje: "Agenda modificada exitosamente" } });
    } catch (error) {
        respuestaError(res, 500, "Error al modificar agenda", error.message);
    }
};

const eliminarAgenda = async (req, res) => {
    const { id } = req.params;

    try {
        const [agendaExistente] = await db.query('SELECT * FROM agenda WHERE id = ?', [id]);

        if (agendaExistente.length === 0) {
            return respuestaError(res, 404, "Turno de agenda no encontrado");
        }

        if (req.usuario.rol === 'medico' && agendaExistente[0].id_medico !== req.usuario.id) {
            return respuestaError(res, 403, "Acceso denegado. No tenés permiso para eliminar la agenda de otro médico.");
        }
        if (req.usuario.rol === 'operador' && agendaExistente[0].id_sede !== req.usuario.id_sede) {
            return respuestaError(res, 403, "Acceso denegado. Solo podés eliminar agendas de tu sede.");
        }

        if (await contarTurnosConfirmados(id) > 0) {
            return respuestaError(res, 400, "No se puede eliminar la agenda porque tiene turnos confirmados en ese rango.");
        }

        await db.query('DELETE FROM agenda WHERE id = ?', [id]);

        await registrarAuditoria({
            id_usuario: req.usuario.id,
            accion: 'BAJA',
            tabla: 'agenda',
            id_registro: id,
            detalle: `Baja de franja horaria para médico ID ${agendaExistente[0].id_medico} el ${agendaExistente[0].fecha}`
        });

        res.status(200).json({ codigo: 200, estado: "ok", datos: { mensaje: "Turno de agenda eliminado exitosamente" } });
    } catch (error) {
        respuestaError(res, 500, "Error al eliminar agenda", error.message);
    }
};

module.exports = { crearAgenda, listarAgenda, modificarAgenda, eliminarAgenda };
