
-- Storage policies for product-images bucket
CREATE POLICY "Authed read product images" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'product-images');
CREATE POLICY "Authed upload product images" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'product-images');
CREATE POLICY "Authed update product images" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'product-images');
CREATE POLICY "Authed delete product images" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'product-images');

-- Lock down SECURITY DEFINER helpers
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
