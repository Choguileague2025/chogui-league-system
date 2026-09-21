# Noticias y avisos

El administrador publica y edita noticias desde la pestaña **Noticias**. Cada artículo puede ser global o estar asociado a un torneo. Un borrador no aparece en la portada; al publicarlo se emite la actualización SSE habitual.

Una automatización de Make o un agente puede enviar `POST https://choguileague.site/api/noticias/ingest` con `Authorization: Bearer <NEWS_WEBHOOK_TOKEN>` y `Content-Type: application/json`:

```json
{
  "external_id": "fuente-id-unico-123",
  "titulo": "Título verificado",
  "resumen": "Texto breve sustentado en datos oficiales.",
  "categoria": "noticia",
  "torneo_id": 58,
  "publicado": false
}
```

`external_id` impide duplicados ante reintentos. Se recomienda crear primero borradores (`publicado: false`) y revisarlos en el administrador antes de publicarlos. `torneo_id: null` publica para toda la liga. La clave vive en la variable privada de Railway `NEWS_WEBHOOK_TOKEN`; nunca debe colocarse en código ni enviarse al navegador. La copia local está fuera del repositorio en `~/.codex/chogui-news-webhook-token` con permisos de lectura solo para el propietario.

La portada muestra los artículos publicados del torneo seleccionado. Si todavía no hay publicaciones, muestra hechos obtenidos de resultados y posiciones reales.
