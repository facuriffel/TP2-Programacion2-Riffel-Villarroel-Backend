const { Router } = require('express');
const { listarCoberturas, crearCobertura, modificarCobertura, eliminarCobertura } = require('../controllers/cobertura.controller');
const { verificarToken, verificarRol } = require('../middlewares/auth.middleware');

const router = Router();

router.get('/', listarCoberturas);

router.use(verificarToken);
router.use(verificarRol('administrador'));

router.post('/', crearCobertura);
router.put('/:id', modificarCobertura);
router.delete('/:id', eliminarCobertura);

module.exports = router;