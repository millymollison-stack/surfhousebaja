-- Allow authenticated users to upload images to the onboarding bucket
CREATE POLICY "allow_auth_insert_onboarding"
ON storage.objects FOR INSERT
TO authenticated
USING (bucket_id = 'onboarding')
WITH CHECK (bucket_id = 'onboarding');

-- Allow authenticated users to read from the onboarding bucket
CREATE POLICY "allow_auth_select_onboarding"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'onboarding');

-- Allow public read access to uploaded images in onboarding bucket
CREATE POLICY "allow_public_read_onboarding"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'onboarding');