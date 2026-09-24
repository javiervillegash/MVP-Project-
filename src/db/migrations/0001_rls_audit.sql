-- ============================================================================
-- 0001 · Aislamiento multiempresa (Row-Level Security) y auditoría automática
--
-- Modelo de seguridad:
--   * La aplicación se conecta como `finanzas_app`, que NO puede saltarse RLS.
--   * Cada transacción fija su contexto con set_config (ver src/db/tenant.ts):
--       app.user_id     usuario autenticado
--       app.org_id      organización activa
--       app.org_wide    'on' si es Administrador de la organización
--       app.entity_ids  sociedades visibles ('{uuid,uuid}')
--       app.company_ids clientes visibles  ('{uuid,uuid}')
--   * Sin contexto, las tablas de negocio devuelven cero filas.
--   * Todo cambio en tablas auditadas se registra por trigger en audit_log,
--     y un cambio sin usuario responsable se rechaza.
-- ============================================================================

-- ---------------------------------------------------------------- roles
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'finanzas_app') THEN
    CREATE ROLE finanzas_app NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
  END IF;
END $$;
--> statement-breakpoint

CREATE SCHEMA IF NOT EXISTS app;
--> statement-breakpoint
GRANT USAGE ON SCHEMA app TO finanzas_app;
--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO finanzas_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO finanzas_app;
--> statement-breakpoint
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO finanzas_app;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO finanzas_app;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO finanzas_app;
--> statement-breakpoint

-- Los datos maestros no se borran: se archivan (status = 'archived').
REVOKE DELETE, TRUNCATE ON organizations, companies, legal_entities FROM finanzas_app;
--> statement-breakpoint
-- La auditoría solo la escriben los triggers; la app únicamente puede leerla.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON audit_log FROM finanzas_app;
--> statement-breakpoint

-- ------------------------------------------------------- contexto de sesión
CREATE FUNCTION app.current_user_id() RETURNS text
  LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('app.user_id', true), '') $$;
--> statement-breakpoint
CREATE FUNCTION app.current_org_id() RETURNS uuid
  LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('app.org_id', true), '')::uuid $$;
--> statement-breakpoint
CREATE FUNCTION app.is_org_wide() RETURNS boolean
  LANGUAGE sql STABLE AS $$ SELECT coalesce(current_setting('app.org_wide', true), '') = 'on' $$;
--> statement-breakpoint
CREATE FUNCTION app.entity_ids() RETURNS uuid[]
  LANGUAGE sql STABLE AS $$
    SELECT coalesce(nullif(current_setting('app.entity_ids', true), '')::uuid[], '{}'::uuid[])
  $$;
--> statement-breakpoint
CREATE FUNCTION app.company_ids() RETURNS uuid[]
  LANGUAGE sql STABLE AS $$
    SELECT coalesce(nullif(current_setting('app.company_ids', true), '')::uuid[], '{}'::uuid[])
  $$;
--> statement-breakpoint

-- Predicado único que usarán TODAS las tablas con legal_entity_id.
CREATE FUNCTION app.can_see_entity(p_org uuid, p_entity uuid) RETURNS boolean
  LANGUAGE sql STABLE AS $$
    SELECT p_org IS NOT DISTINCT FROM app.current_org_id()
       AND app.current_org_id() IS NOT NULL
       AND (app.is_org_wide() OR p_entity = ANY (app.entity_ids()))
  $$;
--> statement-breakpoint

