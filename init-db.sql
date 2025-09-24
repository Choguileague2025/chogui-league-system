-- Crear tabla de equipos
CREATE TABLE IF NOT EXISTS equipos (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(100) UNIQUE NOT NULL,
    manager VARCHAR(100) NOT NULL,
    ciudad VARCHAR(100) NOT NULL,
    fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Crear tabla de partidos
CREATE TABLE IF NOT EXISTS partidos (
    id SERIAL PRIMARY KEY,
    equipo_local_id INTEGER REFERENCES equipos(id),
    equipo_visitante_id INTEGER REFERENCES equipos(id),
    carreras_local INTEGER,
    carreras_visitante INTEGER,
    innings_jugados INTEGER DEFAULT 9,
    fecha_partido DATE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Crear tabla de jugadores
CREATE TABLE IF NOT EXISTS jugadores (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    equipo_id INTEGER REFERENCES equipos(id),
    posicion VARCHAR(10),
    numero INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Crear tabla de usuarios para el login
CREATE TABLE IF NOT EXISTS usuarios (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'admin',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insertar un usuario administrador inicial (contraseña: admin)
-- La contraseña está encriptada por seguridad (hashed)
INSERT INTO usuarios (username, password, role) VALUES
('admin', '$2b$10$f.B4.6tP9jZ3a/uP3iU.a.URaG23S.g2u7y.j2zYj2y.x2C6p3dO6', 'admin')
ON CONFLICT (username) DO NOTHING;


-- Insertar datos de ejemplo
INSERT INTO equipos (nombre, manager, ciudad) VALUES 
('Dragones FC', 'Carlos Méndez', 'Buenos Aires'),
('Tigres Unidos', 'Ana Rodriguez', 'Rosario'),
('Leones Dorados', 'Luis Gomez', 'Córdoba'),
('Águilas Negras', 'María López', 'La Plata')
ON CONFLICT (nombre) DO NOTHING;
