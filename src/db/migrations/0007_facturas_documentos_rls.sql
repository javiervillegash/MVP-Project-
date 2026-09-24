-- ============================================================================
-- 0007 · Aislamiento, auditoría e integridad de facturas, apuntes y documentos
-- ============================================================================

ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY invoices_isolation ON invoices FOR ALL TO finanzas_app
  USING (app.can_see_entity(organization_id, legal_entity_id))
  WITH CHECK (app.can_see_entity(organization_id, legal_entity_id));
--> statement-breakpoint
ALTER TABLE invoice_lines ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY invoice_lines_isolation ON invoice_lines FOR ALL TO finanzas_app
  USING (app.can_see_entity(organization_id, legal_entity_id))
  WITH CHECK (app.can_see_entity(organization_id, legal_entity_id));
--> statement-breakpoint
ALTER TABLE manual_entries ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY manual_entries_isolation ON manual_entries FOR ALL TO finanzas_app
  USING (app.can_see_entity(organization_id, legal_entity_id))
  WITH CHECK (app.can_see_entity(organization_id, legal_entity_id));
--> statement-breakpoint
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY documents_isolation ON documents FOR ALL TO finanzas_app
  USING (app.can_see_entity(organization_id, legal_entity_id))
  WITH CHECK (app.can_see_entity(organization_id, legal_entity_id));
--> statement-breakpoint
ALTER TABLE document_links ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY document_links_isolation ON document_links FOR ALL TO finanzas_app
  USING (app.can_see_entity(organization_id, legal_entity_id))
  WITH CHECK (app.can_see_entity(organization_id, legal_entity_id));
--> statement-breakpoint

-- Las facturas, apuntes y documentos no se borran: se anulan. Las líneas de
-- una factura sí se reemplazan al editarla, y un enlace a documento se puede
-- quitar (todo queda en la auditoría).
REVOKE DELETE, TRUNCATE ON invoices, manual_entries, documents FROM finanzas_app;
--> statement-breakpoint
REVOKE TRUNCATE ON invoice_lines, document_links FROM finanzas_app;
--> statement-breakpoint

SELECT app.enable_audit('invoices');
--> statement-breakpoint
SELECT app.enable_audit('manual_entries');
--> statement-breakpoint
SELECT app.enable_audit('documents');
--> statement-breakpoint
SELECT app.enable_audit('document_links');
--> statement-breakpoint
-- invoice_lines no tiene updated_at: solo auditoría.
CREATE TRIGGER audit_row AFTER INSERT OR UPDATE OR DELETE ON invoice_lines
  FOR EACH ROW EXECUTE FUNCTION app.audit_row();
--> statement-breakpoint

-- ------------------------------------------------------------- integridad
CREATE FUNCTION app.assert_entity_org(p_org uuid, p_entity uuid) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM legal_entities WHERE id = p_entity AND organization_id = p_org) THEN
    RAISE EXCEPTION 'La sociedad no pertenece a la organización' USING ERRCODE = '23514';
  END IF;
END $$;
--> statement-breakpoint

CREATE FUNCTION app.check_invoice_integrity() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  cp counterparties%ROWTYPE;
BEGIN
  PERFORM app.assert_entity_org(NEW.organization_id, NEW.legal_entity_id);
  SELECT * INTO cp FROM counterparties WHERE id = NEW.counterparty_id;
  IF cp.legal_entity_id IS DISTINCT FROM NEW.legal_entity_id THEN
    RAISE EXCEPTION 'El cliente o proveedor es de otra sociedad' USING ERRCODE = '23514';
  END IF;
  IF NEW.direction = 'issued' AND NOT cp.is_customer THEN
    RAISE EXCEPTION 'Una factura emitida debe ser a un cliente' USING ERRCODE = '23514';
  END IF;
  IF NEW.direction = 'received' AND NOT cp.is_supplier THEN
    RAISE EXCEPTION 'Una factura recibida debe ser de un proveedor' USING ERRCODE = '23514';
  END IF;
  IF NEW.corrected_invoice_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM invoices WHERE id = NEW.corrected_invoice_id
          AND legal_entity_id = NEW.legal_entity_id AND direction = NEW.direction) THEN
    RAISE EXCEPTION 'La factura rectificada no es válida' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER invoices_integrity BEFORE INSERT OR UPDATE ON invoices
  FOR EACH ROW EXECUTE FUNCTION app.check_invoice_integrity();
