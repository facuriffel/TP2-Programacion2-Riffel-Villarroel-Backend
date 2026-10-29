# Sistema de Gestión de Turnos Médicos — API REST

Backend del Trabajo Práctico Integrador de **Programación 2**. API REST construida con **Node.js + Express + MySQL** que da soporte a la gestión de turnos médicos: sedes, especialidades, coberturas, usuarios (administrador, operador, médico y paciente), agendas, turnos, consultas/historial clínico y auditoría.

**Integrantes:** Riffel, Facundo — Villarroel, Federico

## Requisitos previos

| Herramienta | Versión |
| :--- | :--- |
| Node.js | v18 o superior |
| npm | incluido con Node.js |
| MySQL | vía XAMPP (servicio MySQL en el puerto `3306`) |

## Puesta en marcha paso a paso

1. **Levantar MySQL**
   Iniciar XAMPP y arrancar el módulo **MySQL** (puerto `3306`).

2. **Crear la base de datos**
   Abrir **phpMyAdmin** → pestaña **SQL** e importar/ejecutar el contenido de [`sql/schema_and_seed.sql`](sql/schema_and_seed.sql).
   El script crea la base de datos `clinica_TP2_programacion` (si no existe), todas las tablas y carga los datos de prueba (sedes, especialidades, coberturas, usuarios, agendas y turnos de ejemplo).

   Opcionalmente, se puede importar también [`sql/historial_clinico.sql`](sql/historial_clinico.sql) para disponer de consultas/historial clínico de ejemplo.

3. **Configurar las variables de entorno**
   En la carpeta `backend/` crear un archivo `.env` con el siguiente contenido (ajustar `DB_PASSWORD` si tu instalación de MySQL tiene contraseña):

   ```env
   PORT=3000
   DB_HOST=localhost
   DB_USER=root
   DB_PASSWORD=
   DB_NAME=clinica_TP2_programacion
   JWT_SECRET=secreto_super_seguro_clinica
   ```

4. **Instalar dependencias**

   ```bash
   npm install
   ```

5. **Levantar el servidor**

   ```bash
   npm run dev
   ```

   El servidor queda disponible en `http://localhost:3000`. (`npm run dev` usa `nodemon` para recarga automática; `npm start` levanta el servidor sin watcher.)

## Usuarios de prueba

El login se realiza por **DNI + contraseña** (endpoint `POST /api/auth/login`). Todos los usuarios de la semilla usan las siguientes credenciales:

| Rol | DNI | Email | Contraseña | Notas |
| :--- | :--- | :--- | :--- | :--- |
| Administrador | 12312312 | - | admin123 | Acceso total: ABMs, reportes y auditoría |
| Operador | 40123123 | operador@gmail.com | prueba123 | Gestión de agendas y asignación de turnos en su sede |
| Médico | 41123123 | medico@gmail.com | prueba123 | Carga de franjas horarias y atención de turnos |
| Paciente 1 | 42123123 | - | prueba123 | Reserva y consulta de historial |
| Paciente 2 | 43123123 | - | prueba123 | Reserva y consulta de historial |
| Paciente 3 | 44123123 | - | prueba123 | Reserva y consulta de historial |

> El email no se usa para iniciar sesión (el login es por DNI); se muestra `-` en los roles donde no es relevante para la prueba.

Además de los usuarios de la tabla, la semilla incluye dos médicos adicionales para poder probar la gestión multi-sede (agendas y turnos en distintas sedes y especialidades):

| Rol | DNI | Email | Contraseña | Notas |
| :--- | :--- | :--- | :--- | :--- |
| Médico (Pediatría) | 20000002 | medico2@clinica.test | prueba123 | Atiende en Sede 2 |
| Médico (Dermatología) | 20000003 | medico3@clinica.test | prueba123 | Atiende en Sede 3 |

> Los nuevos pacientes también pueden autorregistrarse desde `POST /api/auth/registro`.

## Colección de Postman

La colección con todos los endpoints documentados (incluye flujo de autenticación con token Bearer y variables de entorno por rol) se encuentra en [`docs/TP2 - API (Riffel-Villarroel).postman_collection.json`](../docs/TP2%20-%20API%20%28Riffel-Villarroel%29.postman_collection.json), en la carpeta `docs/` de la raíz del repositorio.

Para usarla:
1. Importar el archivo en Postman (`File → Import`).
2. Ejecutar la request de login con el rol deseado para obtener el token JWT.
3. El token queda disponible para el resto de las requests autenticadas de la colección.

## Arquitectura y módulos

```
backend/
├── src/
│   ├── index.js            # Punto de entrada de la aplicación
│   ├── database/           # Conexión a MySQL (pool de conexiones)
│   ├── routes/             # Definición de endpoints por recurso
│   ├── controllers/        # Lógica de cada endpoint (auth, usuario, sede, especialidad,
│   │                        #   cobertura, agenda, turno, consulta, historial, reporte, auditoria)
│   ├── middlewares/        # Autenticación JWT y control de acceso por rol
│   └── services/           # Lógica reutilizable (registro de auditoría)
├── sql/                     # Script de esquema + datos de prueba (schema_and_seed.sql, historial_clinico.sql)
└── .env                     # Variables de entorno (no versionado)
```

**Puntos clave de la implementación:**
- **Auditoría fail-safe:** cada alta, modificación o baja relevante (usuarios, turnos, atención de consultas) registra un evento en la tabla de auditoría a través de `services/auditoria.service.js`. El registro de auditoría está aislado de la transacción principal para que, si por algún motivo falla, **no** impida ni revierta la operación de negocio que la originó.
- **Transacciones:** las operaciones sensibles a inconsistencias —como la atención de un turno (que actualiza el estado del turno y crea la consulta/historial clínico asociado) y la gestión de usuarios— se ejecutan dentro de transacciones MySQL para garantizar atomicidad.
- **Autorización por rol:** `middlewares/auth.middleware.js` valida el JWT y restringe cada ruta según el rol del usuario (administrador, operador, médico, paciente).

## Resolución de fallos

- **Error de conexión a MySQL:** verificar que el servicio MySQL de XAMPP esté corriendo en el puerto `3306` y que `DB_PASSWORD` en `.env` coincida con la de tu instalación.
- **Puerto 3000 ocupado:** cambiar `PORT` en `.env` (recordar actualizar también la URL base en el frontend).
- **Error 401 en todas las rutas protegidas:** confirmar que se está enviando el header `Authorization: Bearer <token>` obtenido en el login.
