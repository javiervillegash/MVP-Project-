-- ============================================================================
-- 0005 · Aislamiento, auditoría e integridad de terceros y categorías
-- ============================================================================

ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY categories_isolation ON categories FOR ALL TO finanzas_app
  USING (app.can_see_entity(organization_id, legal_entity_id))
  WITH CHECK (app.can_see_entity(organization_id, legal_entity_id));
--> statement-breakpoint
ALTER TABLE counterparties ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY counterparties_isolation ON counterparties FOR ALL TO finanzas_app
  USING (app.can_see_entity(organization_id, legal_entity_id))
  WITH CHECK (app.can_see_entity(organization_id, legal_entity_id));
--> statement-breakpoint

-- Datos maestros: se archivan, no se borran.
REVOKE DELETE, TRUNCATE ON categories, counterparties FROM finanzas_app;
--> statement-breakpoint

SELECT app.enable_audit('categories');
--> statement-breakpoint
SELECT app.enable_audit('counterparties');
--> statement-breakpoint

-- ----------------------------------------------------------------------------
-- Integridad entre sociedades. Las claves foráneas NO pasan por RLS: sin esto,
-- alguien que conociera el id de una categoría de otra sociedad podría
-- enlazarla. Estas comprobaciones lo impiden en la propia base de datos.
-- ----------------------------------------------------------------------------
CREATE FUNCTION app.check_category_integrity() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  p categories%ROWTYPE;
  v_org uuid;
BEGIN
  SELECT organization_id INTO v_org FROM legal_entities WHERE id = NEW.legal_entity_id;
  IF v_org IS DISTINCT FROM NEW.organization_id THEN
    RAISE EXCEPTION 'La sociedad no pertenece a la organización' USING ERRCODE = '23514';
  END IF;
  IF NEW.parent_id IS NOT NULL THEN
    SELECT * INTO p FROM categories WHERE id = NEW.parent_id;
    IF p.legal_entity_id IS DISTINCT FROM NEW.legal_entity_id THEN
      RAISE EXCEPTION 'La categoría principal es de otra sociedad' USING ERRCODE = '23514';
    END IF;
    IF p.kind <> NEW.kind THEN
      RAISE EXCEPTION 'La categoría principal es de otro tipo (ingreso/gasto)' USING ERRCODE = '23514';
    END IF;
    IF p.parent_id IS NOT NULL THEN
      RAISE EXCEPTION 'Solo se admiten dos niveles de categorías' USING ERRCODE = '23514';
    END IF;
    IF TG_OP = 'UPDATE' AND EXISTS (SELECT 1 FROM categories WHERE parent_id = NEW.id) THEN
      RAISE EXCEPTION 'Una categoría con subcategorías no puede pasar a ser subcategoría' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER categories_integrity BEFORE INSERT OR UPDATE ON categories
  FOR EACH ROW EXECUTE FUNCTION app.check_category_integrity();
--> statement-breakpoint

CREATE FUNCTION app.check_counterparty_integrity() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_org uuid;
BEGIN
  SELECT organization_id INTO v_org FROM legal_entities WHERE id = NEW.legal_entity_id;
  IF v_org IS DISTINCT FROM NEW.organization_id THEN
    RAISE EXCEPTION 'La sociedad no pertenece a la organización' USING ERRCODE = '23514';
  END IF;
  IF NEW.default_income_category_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM categories WHERE id = NEW.default_income_category_id
          AND legal_entity_id = NEW.legal_entity_id AND kind = 'income') THEN
    RAISE EXCEPTION 'La categoría de ingresos por defecto no es válida para esta sociedad' USING ERRCODE = '23514';
  END IF;
  IF NEW.default_expense_category_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM categories WHERE id = NEW.default_expense_category_id
          AND legal_entity_id = NEW.legal_entity_id AND kind = 'expense') THEN
    RAISE EXCEPTION 'La categoría de gastos por defecto no es válida para esta sociedad' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER counterparties_integrity BEFORE INSERT OR UPDATE ON counterparties
  FOR EACH ROW EXECUTE FUNCTION app.check_counterparty_integrity();
