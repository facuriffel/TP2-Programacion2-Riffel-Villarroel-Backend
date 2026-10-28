-- Script idempotente: crea/ajusta la tabla que usa historial.controller.js (historial_clinico).
-- Se puede ejecutar varias veces sin romper datos existentes.

CREATE TABLE IF NOT EXISTS historial_clinico (
    id INT AUTO_INCREMENT PRIMARY KEY,
    id_turno INT NOT NULL,
    id_paciente INT NULL,
    diagnostico TEXT NOT NULL,
    tratamiento TEXT NOT NULL,
    observaciones TEXT NULL,
    fecha DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_historial_turno (id_turno),
    KEY idx_historial_paciente (id_paciente)
) ENGINE=InnoDB;

DROP PROCEDURE IF EXISTS ajustar_historial_clinico;
DELIMITER //
CREATE PROCEDURE ajustar_historial_clinico()
BEGIN
    -- Columnas que pudieran faltar en una tabla preexistente
    IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'historial_clinico' AND COLUMN_NAME = 'id_paciente') THEN
        ALTER TABLE historial_clinico ADD COLUMN id_paciente INT NULL AFTER id_turno;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'historial_clinico' AND COLUMN_NAME = 'observaciones') THEN
        ALTER TABLE historial_clinico ADD COLUMN observaciones TEXT NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'historial_clinico' AND COLUMN_NAME = 'fecha') THEN
        ALTER TABLE historial_clinico ADD COLUMN fecha DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP;
    END IF;

    -- Relación con turno (asume turno.id INT)
    IF NOT EXISTS (SELECT 1 FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'historial_clinico' AND CONSTRAINT_NAME = 'fk_historial_turno') THEN
        ALTER TABLE historial_clinico ADD CONSTRAINT fk_historial_turno FOREIGN KEY (id_turno) REFERENCES turno(id);
    END IF;
    -- Relación con usuario/paciente (asume usuario.id INT)
    IF NOT EXISTS (SELECT 1 FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'historial_clinico' AND CONSTRAINT_NAME = 'fk_historial_paciente') THEN
        ALTER TABLE historial_clinico ADD CONSTRAINT fk_historial_paciente FOREIGN KEY (id_paciente) REFERENCES usuario(id);
    END IF;
END //
DELIMITER ;

CALL ajustar_historial_clinico();
DROP PROCEDURE ajustar_historial_clinico;

-- Completa id_paciente en registros existentes
UPDATE historial_clinico h
JOIN turno t ON h.id_turno = t.id
SET h.id_paciente = t.id_paciente
WHERE h.id_paciente IS NULL;
