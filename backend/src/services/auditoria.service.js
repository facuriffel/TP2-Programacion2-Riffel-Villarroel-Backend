const db = require('../database/db');

// Inserta un registro en log_auditoria. Nunca lanza una excepción: si falla,
// se loguea el error en consola y el flujo HTTP que la invoca continúa normalmente.
const registrarAuditoria = async ({ id_usuario, accion, tabla, id_registro, detalle, connection = null }) => {
    try {
        const ejecutor = connection || db;
        const detalleCompleto = id_registro != null ? `[ID ${id_registro}] ${detalle}` : detalle;

        await ejecutor.query(
            'INSERT INTO log_auditoria (id_usuario, accion, entidad, detalle, fecha) VALUES (?, ?, ?, ?, NOW())',
            [id_usuario, accion, tabla, detalleCompleto]
        );
    } catch (error) {
        console.error('Error registrando auditoría:', error);
    }
};

module.exports = { registrarAuditoria };
