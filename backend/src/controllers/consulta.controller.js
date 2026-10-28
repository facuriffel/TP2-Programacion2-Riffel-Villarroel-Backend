const db = require('../database/db');

// Consultas de solo lectura para poblar selectores de roles que no son administrador

const error500 = (res, mensaje, error) =>
    res.status(500).json({ codigo: 500, estado: "error", datos: { mensaje, detalle: error.message } });

const listarSedes = async (req, res) => {
    try {
        const [rows] = await db.query('SELECT id, nombre, direccion, telefono FROM sede ORDER BY nombre ASC');
        res.status(200).json({ codigo: 200, estado: "ok", datos: { sedes: rows } });
    } catch (error) {
        error500(res, "Error al listar sedes", error);
    }
};

const listarEspecialidades = async (req, res) => {
    try {
        const [rows] = await db.query('SELECT id, descripcion FROM especialidad ORDER BY descripcion ASC');
        res.status(200).json({ codigo: 200, estado: "ok", datos: { especialidades: rows } });
    } catch (error) {
        error500(res, "Error al listar especialidades", error);
    }
};

const listarMedicos = async (req, res) => {
    const { id_sede, id_especialidad } = req.query;

    try {
        let query = `SELECT u.id, u.nombre, u.apellido, u.id_sede, s.nombre AS sede
                     FROM usuario u
                     LEFT JOIN sede s ON u.id_sede = s.id
                     WHERE u.rol = 'medico'`;
        const params = [];

        if (id_sede) {
            query += ' AND u.id_sede = ?';
            params.push(id_sede);
        }
        if (id_especialidad) {
            query += ' AND EXISTS (SELECT 1 FROM medico_especialidad me WHERE me.id_medico = u.id AND me.id_especialidad = ?)';
            params.push(id_especialidad);
        }
        query += ' ORDER BY u.apellido ASC, u.nombre ASC';

        const [medicos] = await db.query(query, params);

        const ids = medicos.map(m => m.id);
        const especialidadesPorMedico = {};
        if (ids.length > 0) {
            const [relaciones] = await db.query(
                `SELECT me.id_medico, e.id, e.descripcion
                 FROM medico_especialidad me
                 INNER JOIN especialidad e ON me.id_especialidad = e.id
                 WHERE me.id_medico IN (?)`,
                [ids]
            );
            relaciones.forEach(r => {
                (especialidadesPorMedico[r.id_medico] ||= []).push({ id: r.id, descripcion: r.descripcion });
            });
        }

        res.status(200).json({
            codigo: 200,
            estado: "ok",
            datos: { medicos: medicos.map(m => ({ ...m, especialidades: especialidadesPorMedico[m.id] || [] })) }
        });
    } catch (error) {
        error500(res, "Error al listar médicos", error);
    }
};

// Búsqueda de pacientes por DNI o apellido. El médico solo ve pacientes con turnos en su agenda.
const buscarPacientes = async (req, res) => {
    const { dni, apellido } = req.query;

    if (!dni && !apellido) {
        return res.status(400).json({
            codigo: 400,
            estado: "error",
            datos: { mensaje: "Ingresá un DNI o un apellido para buscar." }
        });
    }

    try {
        let query = `SELECT u.id, u.nombre, u.apellido, u.dni, u.email, u.id_cobertura
                     FROM usuario u
                     WHERE u.rol = 'paciente'`;
        const params = [];

        if (dni) {
            query += ' AND u.dni LIKE ?';
            params.push(`${dni}%`);
        }
        if (apellido) {
            query += ' AND u.apellido LIKE ?';
            params.push(`%${apellido}%`);
        }
        if (req.usuario.rol === 'medico') {
            query += ` AND EXISTS (SELECT 1 FROM turno t INNER JOIN agenda a ON t.id_agenda = a.id
                                   WHERE t.id_paciente = u.id AND a.id_medico = ?)`;
            params.push(req.usuario.id);
        }
        query += ' ORDER BY u.apellido ASC, u.nombre ASC LIMIT 25';

        const [rows] = await db.query(query, params);
        res.status(200).json({ codigo: 200, estado: "ok", datos: { pacientes: rows } });
    } catch (error) {
        error500(res, "Error al buscar pacientes", error);
    }
};

module.exports = { listarSedes, listarEspecialidades, listarMedicos, buscarPacientes };
