const db = require('../database/db');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { registrarAuditoria } = require('../services/auditoria.service');

const login = async (req, res) => {
    const { dni, contrasena } = req.body;

    try {
        const [rows] = await db.query('SELECT * FROM usuario WHERE dni = ?', [dni]);

        if (rows.length === 0) {
            return res.status(401).json({ codigo: 401, estado: "error", datos: { mensaje: "Credenciales inválidas" } });
        }

        const usuario = rows[0];
        const passwordValida = await bcrypt.compare(contrasena, usuario.password);

        if (!passwordValida) {
            return res.status(401).json({ codigo: 401, estado: "error", datos: { mensaje: "Credenciales inválidas" } });
        }

        const token = jwt.sign(
            { id: usuario.id, rol: usuario.rol, id_sede: usuario.id_sede },
            process.env.JWT_SECRET,
            { expiresIn: '8h' }
        );

        res.status(200).json({ codigo: 200, estado: "ok", datos: { token } });

    } catch (error) {
        res.status(500).json({ codigo: 500, estado: "error", datos: { mensaje: "Error interno del servidor", detalle: error.message } });
    }
};


const registro = async (req, res) => {

    const { nombre, apellido, dni, email, contrasena, fecha_nacimiento, id_cobertura } = req.body;

    try {
        // Validación: DNI y email no deben estar duplicados[cite: 1]
        const [existentes] = await db.query('SELECT id FROM usuario WHERE dni = ? OR email = ?', [dni, email]);

        if (existentes.length > 0) {
            return res.status(400).json({
                codigo: 400,
                estado: "error",
                datos: { mensaje: "El DNI o el email ya se encuentran registrados" }
            });
        }


        const saltRounds = 10;
        const passwordHasheada = await bcrypt.hash(contrasena, saltRounds);


        const query = `
            INSERT INTO usuario (nombre, apellido, dni, email, password, fecha_nacimiento, id_cobertura, rol)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'paciente')
        `;

        const [resultado] = await db.query(query, [nombre, apellido, dni, email, passwordHasheada, fecha_nacimiento, id_cobertura]);

        await registrarAuditoria({
            id_usuario: resultado.insertId,
            accion: 'ALTA',
            tabla: 'usuario',
            id_registro: resultado.insertId,
            detalle: `Alta de paciente ${nombre} ${apellido} DNI ${dni} (autorregistro)`
        });

        res.status(201).json({
            codigo: 201,
            estado: "ok",
            datos: { mensaje: "Usuario registrado con éxito" }
        });

    } catch (error) {
        res.status(500).json({ codigo: 500, estado: "error", datos: { mensaje: "Error al registrar", detalle: error.message } });
    }
};


// La columna telefono se agrega de forma idempotente para bases creadas antes de este cambio
let columnaTelefonoLista = false;
const asegurarColumnaTelefono = async () => {
    if (columnaTelefonoLista) return;
    const [cols] = await db.query("SHOW COLUMNS FROM usuario LIKE 'telefono'");
    if (cols.length === 0) {
        await db.query('ALTER TABLE usuario ADD COLUMN telefono VARCHAR(30) NULL');
    }
    columnaTelefonoLista = true;
};

const actualizarPerfil = async (req, res) => {
    const { email, telefono, id_cobertura, contrasena } = req.body || {};
    const error = (codigo, mensaje) => res.status(codigo).json({ codigo, estado: "error", datos: { mensaje } });

    if (!email || typeof email !== 'string' || email.length > 120 || email.includes(' ') || email.indexOf('@') < 1 || email.lastIndexOf('.') < email.indexOf('@') + 2 || email.endsWith('.')) {
        return error(400, "El email es obligatorio y debe tener un formato válido.");
    }
    if (contrasena && contrasena.length < 6) {
        return error(400, "La contraseña debe tener al menos 6 caracteres.");
    }

    try {
        await asegurarColumnaTelefono();
        const [duplicados] = await db.query('SELECT id FROM usuario WHERE email = ? AND id <> ?', [email, req.usuario.id]);
        if (duplicados.length > 0) return error(400, "El email ya se encuentra registrado por otro usuario.");

        if (id_cobertura) {
            const [cobertura] = await db.query('SELECT id FROM cobertura WHERE id = ?', [id_cobertura]);
            if (cobertura.length === 0) return error(400, "La cobertura indicada no existe.");
        }

        const campos = ['email = ?', 'telefono = ?', 'id_cobertura = ?'];
        const params = [email, telefono || null, id_cobertura || null];
        if (contrasena) {
            campos.push('password = ?');
            params.push(await bcrypt.hash(contrasena, 10));
        }
        params.push(req.usuario.id);
        await db.query(`UPDATE usuario SET ${campos.join(', ')} WHERE id = ?`, params);

        await registrarAuditoria({
            id_usuario: req.usuario.id,
            accion: 'MODIFICACION',
            tabla: 'usuario',
            id_registro: req.usuario.id,
            detalle: `Autoedición de datos personales (email, teléfono y/o cobertura)`
        });

        res.status(200).json({ codigo: 200, estado: "ok", datos: { mensaje: "Datos actualizados correctamente." } });
    } catch (e) {
        res.status(500).json({ codigo: 500, estado: "error", datos: { mensaje: "Error al actualizar los datos", detalle: e.message } });
    }
};

const perfil = async (req, res) => {
    try {
        await asegurarColumnaTelefono();

        const idUsuario = req.usuario.id;

        // Buscamos los datos excluyendo la contraseña por seguridad
        const [rows] = await db.query('SELECT id, nombre, apellido, dni, email, telefono, fecha_nacimiento, rol, id_cobertura, id_sede FROM usuario WHERE id = ?', [idUsuario]);

        if (rows.length === 0) {
            return res.status(404).json({ codigo: 404, estado: "error", datos: { mensaje: "Usuario no encontrado" } });
        }

        res.status(200).json({
            codigo: 200,
            estado: "ok",
            datos: { usuario: rows[0] }
        });

    } catch (error) {
        res.status(500).json({ codigo: 500, estado: "error", datos: { mensaje: "Error al obtener perfil", detalle: error.message } });
    }
};


const obtenerCoberturas = async (req, res) => {
    try {

        const [rows] = await db.query('SELECT * FROM cobertura');
        res.status(200).json({ codigo: 200, estado: "ok", datos: { coberturas: rows } });
    } catch (error) {
        res.status(500).json({ codigo: 500, estado: "error", datos: { mensaje: "Error al obtener coberturas", detalle: error.message } });
    }
};

module.exports = { login, registro, perfil, actualizarPerfil, obtenerCoberturas };