const { Router } = require('express');
const { crearEspecialidad, listarEspecialidades, modificarEspecialidad, eliminarEspecialidad } = require('../controllers/especialidad.controller');
const { verificarToken, verificarRol } = require('../middlewares/auth.middleware');

const router = Router();

router.use(verificarToken);
router.use(verificarRol('administrador'));

router.post('/', crearEspecialidad);
router.get('/', listarEspecialidades);
router.put('/:id', modificarEspecialidad);
router.delete('/:id', eliminarEspecialidad);

module.exports = router;