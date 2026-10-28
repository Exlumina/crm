CREATE TABLE `audit` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`document_id` text NOT NULL,
	`operation_id` text NOT NULL,
	`actor` text NOT NULL,
	`before` text,
	`after` text NOT NULL,
	`occurred_at` text NOT NULL
);

CREATE TABLE `documents` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`name` text NOT NULL,
	`data` text NOT NULL,
	`revision` integer NOT NULL,
	`original` text DEFAULT '' NOT NULL,
	`filename` text DEFAULT '' NOT NULL,
	`source_hash` text DEFAULT '' NOT NULL,
	`operation_id` text NOT NULL,
	`operation_digest` text NOT NULL,
	`actor` text NOT NULL,
	`updated_at` text NOT NULL
);

CREATE TABLE `operations` (
	`id` text PRIMARY KEY NOT NULL,
	`digest` text NOT NULL,
	`document_id` text NOT NULL,
	`revision` integer NOT NULL,
	`data` text NOT NULL,
	`applied_at` text NOT NULL
);

CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);

CREATE INDEX documents_type_name ON documents(type, name, id);

CREATE INDEX audit_document ON audit(document_id, id);

CREATE TRIGGER document_insert AFTER INSERT ON documents BEGIN
 INSERT INTO operations(id,digest,document_id,revision,data,applied_at) VALUES(NEW.operation_id,NEW.operation_digest,NEW.id,NEW.revision,NEW.data,NEW.updated_at);
 INSERT INTO audit(document_id,operation_id,actor,before,after,occurred_at) VALUES(NEW.id,NEW.operation_id,NEW.actor,NULL,NEW.data,NEW.updated_at);
END;

CREATE TRIGGER document_update AFTER UPDATE ON documents BEGIN
 INSERT INTO operations(id,digest,document_id,revision,data,applied_at) VALUES(NEW.operation_id,NEW.operation_digest,NEW.id,NEW.revision,NEW.data,NEW.updated_at);
 INSERT INTO audit(document_id,operation_id,actor,before,after,occurred_at) VALUES(NEW.id,NEW.operation_id,NEW.actor,OLD.data,NEW.data,NEW.updated_at);
END;
