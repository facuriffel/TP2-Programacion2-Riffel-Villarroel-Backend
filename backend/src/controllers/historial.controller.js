const db = require('../database/db');

const crearHistorial = async (req, res) => {
    const { id_turno, diagnostico, tratamiento, observaciones } = req.body;

    if (!diagnostico || !tratamiento) {
        return res.status(400).json({
            codigo: 400,
            estado: "error",
            datos: { mensaje: "El diagnóstico y el tratamiento son obligatorios." }
        });
    }

    try {
        const [turnoRows] = await db.query(
            'SELECT t.*, a.id_medico FROM turno t INNER JOIN agenda a ON t.id_agenda = a.id WHERE t.id = ?',
            [id_turno]
        );
        if (turnoRows.length === 0) {
            return res.status(404).json({
                codigo: 404,
                estado: "error",
                datos: { mensaje: "El turno especificado no existe." }
            });
        }

        const turno = turnoRows[0];

        // Validar que el turno esté atendido y pertenezca al médico logueado
        if (turno.estado !== 'atendido') {
            return res.status(400).json({
                codigo: 400,
                estado: "error",
                datos: { mensaje: "Solo se puede registrar historial clínico sobre turnos con estado 'atendido'." }
            });
        }

        if (turno.id_medico !== req.usuario.id) {
            return res.status(403).json({
                codigo: 403,
                estado: "error",
                datos: { mensaje: "Acceso denegado. Solo podés registrar historial en turnos que hayas atendido vos." }
            });
        }

        // Verificar si ya existe un registro de historial para este turno
        const [historialExistente] = await db.query('SELECT id FROM historial_clinico WHERE id_turno = ?', [id_turno]);
        if (historialExistente.length > 0) {
            return res.status(400).json({
                codigo: 400,
                estado: "error",
                datos: { mensaje: "Este turno ya cuenta con un registro de historial clínico asociado." }
            });
        }

        const query = `
            INSERT INTO historial_clinico (id_turno, diagnostico, tratamiento, observaciones, fecha) 
            VALUES (?, ?, ?, ?, NOW())
        `;
        await db.query(query, [id_turno, diagnostico, tratamiento, observaciones || null]);

        res.status(201).json({
            codigo: 201,
            estado: "ok",
            datos: { mensaje: "Historial clínico registrado exitosamente." }
        });
    } catch (error) {
        console.error('Error SQL en historial:', error);
        res.status(500).json({ codigo: 500, estado: "error", datos: { mensaje: "Error al registrar historial clínico", detalle: error.message } });
    }
};

const consultarHistorial = async (req, res) => {
    try {
        let rows = [];

        if (req.usuario.rol === 'paciente') {
            // El paciente accede a la totalidad de su historial clínico[cite: 3]
            const query = `
                SELECT h.id, h.id_turno, h.diagnostico, h.tratamiento, h.observaciones,
                       DATE_FORMAT(h.fecha, '%Y-%m-%d') AS fecha,
                       DATE_FORMAT(t.fecha, '%Y-%m-%d') AS fecha_turno, TIME_FORMAT(t.hora, '%H:%i') AS hora_turno,
                       a.id_medico, a.id_especialidad,
                       u.nombre AS medico_nombre, u.apellido AS medico_apellido,
                       e.descripcion AS especialidad
                FROM historial_clinico h
                JOIN turno t ON h.id_turno = t.id
                JOIN agenda a ON t.id_agenda = a.id
                LEFT JOIN usuario u ON a.id_medico = u.id
                LEFT JOIN especialidad e ON a.id_especialidad = e.id
                WHERE t.id_paciente = ?
                ORDER BY h.fecha DESC
            `;
            [rows] = await db.query(query, [req.usuario.id]);
        } else if (req.usuario.rol === 'medico') {
            // El médico solo accede a los registros de turnos que él mismo atendió[cite: 3]
            const { id_paciente } = req.query;
            if (!id_paciente) {
                return res.status(400).json({
                    codigo: 400,
                    estado: "error",
                    datos: { mensaje: "Debe especificar el id_paciente en la consulta." }
                });
            }

            const query = `
                SELECT h.id, h.id_turno, h.diagnostico, h.tratamiento, h.observaciones,
                       DATE_FORMAT(h.fecha, '%Y-%m-%d') AS fecha,
                       DATE_FORMAT(t.fecha, '%Y-%m-%d') AS fecha_turno, TIME_FORMAT(t.hora, '%H:%i') AS hora_turno,
                       p.nombre AS paciente_nombre, p.apellido AS paciente_apellido,
                       e.descripcion AS especialidad
                FROM historial_clinico h
                JOIN turno t ON h.id_turno = t.id
                JOIN usuario p ON t.id_paciente = p.id
                JOIN agenda a ON t.id_agenda = a.id
                JOIN especialidad e ON a.id_especialidad = e.id
                WHERE a.id_medico = ? AND t.id_paciente = ?
                ORDER BY h.fecha DESC
            `;
            [rows] = await db.query(query, [req.usuario.id, id_paciente]);
        }

        // Sin registros: 200 con lista vacía (nunca 500)
        res.status(200).json({
            codigo: 200,
            estado: "ok",
            datos: rows || []
        });
    } catch (error) {
        console.error('Error SQL en historial:', error);
        res.status(500).json({ codigo: 500, estado: "error", datos: { mensaje: "Error al consultar historial clínico", detalle: error.message } });
    }
};

module.exports = { crearHistorial, consultarHistorial };