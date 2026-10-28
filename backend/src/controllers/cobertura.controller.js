const db = require('../database/db');
const { registrarAuditoria } = require('../services/auditoria.service');

// El GET público de la semana 1[cite: 1]
const listarCoberturas = async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM cobertura');
    res.status(200).json({ codigo: 200, estado: "ok", datos: { coberturas: rows } });
  } catch (error) {
    res.status(500).json({ codigo: 500, estado: "error", datos: { mensaje: "Error al listar coberturas", detalle: error.message } });
  }
};

const crearCobertura = async (req, res) => {
  const { nombre } = req.body;
  try {
    const [resultado] = await db.query('INSERT INTO cobertura (nombre) VALUES (?)', [nombre]);

    await registrarAuditoria({
      id_usuario: req.usuario?.id,
      accion: 'ALTA',
      tabla: 'cobertura',
      id_registro: resultado.insertId,
      detalle: `Alta de cobertura ${nombre}`
    });

    res.status(201).json({ codigo: 201, estado: "ok", datos: { mensaje: "Cobertura creada exitosamente" } });
  } catch (error) {
    res.status(500).json({ codigo: 500, estado: "error", datos: { mensaje: "Error al crear cobertura", detalle: error.message } });
  }
};

const modificarCobertura = async (req, res) => {
  const { id } = req.params;
  const { nombre } = req.body;
  try {
    await db.query('UPDATE cobertura SET nombre = ? WHERE id = ?', [nombre, id]);

    await registrarAuditoria({
      id_usuario: req.usuario?.id,
      accion: 'MODIFICACION',
      tabla: 'cobertura',
      id_registro: id,
      detalle: `Modificación de cobertura ${nombre}`
    });

    res.status(200).json({ codigo: 200, estado: "ok", datos: { mensaje: "Cobertura modificada exitosamente" } });
  } catch (error) {
    res.status(500).json({ codigo: 500, estado: "error", datos: { mensaje: "Error al modificar cobertura", detalle: error.message } });
  }
};

const eliminarCobertura = async (req, res) => {
  const { id } = req.params;
  try {
    // Validación obligatoria: verificar si algún paciente la usa[cite: 1]
    const [usuarios] = await db.query('SELECT id FROM usuario WHERE id_cobertura = ?', [id]);

    if (usuarios.length > 0) {
      return res.status(400).json({
        codigo: 400,
        estado: "error",
        datos: { mensaje: "No se puede eliminar la cobertura porque hay usuarios registrados con ella." }
      });
    }

    await db.query('DELETE FROM cobertura WHERE id = ?', [id]);

    await registrarAuditoria({
      id_usuario: req.usuario?.id,
      accion: 'BAJA',
      tabla: 'cobertura',
      id_registro: id,
      detalle: `Baja de cobertura con ID ${id}`
    });

    res.status(200).json({ codigo: 200, estado: "ok", datos: { mensaje: "Cobertura eliminada exitosamente" } });
  } catch (error) {
    res.status(500).json({ codigo: 500, estado: "error", datos: { mensaje: "Error al eliminar cobertura", detalle: error.message } });
  }
};

module.exports = { listarCoberturas, crearCobertura, modificarCobertura, eliminarCobertura };