-- Permisos efectivos del usuario actual en una organización. Se ejecuta con
-- privilegios del propietario porque se usa ANTES de conocer qué sociedades
-- puede ver el usuario, pero solo devuelve las filas del propio usuario.
CREATE FUNCTION app.my_grants(p_org uuid)
  RETURNS TABLE (role member_role, company_id uuid, legal_entity_id uuid)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
    SELECT m.role, le.company_id, le.id
      FROM memberships m
      JOIN legal_entities le
        ON le.organization_id = m.organization_id
       AND le.status = 'active'
       AND (le.id = m.legal_entity_id OR le.company_id = m.company_id)
     WHERE m.user_id = app.current_user_id()
       AND m.organization_id = p_org
       AND m.role <> 'org_admin'
  $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app.my_grants(uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app.my_grants(uuid) TO finanzas_app;
--> statement-breakpoint

-- ------------------------------------------------------------------- RLS
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY organizations_select ON organizations FOR SELECT TO finanzas_app
  USING (id = app.current_org_id());
--> statement-breakpoint
CREATE POLICY organizations_update ON organizations FOR UPDATE TO finanzas_app
  USING (id = app.current_org_id() AND app.is_org_wide())
  WITH CHECK (id = app.current_org_id() AND app.is_org_wide());
--> statement-breakpoint

ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY companies_isolation ON companies FOR ALL TO finanzas_app
  USING (
    organization_id = app.current_org_id()
    AND (app.is_org_wide() OR id = ANY (app.company_ids()))
  )
  WITH CHECK (
    organization_id = app.current_org_id()
    AND (app.is_org_wide() OR id = ANY (app.company_ids()))
  );
--> statement-breakpoint

ALTER TABLE legal_entities ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY legal_entities_isolation ON legal_entities FOR ALL TO finanzas_app
  USING (app.can_see_entity(organization_id, id))
  WITH CHECK (app.can_see_entity(organization_id, id));
--> statement-breakpoint

ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
-- Cada usuario ve sus propias membresías (para resolver su acceso); el
-- Administrador ve y gestiona todas las de su organización.
CREATE POLICY memberships_select ON memberships FOR SELECT TO finanzas_app
  USING (
    user_id = app.current_user_id()
    OR (organization_id = app.current_org_id() AND app.is_org_wide())
  );
--> statement-breakpoint
CREATE POLICY memberships_write ON memberships FOR ALL TO finanzas_app
  USING (organization_id = app.current_org_id() AND app.is_org_wide())
  WITH CHECK (organization_id = app.current_org_id() AND app.is_org_wide());
--> statement-breakpoint

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY audit_log_select ON audit_log FOR SELECT TO finanzas_app
  USING (organization_id = app.current_org_id() AND app.is_org_wide());
--> statement-breakpoint

-- ------------------------------------------------------------- auditoría
CREATE FUNCTION app.audit_row() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_actor   text := app.current_user_id();
  v_old     jsonb;
  v_new     jsonb;
  v_org     uuid;
  v_entity  uuid;
  v_changed text[];
BEGIN
  IF v_actor IS NULL THEN
    -- Procesos de sistema (migraciones de datos, scripts) deben identificarse.
    v_actor := nullif(current_setting('app.system_actor', true), '');
    IF v_actor IS NULL THEN
      RAISE EXCEPTION 'Cambio en % sin usuario responsable (falta app.user_id)', TG_TABLE_NAME
        USING ERRCODE = '42501';
    END IF;
    v_actor := 'system:' || v_actor;
  END IF;

  IF TG_OP <> 'INSERT' THEN v_old := to_jsonb(OLD); END IF;
  IF TG_OP <> 'DELETE' THEN v_new := to_jsonb(NEW); END IF;

  IF TG_TABLE_NAME = 'organizations' THEN
    v_org := coalesce(v_new ->> 'id', v_old ->> 'id')::uuid;
  ELSE
    v_org := coalesce(v_new ->> 'organization_id', v_old ->> 'organization_id')::uuid;
  END IF;

  IF TG_TABLE_NAME = 'legal_entities' THEN
    v_entity := coalesce(v_new ->> 'id', v_old ->> 'id')::uuid;
  ELSE
    v_entity := coalesce(v_new ->> 'legal_entity_id', v_old ->> 'legal_entity_id')::uuid;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    SELECT array_agg(n.key ORDER BY n.key) INTO v_changed
      FROM jsonb_each(v_new) n
     WHERE n.key <> 'updated_at' AND n.value IS DISTINCT FROM (v_old -> n.key);
    IF v_changed IS NULL THEN
      RETURN NEW; -- nada relevante cambió
    END IF;
  END IF;

  INSERT INTO audit_log (organization_id, legal_entity_id, actor_user_id, action,
                         table_name, record_id, before, after, changed_fields, request_id)
  VALUES (v_org, v_entity, v_actor, TG_OP, TG_TABLE_NAME,
          coalesce(v_new ->> 'id', v_old ->> 'id'), v_old, v_new, v_changed,
          nullif(current_setting('app.request_id', true), ''));

  RETURN coalesce(NEW, OLD);
END $$;
--> statement-breakpoint

CREATE FUNCTION app.touch_updated_at() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;
--> statement-breakpoint

-- Activa auditoría y updated_at en una tabla. Las migraciones futuras llaman a
-- esta función para cada tabla de negocio nueva.
CREATE FUNCTION app.enable_audit(p_table regclass) RETURNS void
  LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE format(
    'CREATE TRIGGER audit_row AFTER INSERT OR UPDATE OR DELETE ON %s
       FOR EACH ROW EXECUTE FUNCTION app.audit_row()', p_table);
  EXECUTE format(
    'CREATE TRIGGER touch_updated_at BEFORE UPDATE ON %s
       FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at()', p_table);
END $$;
--> statement-breakpoint

SELECT app.enable_audit('organizations');
--> statement-breakpoint
SELECT app.enable_audit('companies');
--> statement-breakpoint
SELECT app.enable_audit('legal_entities');
--> statement-breakpoint
SELECT app.enable_audit('memberships');
--> statement-breakpoint

-- El registro de auditoría es inmutable también para el propietario.
CREATE FUNCTION app.audit_log_immutable() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_log es de solo inserción' USING ERRCODE = '42501';
END $$;
--> statement-breakpoint
CREATE TRIGGER audit_log_immutable BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION app.audit_log_immutable();
--> statement-breakpoint
CREATE TRIGGER audit_log_no_truncate BEFORE TRUNCATE ON audit_log
  FOR EACH STATEMENT EXECUTE FUNCTION app.audit_log_immutable();
