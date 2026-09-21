CREATE TABLE IF NOT EXISTS noticias (
    id BIGSERIAL PRIMARY KEY,
    torneo_id INTEGER REFERENCES torneos(id) ON DELETE SET NULL,
    titulo VARCHAR(180) NOT NULL,
    resumen TEXT NOT NULL,
    categoria VARCHAR(30) NOT NULL DEFAULT 'noticia',
    publicado BOOLEAN NOT NULL DEFAULT FALSE,
    origen VARCHAR(20) NOT NULL DEFAULT 'admin',
    external_id VARCHAR(120) UNIQUE,
    fecha_publicacion TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT noticias_categoria_valida CHECK (categoria IN ('noticia', 'aviso')),
    CONSTRAINT noticias_resumen_largo CHECK (char_length(resumen) <= 800)
);

CREATE INDEX IF NOT EXISTS noticias_publicadas_torneo_fecha_idx
    ON noticias (torneo_id, fecha_publicacion DESC, id DESC) WHERE publicado;
