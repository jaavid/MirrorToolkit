# Mirrors

Add or remove mirror entries in `mirrors.json` by category (`docker`, `python`, `node`, `java`, `ubuntu`, `debian`).

Validation rules:
- each item requires `name`, `url`, `kind`
- `security_url` is optional for ubuntu/debian
- unknown categories are kept in report as `unknown_categories`
