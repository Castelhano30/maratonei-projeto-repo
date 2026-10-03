INSERT INTO fx_list (id) VALUES (1), (2);
INSERT INTO fx_member (list_id, user_id, role) VALUES (1, 10, 'OWNER'), (1, 11, 'EDITOR'), (2, 10, 'OWNER');
INSERT INTO fx_item (id, list_id) VALUES (100, 1), (200, 2);
INSERT INTO fx_progress (list_item_id, list_id, user_id) VALUES (100, 1, 11), (100, 1, 10);
