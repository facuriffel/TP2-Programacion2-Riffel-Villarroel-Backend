const { Router } = require('express');
const { crearTurno, cancelarTurno, atenderTurno, listarTurnos, listarDisponibilidad, listarFechasDisponibles } = require('../controllers/turno.controller');
const { verificarToken, verificarRol } = require('../middlewares/auth.middleware');

const router = Router();

router.use(verificarToken);

// Fechas con agenda y horarios libres de un médico para armar la asignación
router.get('/fechas-disponibles', verificarRol('paciente', 'operador'), listarFechasDisponibles);
router.get('/disponibilidad', verificarRol('paciente', 'operador'), listarDisponibilidad);

// Listado accesible por paciente, médico u operador según reglas de negocio
router.get('/', verificarRol('paciente', 'medico', 'operador'), listarTurnos);

// Alta de turno solo para paciente u operador
router.post('/', verificarRol('paciente', 'operador'), crearTurno);

// Cancelación disponible para paciente, médico u operador de sede
router.put('/:id/cancelar', verificarRol('paciente', 'medico', 'operador'), cancelarTurno);

// Atención exclusiva del rol médico
router.put('/:id/atender', verificarRol('medico'), atenderTurno);

module.exports = router;