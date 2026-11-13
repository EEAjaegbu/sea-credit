# Offline package validation

`package.schema.json` is adapted from https://json.schemastore.org/package
(retrieved 2026-11-13). The upstream license is included in LICENSE.txt.

The package.json `$schema` points here so the editor does not need to contact
SchemaStore to validate the package file. JSON validation remains enabled.
The upstream remote `$id` and optional third-party tool configuration properties
with external schema references are removed to keep validation self-contained.
Those optional embedded tool configurations are not validated by this copy.

After pulling this update into StackBlitz, reload the editor if it still shows
the previous network warning. No Supabase SQL changes are needed.