--> statement-breakpoint

CREATE FUNCTION app.check_invoice_line_integrity() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  inv invoices%ROWTYPE;
BEGIN
  SELECT * INTO inv FROM invoices WHERE id = NEW.invoice_id;
  IF inv.legal_entity_id IS DISTINCT FROM NEW.legal_entity_id
     OR inv.organization_id IS DISTINCT FROM NEW.organization_id THEN
    RAISE EXCEPTION 'La línea no corresponde a la sociedad de la factura' USING ERRCODE = '23514';
  END IF;
  IF NEW.category_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM categories WHERE id = NEW.category_id AND legal_entity_id = NEW.legal_entity_id
          AND kind = (CASE WHEN inv.direction = 'issued' THEN 'income' ELSE 'expense' END)::category_kind) THEN
    RAISE EXCEPTION 'La categoría de la línea no es válida (debe ser de ingreso en emitidas y de gasto en recibidas)'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER invoice_lines_integrity BEFORE INSERT OR UPDATE ON invoice_lines
  FOR EACH ROW EXECUTE FUNCTION app.check_invoice_line_integrity();
--> statement-breakpoint

CREATE FUNCTION app.check_manual_entry_integrity() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM app.assert_entity_org(NEW.organization_id, NEW.legal_entity_id);
  IF NOT EXISTS (SELECT 1 FROM categories WHERE id = NEW.category_id
                  AND legal_entity_id = NEW.legal_entity_id AND kind::text = NEW.kind::text) THEN
    RAISE EXCEPTION 'La categoría no es válida para este apunte' USING ERRCODE = '23514';
  END IF;
  IF NEW.counterparty_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM counterparties WHERE id = NEW.counterparty_id AND legal_entity_id = NEW.legal_entity_id) THEN
    RAISE EXCEPTION 'El tercero es de otra sociedad' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER manual_entries_integrity BEFORE INSERT OR UPDATE ON manual_entries
  FOR EACH ROW EXECUTE FUNCTION app.check_manual_entry_integrity();
--> statement-breakpoint

CREATE FUNCTION app.check_document_integrity() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM app.assert_entity_org(NEW.organization_id, NEW.legal_entity_id);
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER documents_integrity BEFORE INSERT OR UPDATE ON documents
  FOR EACH ROW EXECUTE FUNCTION app.check_document_integrity();
--> statement-breakpoint

CREATE FUNCTION app.check_document_link_integrity() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_ok boolean;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM documents WHERE id = NEW.document_id
                  AND legal_entity_id = NEW.legal_entity_id AND organization_id = NEW.organization_id) THEN
    RAISE EXCEPTION 'El documento es de otra sociedad' USING ERRCODE = '23514';
  END IF;
  v_ok := CASE NEW.target_type
    WHEN 'invoice' THEN EXISTS (SELECT 1 FROM invoices WHERE id = NEW.target_id AND legal_entity_id = NEW.legal_entity_id)
    WHEN 'manual_entry' THEN EXISTS (SELECT 1 FROM manual_entries WHERE id = NEW.target_id AND legal_entity_id = NEW.legal_entity_id)
    WHEN 'counterparty' THEN EXISTS (SELECT 1 FROM counterparties WHERE id = NEW.target_id AND legal_entity_id = NEW.legal_entity_id)
  END;
  IF NOT v_ok THEN
    RAISE EXCEPTION 'El elemento enlazado no existe en esta sociedad' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER document_links_integrity BEFORE INSERT OR UPDATE ON document_links
  FOR EACH ROW EXECUTE FUNCTION app.check_document_link_integrity();
