-- 014_drop_color_overrides.sql
-- La funzionalità admin di modifica dei colori è stata rimossa completamente
-- (pagina /admin/colori, inspector, /api/admin/save-colors, ColorThemeProvider,
-- cookie 'co'). La colonna color_overrides su app_settings non è più usata da
-- nessun codice: il DROP elimina anche le eventuali modifiche salvate, così
-- l'app torna ai colori di default (globals.css).

alter table public.app_settings
  drop column if exists color_overrides;
