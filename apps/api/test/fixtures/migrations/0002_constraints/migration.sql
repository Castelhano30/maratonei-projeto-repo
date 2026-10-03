-- Fixture: estado "N", com índice parcial, trigger e FKs compostas sobre tabelas já populadas.
CREATE UNIQUE INDEX fx_member_one_owner ON fx_member (list_id) WHERE role = 'OWNER';
ALTER TABLE fx_member ADD CONSTRAINT fx_member_list_user_key UNIQUE (list_id, user_id);
ALTER TABLE fx_item ADD CONSTRAINT fx_item_id_list_key UNIQUE (id, list_id);
ALTER TABLE fx_progress
  ADD CONSTRAINT fx_progress_member_fk FOREIGN KEY (list_id, user_id)
    REFERENCES fx_member (list_id, user_id) ON DELETE CASCADE,
  ADD CONSTRAINT fx_progress_item_fk FOREIGN KEY (list_item_id, list_id)
    REFERENCES fx_item (id, list_id) ON DELETE CASCADE;

CREATE FUNCTION fx_keep_owner() RETURNS trigger AS $$
BEGIN
  IF OLD.role = 'OWNER' AND NEW.role IS DISTINCT FROM 'OWNER' THEN
    RAISE EXCEPTION 'o dono não pode mudar de papel';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER fx_member_keep_owner BEFORE UPDATE ON fx_member
  FOR EACH ROW EXECUTE FUNCTION fx_keep_owner();
