# Social Metrics con Zernio

## Qué hace esta integración

Jarvis puede responder preguntas sobre métricas sociales para:

- Instagram
- TikTok
- YouTube

El flujo usa la skill `social_metrics_lookup` dentro de `packages/skills/src/social`.

## Por qué Zernio va directo y no por Composio

Zernio está integrado como adapter directo dentro del módulo social porque:

- El proyecto ya reserva Composio para Gmail, Calendar, Notion, GitHub y otras herramientas externas.
- Zernio requiere un contrato de métricas propio y un fallback controlado a mock.
- Queremos aislar analytics sociales del approval flow dinámico de Composio.

## Variables de entorno

Configura estas variables en `.env`:

```env
ENABLE_SOCIAL_METRICS=true

ENABLE_ZERNIO=false
ZERNIO_API_KEY=
ZERNIO_BASE_URL=https://zernio.com/api/v1
ZERNIO_READ_ONLY_MODE=true
ZERNIO_FALLBACK_TO_MOCK=true
ZERNIO_DEFAULT_LIMIT=10
```

## Modo mock

Usa modo mock cuando:

- `ENABLE_ZERNIO=false`
- `ENABLE_ZERNIO=true` pero falta `ZERNIO_API_KEY`
- Zernio responde con error recuperable y `ZERNIO_FALLBACK_TO_MOCK=true`

Resultado esperado:

- `dataSource: "mock"`
- `isMock: true`
- warnings explicando por qué no se usó Zernio real

## Modo Zernio real

Para intentar datos reales:

1. Define `ENABLE_ZERNIO=true`
2. Agrega `ZERNIO_API_KEY`
3. Reinicia la API
4. Asegúrate de que la cuenta social consultada esté conectada en Zernio
5. Asegúrate de que Analytics esté disponible en el plan/cuenta

Resultado esperado:

- `dataSource: "zernio"`
- `isMock: false`
- warnings operativos, pero no de fallback

## Cómo verificar health

Con la API corriendo:

```bash
curl http://localhost:4000/health
```

Busca la sección:

```json
{
  "social": {
    "enabled": true,
    "zernioEnabled": true,
    "zernioConfigured": true,
    "mockFallbackEnabled": true,
    "configuredMode": "zernio",
    "lastKnownMode": "mock",
    "warnings": []
  }
}
```

`configuredMode` describe la configuración actual.

`lastKnownMode` describe el último modo observado en ejecución:

- `zernio`
- `mock`
- `unavailable`

## Prompts que Jarvis debería entender

- `Analiza las métricas de Instagram de @nike`
- `Dame las estadísticas de TikTok de @khaby.lame`
- `Revisa el canal de YouTube @mkbhd`
- `Compara Instagram, TikTok y YouTube de @usuario`
- `Qué tan bueno es el engagement de @usuario en redes sociales`
- `Dame recomendaciones para mejorar las redes de @usuario`

## Significado de dataSource

- `dataSource: "zernio"`: métricas reales obtenidas desde una cuenta conectada en Zernio
- `dataSource: "mock"`: datos simulados, generados como fallback seguro
- `dataSource: "unavailable"`: no hubo datos reales y el sistema no pudo o no debía caer a mock

## Troubleshooting

### Falta API key

Síntoma:

- `warnings` menciona `ZERNIO_API_KEY`
- `dataSource` termina en `mock`

Acción:

- agrega `ZERNIO_API_KEY`
- reinicia la API

### 401 / 403

Síntoma:

- warning de autenticación o permisos
- fallback a mock o `unavailable`

Acción:

- verifica que la key sea válida
- confirma scopes/permisos de la cuenta en Zernio

### Rate limit / 429

Síntoma:

- warning de inestabilidad temporal o rate limit

Acción:

- reintenta más tarde
- mantén `ZERNIO_FALLBACK_TO_MOCK=true` para experiencia degradada segura

### Endpoint no confirmado o shape distinto

Síntoma:

- warnings de mapeo o respuesta inesperada

Acción:

- revisa `packages/skills/src/social/adapters/zernioEndpoints.ts`
- ajusta el mapping en `zernioAdapter.ts`

### Cuenta conectada pero sin Analytics habilitado

Síntoma:

- warning indicando que Zernio requiere Analytics add-on

Acción:

- habilita Analytics en Zernio o usa mock hasta que la cuenta tenga acceso

### La cuenta consultada no está conectada

Síntoma:

- warning indicando que no existe una cuenta conectada que coincida con ese `@username`

Acción:

- conecta la cuenta correcta en Zernio
- vuelve a probar con el handle exacto conectado
