-- Fixture: tabelas simples, no estado "N-1".
CREATE TABLE fx_list (id integer PRIMARY KEY);
CREATE TABLE fx_member (
  id serial PRIMARY KEY,
  list_id integer NOT NULL REFERENCES fx_list (id),
  user_id integer NOT NULL,
  role text NOT NULL
);
CREATE TABLE fx_item (
  id integer PRIMARY KEY,
  list_id integer NOT NULL REFERENCES fx_list (id)
);
CREATE TABLE fx_progress (
  id serial PRIMARY KEY,
  list_item_id integer NOT NULL,
  list_id integer NOT NULL,
  user_id integer NOT NULL
);
