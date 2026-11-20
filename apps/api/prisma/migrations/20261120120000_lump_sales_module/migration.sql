-- Módulo "Ventas por valor total (sin producto)": queda disponible para todos los negocios;
-- cada sede lo activa desde Administración → Sedes.
UPDATE "Tenant" SET "enabledModules" = array_append("enabledModules", 'lump_sales')
WHERE NOT ('lump_sales' = ANY("enabledModules"));
