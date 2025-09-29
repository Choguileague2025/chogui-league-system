CREATE TABLE IF NOT EXISTS torneos (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(100) UNIQUE NOT NULL,
    fecha_inicio TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    activo BOOLEAN DEFAULT false
);

-- Insertar un torneo por defecto si no existe
INSERT INTO torneos (nombre, activo) 
VALUES ('Temporada 2025', true)
ON CONFLICT (nombre) DO NOTHING;

COMMENT ON TABLE torneos IS 'Lista de torneos/temporadas de la liga';
