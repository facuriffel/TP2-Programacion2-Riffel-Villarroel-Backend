-- Clínica Virtual: estructura completa + datos de prueba.
-- Idempotente: las tablas usan CREATE TABLE IF NOT EXISTS y los datos usan ids fijos con
-- INSERT ... ON DUPLICATE KEY UPDATE, por lo que se puede ejecutar varias veces.
-- Pensado para una base nueva: si la base ya tiene otros usuarios con los DNI/emails de
-- este script (ids distintos), el INSERT fallará por clave única.
-- Las fechas de agenda y turnos son relativas a CURDATE(): volver a ejecutar el script
-- las "refresca" para que siempre haya agenda vigente.
--
-- Uso:  mysql -u root -p < sql/schema_and_seed.sql

CREATE DATABASE IF NOT EXISTS clinica_TP2_programacion CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE clinica_TP2_programacion;

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ---------------------------------------------------------------------------
-- Estructura
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS sede (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    direccion VARCHAR(150) NOT NULL,
    telefono VARCHAR(30) NOT NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS cobertura (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS especialidad (
    id INT AUTO_INCREMENT PRIMARY KEY,
    descripcion VARCHAR(100) NOT NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS usuario (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(80) NOT NULL,
    apellido VARCHAR(80) NOT NULL,
    dni VARCHAR(20) NOT NULL,
    email VARCHAR(120) NOT NULL,
    password VARCHAR(100) NOT NULL,
    fecha_nacimiento DATE NULL,
    telefono VARCHAR(30) NULL,
    rol ENUM('administrador', 'operador', 'medico', 'paciente') NOT NULL,
    id_cobertura INT NULL,
    id_sede INT NULL,
    UNIQUE KEY uq_usuario_dni (dni),
    UNIQUE KEY uq_usuario_email (email),
    CONSTRAINT fk_usuario_cobertura FOREIGN KEY (id_cobertura) REFERENCES cobertura(id),
    CONSTRAINT fk_usuario_sede FOREIGN KEY (id_sede) REFERENCES sede(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS medico_especialidad (
    id_medico INT NOT NULL,
    id_especialidad INT NOT NULL,
    PRIMARY KEY (id_medico, id_especialidad),
    CONSTRAINT fk_me_medico FOREIGN KEY (id_medico) REFERENCES usuario(id),
    CONSTRAINT fk_me_especialidad FOREIGN KEY (id_especialidad) REFERENCES especialidad(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS agenda (
    id INT AUTO_INCREMENT PRIMARY KEY,
    hora_entrada TIME NOT NULL,
    hora_salida TIME NOT NULL,
    fecha DATE NOT NULL,
    id_medico INT NOT NULL,
    id_especialidad INT NOT NULL,
    id_sede INT NOT NULL,
    CONSTRAINT fk_agenda_medico FOREIGN KEY (id_medico) REFERENCES usuario(id),
    CONSTRAINT fk_agenda_especialidad FOREIGN KEY (id_especialidad) REFERENCES especialidad(id),
    CONSTRAINT fk_agenda_sede FOREIGN KEY (id_sede) REFERENCES sede(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS turno (
    id INT AUTO_INCREMENT PRIMARY KEY,
    fecha DATE NOT NULL,
    hora TIME NOT NULL,
    estado ENUM('confirmado', 'cancelado', 'atendido') NOT NULL DEFAULT 'confirmado',
    nota TEXT NULL,
    id_paciente INT NOT NULL,
    id_agenda INT NOT NULL,
    id_cobertura INT NULL,
    CONSTRAINT fk_turno_paciente FOREIGN KEY (id_paciente) REFERENCES usuario(id),
    CONSTRAINT fk_turno_agenda FOREIGN KEY (id_agenda) REFERENCES agenda(id),
    CONSTRAINT fk_turno_cobertura FOREIGN KEY (id_cobertura) REFERENCES cobertura(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS historial_clinico (
    id INT AUTO_INCREMENT PRIMARY KEY,
    id_turno INT NOT NULL,
    id_paciente INT NULL,
    id_medico INT NULL,
    diagnostico TEXT NOT NULL,
    tratamiento TEXT NOT NULL,
    observaciones TEXT NULL,
    fecha DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_historial_turno (id_turno),
    KEY idx_historial_paciente (id_paciente),
    KEY idx_historial_medico (id_medico),
    CONSTRAINT fk_historial_turno FOREIGN KEY (id_turno) REFERENCES turno(id),
    CONSTRAINT fk_historial_paciente FOREIGN KEY (id_paciente) REFERENCES usuario(id),
    CONSTRAINT fk_historial_medico FOREIGN KEY (id_medico) REFERENCES usuario(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS log_auditoria (
    id INT AUTO_INCREMENT PRIMARY KEY,
    id_usuario INT NOT NULL,
    accion ENUM('ALTA', 'BAJA', 'MODIFICACION') NOT NULL,
    entidad VARCHAR(50) NOT NULL,
    detalle TEXT NULL,
    fecha DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_log_usuario FOREIGN KEY (id_usuario) REFERENCES usuario(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS notificacion (
    id INT AUTO_INCREMENT PRIMARY KEY,
    id_usuario INT NOT NULL,
    tipo VARCHAR(50) NOT NULL,
    mensaje TEXT NOT NULL,
    leida TINYINT(1) NOT NULL DEFAULT 0,
    fecha DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_notificacion_usuario FOREIGN KEY (id_usuario) REFERENCES usuario(id)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------------
-- Datos de prueba
-- ---------------------------------------------------------------------------

INSERT INTO sede (id, nombre, direccion, telefono) VALUES
    (1, 'Sede Central', 'Av. Corrientes 1234, CABA', '011 4000-1000'),
    (2, 'Sede Norte', 'Av. Cabildo 2500, CABA', '011 4000-2000'),
    (3, 'Sede Sur', 'Av. Mitre 850, Avellaneda', '011 4000-3000')
ON DUPLICATE KEY UPDATE nombre = VALUES(nombre), direccion = VALUES(direccion), telefono = VALUES(telefono);

INSERT INTO cobertura (id, nombre) VALUES
    (1, 'OSDE'),
    (2, 'Swiss Medical'),
    (3, 'PAMI'),
    (4, 'Particular')
ON DUPLICATE KEY UPDATE nombre = VALUES(nombre);

INSERT INTO especialidad (id, descripcion) VALUES
    (1, 'Cardiología'),
    (2, 'Pediatría'),
    (3, 'Dermatología'),
    (4, 'Clínica Médica')
ON DUPLICATE KEY UPDATE descripcion = VALUES(descripcion);

-- Contraseñas (bcrypt): admin123 (administrador) / prueba123 (operador, médicos y pacientes)
INSERT INTO usuario (id, nombre, apellido, dni, email, password, fecha_nacimiento, telefono, rol, id_cobertura, id_sede) VALUES
    (1, 'Ana', 'Administradora', '12312312', 'admin@clinica.test', '$2b$10$5dTnyl/H1MDH3dhfSaE4t.azaom.7B2ZWHX300LcNaIM9jFvcI9oK', '1985-03-10', NULL, 'administrador', NULL, NULL),
    (2, 'Oscar', 'Operador', '40123123', 'operador@gmail.com', '$2b$10$z15mfo2sqK.QJx1kM9aUmOwo8QhI64Z3JQTmbmx3VPuaDN9q/Ey/e', '1990-07-21', NULL, 'operador', NULL, 1),
    (3, 'Martín', 'Gómez', '41123123', 'medico@gmail.com', '$2b$10$z15mfo2sqK.QJx1kM9aUmOwo8QhI64Z3JQTmbmx3VPuaDN9q/Ey/e', '1978-11-02', NULL, 'medico', NULL, 1),
    (4, 'Lucía', 'Fernández', '20000002', 'medico2@clinica.test', '$2b$10$z15mfo2sqK.QJx1kM9aUmOwo8QhI64Z3JQTmbmx3VPuaDN9q/Ey/e', '1982-05-15', NULL, 'medico', NULL, 2),
    (5, 'Julián', 'Ramírez', '20000003', 'medico3@clinica.test', '$2b$10$z15mfo2sqK.QJx1kM9aUmOwo8QhI64Z3JQTmbmx3VPuaDN9q/Ey/e', '1975-09-30', NULL, 'medico', NULL, 3),
    (6, 'Paula', 'Pérez', '42123123', 'paciente@clinica.test', '$2b$10$z15mfo2sqK.QJx1kM9aUmOwo8QhI64Z3JQTmbmx3VPuaDN9q/Ey/e', '1995-02-14', '011 5555-0001', 'paciente', 1, NULL),
    (7, 'Carlos', 'López', '43123123', 'paciente2@clinica.test', '$2b$10$z15mfo2sqK.QJx1kM9aUmOwo8QhI64Z3JQTmbmx3VPuaDN9q/Ey/e', '1960-08-03', '011 5555-0002', 'paciente', 2, NULL),
    (8, 'Sofía', 'Díaz', '44123123', 'paciente3@clinica.test', '$2b$10$z15mfo2sqK.QJx1kM9aUmOwo8QhI64Z3JQTmbmx3VPuaDN9q/Ey/e', '2015-12-25', NULL, 'paciente', 3, NULL)
ON DUPLICATE KEY UPDATE nombre = VALUES(nombre), apellido = VALUES(apellido), dni = VALUES(dni), email = VALUES(email),
    password = VALUES(password), fecha_nacimiento = VALUES(fecha_nacimiento), telefono = VALUES(telefono),
    rol = VALUES(rol), id_cobertura = VALUES(id_cobertura), id_sede = VALUES(id_sede);

-- Médico 3: Cardiología y Clínica Médica (agenda en Sede Central y Sede Norte)
-- Médico 4: Pediatría (Sede Norte) | Médico 5: Dermatología (Sede Sur)
INSERT IGNORE INTO medico_especialidad (id_medico, id_especialidad) VALUES
    (3, 1), (3, 4), (4, 2), (5, 3);

INSERT INTO agenda (id, hora_entrada, hora_salida, fecha, id_medico, id_especialidad, id_sede) VALUES
    (1, '09:00:00', '12:00:00', CURDATE(), 3, 1, 1),
    (2, '14:00:00', '17:00:00', DATE_ADD(CURDATE(), INTERVAL 1 DAY), 3, 1, 2),
    (3, '09:00:00', '12:00:00', DATE_ADD(CURDATE(), INTERVAL 2 DAY), 3, 4, 1),
    (4, '09:00:00', '12:00:00', DATE_SUB(CURDATE(), INTERVAL 2 DAY), 3, 1, 1),
    (5, '08:00:00', '11:00:00', CURDATE(), 4, 2, 2),
    (6, '08:00:00', '11:00:00', DATE_ADD(CURDATE(), INTERVAL 1 DAY), 4, 2, 2),
    (7, '08:00:00', '11:00:00', DATE_SUB(CURDATE(), INTERVAL 1 DAY), 4, 2, 2),
    (8, '10:00:00', '13:00:00', CURDATE(), 5, 3, 3),
    (9, '10:00:00', '13:00:00', DATE_ADD(CURDATE(), INTERVAL 3 DAY), 5, 3, 3),
    (10, '10:00:00', '13:00:00', DATE_SUB(CURDATE(), INTERVAL 3 DAY), 5, 3, 3)
ON DUPLICATE KEY UPDATE hora_entrada = VALUES(hora_entrada), hora_salida = VALUES(hora_salida), fecha = VALUES(fecha),
    id_medico = VALUES(id_medico), id_especialidad = VALUES(id_especialidad), id_sede = VALUES(id_sede);

-- Turnos: 5 confirmados, 3 atendidos (con historial) y 3 cancelados
INSERT INTO turno (id, fecha, hora, estado, nota, id_paciente, id_agenda, id_cobertura) VALUES
    (1, CURDATE(), '09:00:00', 'confirmado', 'Control cardiológico anual.', 6, 1, 1),
    (2, CURDATE(), '09:30:00', 'confirmado', 'Dolor de pecho ocasional al caminar.', 7, 1, 2),
    (3, DATE_ADD(CURDATE(), INTERVAL 1 DAY), '14:00:00', 'confirmado', 'Consulta por palpitaciones.', 8, 2, 3),
    (4, CURDATE(), '08:00:00', 'confirmado', 'Control pediátrico de rutina.', 6, 5, 1),
    (5, CURDATE(), '10:00:00', 'confirmado', 'Manchas en la piel de los brazos.', 7, 8, 2),
    (6, DATE_SUB(CURDATE(), INTERVAL 2 DAY), '09:00:00', 'atendido', 'Chequeo general.', 6, 4, 1),
    (7, DATE_SUB(CURDATE(), INTERVAL 1 DAY), '08:00:00', 'atendido', 'Fiebre alta desde hace dos días.', 7, 7, 2),
    (8, DATE_SUB(CURDATE(), INTERVAL 3 DAY), '10:00:00', 'atendido', 'Alergia cutánea.', 8, 10, 3),
    (9, DATE_SUB(CURDATE(), INTERVAL 2 DAY), '09:30:00', 'cancelado', 'Control de presión.', 8, 4, 3),
    (10, DATE_ADD(CURDATE(), INTERVAL 1 DAY), '08:30:00', 'cancelado', 'Vacunación.', 6, 6, 1),
    (11, DATE_ADD(CURDATE(), INTERVAL 3 DAY), '11:00:00', 'cancelado', 'Revisión de lunar.', 7, 9, 2)
ON DUPLICATE KEY UPDATE fecha = VALUES(fecha), hora = VALUES(hora), estado = VALUES(estado), nota = VALUES(nota),
    id_paciente = VALUES(id_paciente), id_agenda = VALUES(id_agenda), id_cobertura = VALUES(id_cobertura);

INSERT INTO historial_clinico (id, id_turno, id_paciente, id_medico, diagnostico, tratamiento, observaciones, fecha) VALUES
    (1, 6, 6, 3, 'Paciente sana, valores dentro de lo normal.', 'Mantener actividad física y dieta equilibrada.', 'Repetir control en 12 meses.', DATE_SUB(NOW(), INTERVAL 2 DAY)),
    (2, 7, 7, 4, 'Faringitis aguda.', 'Paracetamol cada 8 hs y reposo por 3 días.', NULL, DATE_SUB(NOW(), INTERVAL 1 DAY)),
    (3, 8, 8, 5, 'Dermatitis alérgica de contacto.', 'Crema con corticoide tópico dos veces al día durante 7 días.', 'Evitar el contacto con el alérgeno.', DATE_SUB(NOW(), INTERVAL 3 DAY))
ON DUPLICATE KEY UPDATE id_turno = VALUES(id_turno), id_paciente = VALUES(id_paciente), id_medico = VALUES(id_medico), diagnostico = VALUES(diagnostico),
    tratamiento = VALUES(tratamiento), observaciones = VALUES(observaciones), fecha = VALUES(fecha);

INSERT INTO notificacion (id, id_usuario, tipo, mensaje, leida, fecha) VALUES
    (1, 6, 'turno_confirmado', 'Tu turno de hoy a las 09:00 hs ha sido confirmado.', 0, DATE_SUB(NOW(), INTERVAL 1 HOUR)),
    (2, 6, 'turno_atendido', 'Tu turno de hace dos días ha sido registrado como atendido.', 0, DATE_SUB(NOW(), INTERVAL 2 DAY)),
    (3, 7, 'turno_atendido', 'Tu turno de ayer ha sido registrado como atendido.', 1, DATE_SUB(NOW(), INTERVAL 1 DAY)),
    (4, 8, 'turno_cancelado', 'Tu turno de hace dos días a las 09:30 hs ha sido cancelado.', 0, DATE_SUB(NOW(), INTERVAL 2 DAY))
ON DUPLICATE KEY UPDATE id_usuario = VALUES(id_usuario), tipo = VALUES(tipo), mensaje = VALUES(mensaje),
    leida = VALUES(leida), fecha = VALUES(fecha);

INSERT INTO log_auditoria (id, id_usuario, accion, entidad, detalle, fecha) VALUES
    (1, 1, 'ALTA', 'sede', '{"body":{"nombre":"Sede Central"}}', DATE_SUB(NOW(), INTERVAL 10 DAY)),
    (2, 1, 'ALTA', 'especialidad', '{"body":{"descripcion":"Cardiología"}}', DATE_SUB(NOW(), INTERVAL 9 DAY)),
    (3, 1, 'ALTA', 'usuario', '{"body":{"nombre":"Martín","apellido":"Gómez","rol":"medico"}}', DATE_SUB(NOW(), INTERVAL 8 DAY)),
    (4, 1, 'MODIFICACION', 'cobertura', '{"body":{"nombre":"Swiss Medical"}}', DATE_SUB(NOW(), INTERVAL 5 DAY)),
    (5, 1, 'BAJA', 'cobertura', '{"parametros":{"id":"99"}}', DATE_SUB(NOW(), INTERVAL 4 DAY))
ON DUPLICATE KEY UPDATE id_usuario = VALUES(id_usuario), accion = VALUES(accion), entidad = VALUES(entidad),
    detalle = VALUES(detalle), fecha = VALUES(fecha);

SET FOREIGN_KEY_CHECKS = 1;
