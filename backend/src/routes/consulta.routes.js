const { Router } = require('express');
const { listarSedes, listarEspecialidades, listarMedicos, buscarPacientes } = require('../controllers/consulta.controller');
const { verificarToken, verificarRol } = require('../middlewares/auth.middleware');

const router = Router();

router.use(verificarToken);

// Catálogos de lectura para médico, operador y paciente
router.get('/sedes', verificarRol('medico', 'operador', 'paciente'), listarSedes);
router.get('/especialidades', verificarRol('medico', 'operador', 'paciente'), listarEspecialidades);
router.get('/medicos', verificarRol('medico', 'operador', 'paciente'), listarMedicos);

// Búsqueda de pacientes para historial clínico (médico), asignación de turnos (operador) y gestión (administrador)
router.get('/pacientes', verificarRol('medico', 'operador', 'administrador'), buscarPacientes);

module.exports = router;
