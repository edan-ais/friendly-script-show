
-- Shared Prompter video bank: any authenticated user can read/write/delete
-- objects under `_shared/prompter-clips/` in the `media` bucket.

CREATE POLICY "media_shared_bank_select"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'media'
  AND (storage.foldername(name))[1] = '_shared'
  AND (storage.foldername(name))[2] = 'prompter-clips'
);

CREATE POLICY "media_shared_bank_insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'media'
  AND (storage.foldername(name))[1] = '_shared'
  AND (storage.foldername(name))[2] = 'prompter-clips'
);

CREATE POLICY "media_shared_bank_update"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'media'
  AND (storage.foldername(name))[1] = '_shared'
  AND (storage.foldername(name))[2] = 'prompter-clips'
);

CREATE POLICY "media_shared_bank_delete"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'media'
  AND (storage.foldername(name))[1] = '_shared'
  AND (storage.foldername(name))[2] = 'prompter-clips'
);
