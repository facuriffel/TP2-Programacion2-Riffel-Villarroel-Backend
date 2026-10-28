const { Router } = require('express');
const { listarUsuarios, crearUsuario, modificarUsuario, eliminarUsuario } = require('../controllers/usuario.controller');
const { verificarToken, verificarRol } = require('../middlewares/auth.middleware');

const router = Router();

router.use(verificarToken);
router.use(verificarRol('administrador'));

router.get('/', listarUsuarios);

router.post('/', crearUsuario);
router.put('/:id', modificarUsuario);
router.delete('/:id', eliminarUsuario);

module.exports = router;
