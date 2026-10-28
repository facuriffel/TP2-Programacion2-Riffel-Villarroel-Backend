const { Router } = require('express');
const { crearSede, listarSedes, modificarSede, eliminarSede } = require('../controllers/sede.controller');
const { verificarToken, verificarRol } = require('../middlewares/auth.middleware');

const router = Router();

router.use(verificarToken);
router.use(verificarRol('administrador'));

router.post('/', crearSede);
router.get('/', listarSedes);
router.put('/:id', modificarSede);
router.delete('/:id', eliminarSede);

module.exports = router;