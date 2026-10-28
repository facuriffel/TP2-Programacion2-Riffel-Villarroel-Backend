require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();

app.use(cors());
app.use(express.json());

app.use('/health', require('./routes/health.routes'));
app.use('/auth', require('./routes/auth.routes'));
app.use('/usuarios', require('./routes/usuario.routes'));
app.use('/sedes', require('./routes/sede.routes'));
app.use('/especialidades', require('./routes/especialidad.routes'));
app.use('/coberturas', require('./routes/cobertura.routes'));
app.use('/consultas', require('./routes/consulta.routes'));
app.use('/agenda',require('./routes/agenda.routes'));
app.use('/turnos', require('./routes/turno.routes'));
app.use('/historial', require('./routes/historial.routes'));
app.use('/notificaciones', require('./routes/notificacion.routes'));
app.use('/auditoria', require('./routes/auditoria.routes'));
app.use('/reportes', require('./routes/reporte.routes'));

app.use((req, res) => {
    res.status(404).json({ codigo: 404, estado: "error", datos: { mensaje: "Recurso no encontrado" } });
});

app.use((err, req, res, next) => {
    console.error('Error no controlado:', err);
    res.status(500).json({ codigo: 500, estado: "error", datos: { mensaje: "Error interno del servidor" } });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Servidor corriendo en el puerto ${PORT}`);
});