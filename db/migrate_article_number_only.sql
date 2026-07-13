begin;

alter table products add column if not exists article_number text;

update products
set article_number = barcode
where (article_number is null or article_number = '')
  and barcode is not null;

alter table products alter column article_number set not null;

drop index if exists products_article_number_unique;
create unique index if not exists products_article_number_unique on products(article_number);

alter table import_items add column if not exists article_number text;

update import_items
set article_number = barcode
where (article_number is null or article_number = '')
  and barcode is not null;

alter table import_items alter column article_number set not null;

alter table import_items drop column if exists barcode;
alter table products drop column if exists barcode;

commit;
