const db = require('../database/db');
const { registrarAuditoria } = require('../services/auditoria.service');

const crearSede = async (req, res) => {
    const { nombre, direccion, telefono } = req.body;
    try {
        const [resultado] = await db.query('INSERT INTO sede (nombre, direccion, telefono) VALUES (?, ?, ?)', [nombre, direccion, telefono]);

        await registrarAuditoria({
            id_usuario: req.usuario?.id,
            accion: 'ALTA',
            tabla: 'sede',
            id_registro: resultado.insertId,
            detalle: `Alta de sede ${nombre}`
        });

        res.status(201).json({ codigo: 201, estado: "ok", datos: { mensaje: "Sede creada exitosamente" } });
    } catch (error) {
        res.status(500).json({ codigo: 500, estado: "error", datos: { mensaje: "Error al crear sede", detalle: error.message } });
    }
};

const listarSedes = async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM sede');
        res.status(200).json({ codigo: 200, estado: "ok", datos: { sedes: rows } });
    } catch (error) {
        res.status(500).json({ codigo: 500, estado: "error", datos: { mensaje: "Error al listar sedes", detalle: error.message } });
    }
};

const modificarSede = async (req, res) => {
    const { id } = req.params;
    const { nombre, direccion, telefono } = req.body;
    try {
        await db.query('UPDATE sede SET nombre = ?, direccion = ?, telefono = ? WHERE id = ?', [nombre, direccion, telefono, id]);

        await registrarAuditoria({
            id_usuario: req.usuario?.id,
            accion: 'MODIFICACION',
            tabla: 'sede',
            id_registro: id,
            detalle: `Modificación de sede ${nombre}`
        });

        res.status(200).json({ codigo: 200, estado: "ok", datos: { mensaje: "Sede modificada exitosamente" } });
    } catch (error) {
        res.status(500).json({ codigo: 500, estado: "error", datos: { mensaje: "Error al modificar sede", detalle: error.message } });
    }
};

const eliminarSede = async (req, res) => {
    const { id } = req.params;
    try {
        // Validación obligatoria: verificar si tiene usuarios o agenda asociada
        const [usuarios] = await db.query('SELECT id FROM usuario WHERE id_sede = ?', [id]);
        const [agenda] = await db.query('SELECT id FROM agenda WHERE id_sede = ?', [id]);

        if (usuarios.length > 0 || agenda.length > 0) {
            return res.status(400).json({
                codigo: 400,
                estado: "error",
                datos: { mensaje: "No se puede eliminar la sede porque tiene médicos, operadores o agendas asociadas." }
            });
        }

        await db.query('DELETE FROM sede WHERE id = ?', [id]);

        await registrarAuditoria({
            id_usuario: req.usuario?.id,
            accion: 'BAJA',
            tabla: 'sede',
            id_registro: id,
            detalle: `Baja de sede con ID ${id}`
        });

        res.status(200).json({ codigo: 200, estado: "ok", datos: { mensaje: "Sede eliminada exitosamente" } });
    } catch (error) {
        res.status(500).json({ codigo: 500, estado: "error", datos: { mensaje: "Error al eliminar sede", detalle: error.message } });
    }
};

module.exports = { crearSede, listarSedes, modificarSede, eliminarSede };