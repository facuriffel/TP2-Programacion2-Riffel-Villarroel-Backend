const db = require('../database/db');

const listarLogs = async (req, res) => {
    const { id_usuario, usuario, entidad, desde, hasta } = req.query;
    const pagina = Math.max(parseInt(req.query.pagina, 10) || 1, 1);
    const limite = Math.min(Math.max(parseInt(req.query.limite, 10) || 10, 1), 100);

    try {
        let filtros = ' WHERE 1=1';
        const params = [];

        if (id_usuario) {
            filtros += ' AND l.id_usuario = ?';
            params.push(id_usuario);
        }

        if (usuario) {
            filtros += ' AND (u.nombre LIKE ? OR u.apellido LIKE ? OR u.email LIKE ? OR CONCAT(u.nombre, \' \', u.apellido) LIKE ?)';
            params.push(`%${usuario}%`, `%${usuario}%`, `%${usuario}%`, `%${usuario}%`);
        }

        if (entidad) {
            filtros += ' AND l.entidad = ?';
            params.push(entidad);
        }

        if (desde) {
            filtros += ' AND l.fecha >= ?';
            params.push(`${desde} 00:00:00`);
        }

        if (hasta) {
            filtros += ' AND l.fecha <= ?';
            params.push(`${hasta} 23:59:59`);
        }

        const [[{ total }]] = await db.query(
            `SELECT COUNT(*) AS total FROM log_auditoria l JOIN usuario u ON l.id_usuario = u.id${filtros}`,
            params
        );

        const [rows] = await db.query(
            `SELECT l.id, l.id_usuario, u.nombre, u.apellido, u.email,
                    l.accion, l.entidad, l.detalle, l.fecha
             FROM log_auditoria l
             JOIN usuario u ON l.id_usuario = u.id${filtros}
             ORDER BY l.fecha DESC, l.id DESC
             LIMIT ? OFFSET ?`,
            [...params, limite, (pagina - 1) * limite]
        );

        res.status(200).json({
            codigo: 200,
            estado: "ok",
            datos: { logs: rows, total: Number(total), pagina, limite }
        });
    } catch (error) {
        res.status(500).json({
            codigo: 500,
            estado: "error",
            datos: { mensaje: "Error al obtener los logs de auditoría", detalle: error.message }
        });
    }
};

module.exports = { listarLogs };
