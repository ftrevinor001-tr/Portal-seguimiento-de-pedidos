/* =====================================================================
   CONFIGURACIÓN DEL PORTAL
   Único archivo que hay que editar al instalar.
   ===================================================================== */
window.SP_CONFIG = {
  // Supabase > Project Settings > API
  SUPABASE_URL: 'https://rbakkrzxdjkpbmbcurng.supabase.co',
  // Pega aquí la llave pública: "anon public" (empieza con eyJ...) o "publishable" (empieza con sb_publishable_...).
  // NUNCA pegues la llave "service_role" / "secret".
  SUPABASE_KEY: 'PEGAR_AQUI_LA_LLAVE_ANON',

  EMPRESA: 'GRUPO SANVER',
  TITULO: 'Portal de Seguimiento de Pedidos',

  // Calendario de Entregas Directas: capacidad de descarga por día (horas)
  // Sin carga = 0 h · Baja < 50% · Media 50% a 99% · Alta >= 100% de la capacidad
  CAPACIDAD_HORAS_DIA: 8,
  UMBRAL_CARGA_MEDIA: 0.5,
  UMBRAL_CARGA_ALTA: 1.0,

  // ALERTA = NOTIFICAR cuando faltan menos de N días para la fecha estimada
  DIAS_NOTIFICAR: 5,

  // % de pago mínimo requerido (política de documentación de sobrepedido)
  MONTO_PAGO_PARCIAL: 200000,
  PCT_PAGO_PARCIAL: 0.7,
};
