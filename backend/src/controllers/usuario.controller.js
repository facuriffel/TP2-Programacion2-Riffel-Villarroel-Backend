const db = require('../database/db');
const bcrypt = require('bcrypt');
const { registrarAuditoria } = require('../services/auditoria.service');

const ROLES = ['administrador', 'operador', 'medico', 'paciente'];

const respuestaError = (res, codigo, mensaje, detalle) =>
    res.status(codigo).json({ codigo, estado: "error", datos: detalle ? { mensaje, detalle } : { mensaje } });

const normalizarEspecialidades = (especialidades) =>
    Array.isArray(especialidades) ? [...new Set(especialidades.map(Number).filter(Number.isInteger))] : [];

const MENSAJES_ERROR_MYSQL = {
    ER_NO_REFERENCED_ROW_2: 'La sede, cobertura o especialidad seleccionada no existe.',
    ER_BAD_NULL_ERROR: 'Faltan datos obligatorios para crear el usuario.',
    ER_DATA_TOO_LONG: 'Alguno de los datos ingresados supera la longitud permitida.',
    ER_TRUNCATED_WRONG_VALUE: 'Alguno de los datos ingresados tiene un formato inválido.',
    ER_PARSE_ERROR: 'Ocurrió un error al procesar los datos del usuario.',
};

const validarDatosPorRol = ({ rol, id_sede, especialidades }) => {
    if (!ROLES.includes(rol)) return 'El tipo de usuario no es válido.';
    if ((rol === 'operador' || rol === 'medico') && !id_sede) return 'El operador y el médico deben tener una sede asignada.';
    if (rol === 'medico' && especialidades.length === 0) return 'El médico debe tener al menos una especialidad.';
    return null;
};

const listarUsuarios = async (req, res) => {
    const { nombre, apellido, rol, id_sede } = req.query;
    const pagina = Math.max(parseInt(req.query.pagina, 10) || 1, 1);
    const limite = Math.min(Math.max(parseInt(req.query.limite, 10) || 10, 1), 100);

    try {
        let filtros = ' WHERE 1=1';
        const params = [];

        if (nombre) {
            filtros += ' AND u.nombre LIKE ?';
            params.push(`%${nombre}%`);
        }
        if (apellido) {
            filtros += ' AND u.apellido LIKE ?';
            params.push(`%${apellido}%`);
        }
        if (rol) {
            filtros += ' AND u.rol = ?';
            params.push(rol);
        }
        if (id_sede) {
            filtros += ' AND u.id_sede = ?';
            params.push(id_sede);
        }

        const [[{ total }]] = await db.query(`SELECT COUNT(*) AS total FROM usuario u${filtros}`, params);

        const [usuarios] = await db.query(
            `SELECT u.id, u.nombre, u.apellido, u.dni, u.fecha_nacimiento, u.email, u.rol,
                    u.id_cobertura, u.id_sede, s.nombre AS sede
             FROM usuario u
             LEFT JOIN sede s ON u.id_sede = s.id${filtros}
             ORDER BY u.apellido ASC, u.nombre ASC
             LIMIT ? OFFSET ?`,
            [...params, limite, (pagina - 1) * limite]
        );

        const idsMedicos = usuarios.filter(u => u.rol === 'medico').map(u => u.id);
        const especialidadesPorMedico = {};

        if (idsMedicos.length > 0) {
            const [relaciones] = await db.query(
                `SELECT me.id_medico, e.id, e.descripcion
                 FROM medico_especialidad me
                 INNER JOIN especialidad e ON me.id_especialidad = e.id
                 WHERE me.id_medico IN (?)`,
                [idsMedicos]
            );
            relaciones.forEach(r => {
                (especialidadesPorMedico[r.id_medico] ||= []).push({ id: r.id, descripcion: r.descripcion });
            });
        }

        const resultado = usuarios.map(u => ({
            ...u,
            especialidades: especialidadesPorMedico[u.id] || []
        }));

        res.status(200).json({
            codigo: 200,
            estado: "ok",
            datos: { usuarios: resultado, total: Number(total), pagina, limite }
        });
    } catch (error) {
        respuestaError(res, 500, "Error al listar usuarios", error.message);
    }
};

