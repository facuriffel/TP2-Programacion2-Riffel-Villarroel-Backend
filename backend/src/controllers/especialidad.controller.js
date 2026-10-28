const db = require('../database/db');
const { registrarAuditoria } = require('../services/auditoria.service');

const crearEspecialidad = async (req, res) => {
    const { descripcion } = req.body;
    try {
        const [resultado] = await db.query('INSERT INTO especialidad (descripcion) VALUES (?)', [descripcion]);

        await registrarAuditoria({
            id_usuario: req.usuario?.id,
            accion: 'ALTA',
            tabla: 'especialidad',
            id_registro: resultado.insertId,
            detalle: `Alta de especialidad ${descripcion}`
        });

        res.status(201).json({ codigo: 201, estado: "ok", datos: { mensaje: "Especialidad creada exitosamente" } });
    } catch (error) {
        res.status(500).json({ codigo: 500, estado: "error", datos: { mensaje: "Error al crear especialidad", detalle: error.message } });
    }
};

const listarEspecialidades = async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM especialidad');
        res.status(200).json({ codigo: 200, estado: "ok", datos: { especialidades: rows } });
    } catch (error) {
        res.status(500).json({ codigo: 500, estado: "error", datos: { mensaje: "Error al listar especialidades", detalle: error.message } });
    }
};

const modificarEspecialidad = async (req, res) => {
    const { id } = req.params;
    const { descripcion } = req.body;
    try {
        await db.query('UPDATE especialidad SET descripcion = ? WHERE id = ?', [descripcion, id]);

        await registrarAuditoria({
            id_usuario: req.usuario?.id,
            accion: 'MODIFICACION',
            tabla: 'especialidad',
            id_registro: id,
            detalle: `Modificación de especialidad ${descripcion}`
        });

        res.status(200).json({ codigo: 200, estado: "ok", datos: { mensaje: "Especialidad modificada exitosamente" } });
    } catch (error) {
        res.status(500).json({ codigo: 500, estado: "error", datos: { mensaje: "Error al modificar especialidad", detalle: error.message } });
    }
};

const eliminarEspecialidad = async (req, res) => {
    const { id } = req.params;
    try {

        const [medicos] = await db.query('SELECT id_medico FROM medico_especialidad WHERE id_especialidad = ?', [id]);

        if (medicos.length > 0) {
            return res.status(400).json({
                codigo: 400,
                estado: "error",
                datos: { mensaje: "No se puede eliminar la especialidad porque tiene médicos asociados." }
            });
        }

        const [agendas] = await db.query('SELECT id FROM agenda WHERE id_especialidad = ?', [id]);

        if (agendas.length > 0) {
            return res.status(400).json({
                codigo: 400,
                estado: "error",
                datos: { mensaje: "No se puede eliminar la especialidad porque existen agendas médicas configuradas con ella" }
            });
        }

        await db.query('DELETE FROM especialidad WHERE id = ?', [id]);

        await registrarAuditoria({
            id_usuario: req.usuario?.id,
            accion: 'BAJA',
            tabla: 'especialidad',
            id_registro: id,
            detalle: `Baja de especialidad con ID ${id}`
        });

        res.status(200).json({ codigo: 200, estado: "ok", datos: { mensaje: "Especialidad eliminada exitosamente" } });
    } catch (error) {
        res.status(500).json({ codigo: 500, estado: "error", datos: { mensaje: "Error al eliminar especialidad", detalle: error.message } });
    }
};

module.exports = { crearEspecialidad, listarEspecialidades, modificarEspecialidad, eliminarEspecialidad };