const crearUsuario = async (req, res) => {
    const { nombre, apellido, dni, fecha_nacimiento, email, rol, id_cobertura, id_sede } = req.body;
    const rawPassword = req.body.password || req.body.contrasena || 'Usuario123!';
    const especialidades = rol === 'medico' ? normalizarEspecialidades(req.body.especialidades) : [];

    if (!nombre || !apellido || !dni || !email) {
        return respuestaError(res, 400, "Nombre, apellido, DNI y email son obligatorios.");
    }
    const errorRol = validarDatosPorRol({ rol, id_sede, especialidades });
    if (errorRol) return respuestaError(res, 400, errorRol);

    let conexion;
    try {
        conexion = await db.getConnection();
        await conexion.beginTransaction();
        const passwordHash = await bcrypt.hash(rawPassword, 10);
        const sede = rol === 'administrador' || rol === 'paciente' ? null : id_sede;

        const [resultado] = await conexion.query(
            `INSERT INTO usuario (nombre, apellido, dni, fecha_nacimiento, email, password, rol, id_cobertura, id_sede)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [nombre, apellido, dni, fecha_nacimiento || null, email, passwordHash, rol, id_cobertura || null, sede]
        );

        for (const idEspecialidad of especialidades) {
            await conexion.query(
                'INSERT INTO medico_especialidad (id_medico, id_especialidad) VALUES (?, ?)',
                [resultado.insertId, idEspecialidad]
            );
        }

        await conexion.commit();

        await registrarAuditoria({
            id_usuario: req.usuario?.id,
            accion: 'ALTA',
            tabla: 'usuario',
            id_registro: resultado.insertId,
            detalle: `Alta de usuario ${nombre} ${apellido} DNI ${dni} con rol ${rol}`
        });

        res.status(201).json({ codigo: 201, estado: "ok", datos: { mensaje: "Usuario creado exitosamente" } });
    } catch (error) {
        console.error('CRITICAL ERROR EN CREAR USUARIO:', error);
        if (conexion) await conexion.rollback();
        if (error.code === 'ER_DUP_ENTRY') {
            return respuestaError(res, 409, "Ya existe un usuario con ese DNI o email.");
        }
        const mensaje = MENSAJES_ERROR_MYSQL[error.code] || "No se pudo crear el usuario. Verificá los datos ingresados.";
        respuestaError(res, 400, mensaje, error.sqlMessage || error.message);
    } finally {
        if (conexion) conexion.release();
    }
};

const modificarUsuario = async (req, res) => {
    const { id } = req.params;
    const { nombre, apellido, dni, fecha_nacimiento, email, rol, id_cobertura, id_sede } = req.body;
    const especialidades = rol === 'medico' ? normalizarEspecialidades(req.body.especialidades) : [];

    if (!nombre || !apellido || !dni || !email) {
        return respuestaError(res, 400, "Nombre, apellido, DNI y email son obligatorios.");
    }
    const errorRol = validarDatosPorRol({ rol, id_sede, especialidades });
    if (errorRol) return respuestaError(res, 400, errorRol);

    const conexion = await db.getConnection();
    try {
        await conexion.beginTransaction();
        const sede = rol === 'administrador' || rol === 'paciente' ? null : id_sede;

        const [resultado] = await conexion.query(
            `UPDATE usuario
             SET nombre = ?, apellido = ?, dni = ?, fecha_nacimiento = ?, email = ?, rol = ?, id_cobertura = ?, id_sede = ?
             WHERE id = ?`,
            [nombre, apellido, dni, fecha_nacimiento || null, email, rol, id_cobertura || null, sede, id]
        );

        if (resultado.affectedRows === 0) {
            await conexion.rollback();
            return respuestaError(res, 404, "Usuario no encontrado.");
        }

        await conexion.query('DELETE FROM medico_especialidad WHERE id_medico = ?', [id]);
        for (const idEspecialidad of especialidades) {
            await conexion.query(
                'INSERT INTO medico_especialidad (id_medico, id_especialidad) VALUES (?, ?)',
                [id, idEspecialidad]
            );
        }

        await conexion.commit();

        await registrarAuditoria({
            id_usuario: req.usuario?.id,
            accion: 'MODIFICACION',
            tabla: 'usuario',
            id_registro: id,
            detalle: `Modificación de usuario ${nombre} ${apellido} DNI ${dni}, rol ${rol}`
        });

        res.status(200).json({ codigo: 200, estado: "ok", datos: { mensaje: "Usuario modificado exitosamente" } });
    } catch (error) {
        await conexion.rollback();
        if (error.code === 'ER_DUP_ENTRY') {
            return respuestaError(res, 409, "Ya existe un usuario con ese DNI o email.");
        }
        respuestaError(res, 500, "Error al modificar usuario", error.message);
    } finally {
        conexion.release();
    }
};

const eliminarUsuario = async (req, res) => {
    const { id } = req.params;
    try {
        const [[{ total: turnosPaciente }]] = await db.query(
            'SELECT COUNT(*) AS total FROM turno t WHERE t.id_paciente = ?',
            [id]
        );
        const [[{ total: turnosMedico }]] = await db.query(
            "SELECT COUNT(*) AS total FROM turno t JOIN agenda a ON t.id_agenda = a.id WHERE a.id_medico = ? AND t.estado = 'confirmado'",
            [id]
        );
        const [[{ total: agendas }]] = await db.query('SELECT COUNT(*) AS total FROM agenda WHERE id_medico = ?', [id]);

        if (Number(turnosPaciente) > 0 || Number(turnosMedico) > 0 || Number(agendas) > 0) {
            return respuestaError(res, 400, "No se puede eliminar el usuario porque cuenta con turnos o agendas asociadas.");
        }

        await db.query('DELETE FROM medico_especialidad WHERE id_medico = ?', [id]);
        await db.query('DELETE FROM usuario WHERE id = ?', [id]);

        await registrarAuditoria({
            id_usuario: req.usuario?.id,
            accion: 'BAJA',
            tabla: 'usuario',
            id_registro: id,
            detalle: `Baja de usuario con ID ${id}`
        });

        res.status(200).json({ codigo: 200, estado: "ok", datos: { mensaje: "Usuario eliminado exitosamente" } });
    } catch (error) {
        respuestaError(res, 500, "Error al eliminar usuario", error.message);
    }
};

module.exports = { listarUsuarios, crearUsuario, modificarUsuario, eliminarUsuario };
